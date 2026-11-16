import { decodeEventLog, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi, welcomeAbi } from "@/lib/abi";
import { toRaw } from "@/lib/assets";
import { publicClient, walletFor } from "@/lib/chain";
import { config } from "@/lib/config";
import { allow, tooMany } from "@/lib/guard";
import { kv } from "@/lib/kv";
import { getQuotes } from "@/lib/prices-server";

const STABLES = new Set(["USDC", "USDT", "PYUSD", "DAI", "EURC"]);
const MAX_USD = 1000;
const usedHere = new Set<string>();

/**
 * Sell back to a stablecoin. The phone sends the asset to the Welcome contract (where it stays, out of circulation),
 * then posts the transaction hash here. The server checks that transfer on chain and pays out the dollar value at the
 * live price in the stablecoin asked for, through Welcome.grant. Each transfer pays out once.
 */
export async function POST(req: Request) {
  try {
    if (!allow("sell", 60)) return tooMany();
    const key = process.env.RELAYER_KEY as `0x${string}` | undefined;
    if (!key) return Response.json({ error: "The server has no RELAYER_KEY set." }, { status: 500 });
    const { hash, into = "USDC" } = (await req.json().catch(() => ({}))) as { hash?: string; into?: string };
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return Response.json({ error: "Send the transfer hash." }, { status: 400 });
    if (!STABLES.has(into)) return Response.json({ error: "Pick a stablecoin to sell into." }, { status: 400 });
    const id = `sold:${hash.toLowerCase()}`;
    if (usedHere.has(id) || (kv && (await kv.get(id)))) return Response.json({ error: "This sale was already paid out." }, { status: 409 });

    const receipt = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` });
    if (receipt.status !== "success") return Response.json({ error: "That transfer didn't go through." }, { status: 400 });
    let found: { token: `0x${string}`; from: `0x${string}`; value: bigint } | null = null;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        const a = ev.args as { from?: `0x${string}`; to?: `0x${string}`; value?: bigint };
        if (ev.eventName === "Transfer" && a.to?.toLowerCase() === config.welcome.toLowerCase() && a.from?.toLowerCase() === receipt.from.toLowerCase()) {
          found = { token: log.address, from: a.from, value: a.value ?? 0n };
          break;
        }
      } catch {
        // not a Transfer
      }
    }
    if (!found) return Response.json({ error: "No sale found in that transaction." }, { status: 400 });

    const [listed, symbol, decimals, payToken] = await Promise.all([
      publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "isAsset", args: [found.token] }),
      publicClient.readContract({ address: found.token, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address: found.token, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "assetBySymbol", args: [into] }),
    ]);
    if (!listed || STABLES.has(symbol)) return Response.json({ error: "That asset can't be sold here." }, { status: 400 });
    const quotes = await getQuotes();
    const price = quotes[symbol]?.price;
    if (!price) return Response.json({ error: "No price yet. Try again in a moment." }, { status: 503 });
    const units = Number(formatUnits(found.value, Number(decimals)));
    const usd = Math.min(MAX_USD, Math.floor(units * price * 100) / 100);
    if (usd <= 0) return Response.json({ error: "That's too small to sell." }, { status: 400 });

    usedHere.add(id);
    if (kv) await kv.set(id, "1");
    const payDecimals = await publicClient.readContract({ address: payToken, abi: erc20Abi, functionName: "decimals" });
    const started = Date.now();
    const paid = await walletFor(privateKeyToAccount(key)).writeContractSync({
      address: config.welcome,
      abi: welcomeAbi,
      functionName: "grant",
      args: [found.from, payToken, toRaw(usd, Number(payDecimals))],
    });
    return Response.json({ ok: paid.status === "success", hash: paid.transactionHash, usd, units, symbol, into, ms: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return Response.json({ error: /429|rate limit/i.test(m) ? "Monad is busy right now. Try again in a few seconds." : m.split("\n")[0].slice(0, 160) }, { status: 503 });
  }
}
