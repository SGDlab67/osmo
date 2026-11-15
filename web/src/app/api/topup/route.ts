import { formatEther, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { welcomeAbi } from "@/lib/abi";
import { publicClient, walletFor } from "@/lib/chain";
import { config } from "@/lib/config";
import { allow, tooMany } from "@/lib/guard";
import { kv } from "@/lib/kv";

/** Top up when a member's wallet holds less than this, by this much. */
const BELOW = parseEther("0.06");
const AMOUNT = parseEther("0.2");
/** Per wallet per day, so one account can't drain the gas fund. */
const DAILY = 20;
const memory = new Map<string, number[]>();

/**
 * Gas for members who ran low: the relayer sends a little MON to a wallet that joined through Welcome. Nothing else
 * qualifies, small wallets only, a daily cap per wallet, and the same global rate guard as the other relayer routes.
 */
export async function POST(req: Request) {
  try {
    if (!allow("topup", 120)) return tooMany();
    const key = process.env.RELAYER_KEY as `0x${string}` | undefined;
    if (!key) return Response.json({ error: "The server has no RELAYER_KEY set." }, { status: 500 });
    const { address } = (await req.json().catch(() => ({}))) as { address?: string };
    if (!address || !isAddress(address)) return Response.json({ error: "Send a wallet address." }, { status: 400 });
    const a = address.toLowerCase() as `0x${string}`;

    const [member, bal] = await Promise.all([
      publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "welcomed", args: [a] }),
      publicClient.getBalance({ address: a }),
    ]);
    if (!member) return Response.json({ error: "Only Osmo members get gas." }, { status: 403 });
    if (bal >= BELOW) return Response.json({ ok: true, skipped: true, balance: formatEther(bal) });

    let used: number;
    if (kv) used = (await kv.hit(`topup:${a}`, 86_400))[0];
    else {
      const now = Date.now();
      const recent = (memory.get(a) ?? []).filter((t) => now - t < 86_400_000);
      recent.push(now);
      memory.set(a, recent);
      used = recent.length;
    }
    if (used > DAILY) return Response.json({ error: "This wallet has had its gas for today." }, { status: 429 });

    const receipt = await walletFor(privateKeyToAccount(key)).sendTransactionSync({ to: a, value: AMOUNT });
    return Response.json({ ok: true, hash: receipt.transactionHash, sent: formatEther(AMOUNT) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return Response.json({ error: /429|rate limit/i.test(m) ? "Monad is busy. Try again in a few seconds." : m.split("\n")[0].slice(0, 160) }, { status: 503 });
  }
}
