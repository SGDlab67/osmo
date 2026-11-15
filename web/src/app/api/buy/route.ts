import { erc20Abi, welcomeAbi } from "@/lib/abi";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toRaw } from "@/lib/assets";
import { config } from "@/lib/config";
import { publicClient, walletFor } from "@/lib/chain";
import { allow, tooMany } from "@/lib/guard";
import { getQuotes } from "@/lib/prices-server";

/**
 * The simulated Buy: no real money moves. The app's relayer mints the test asset to the buyer through
 * Welcome.grant. Capped at $100 a purchase so the demo can't be drained.
 */
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const msg = /429|rate limit/i.test(m) ? "Monad is busy right now. Try again in a few seconds." : /fetch failed|timeout|ECONN/i.test(m) ? "Couldn't reach Monad just now. Try again in a few seconds." : m.split("\n")[0].slice(0, 160);
    return Response.json({ error: msg }, { status: 503 });
  }
}

async function handle(req: Request) {
  if (!allow("buy", 60)) return tooMany();
  const key = process.env.RELAYER_KEY as `0x${string}` | undefined;
  if (!key) return Response.json({ error: "The server has no RELAYER_KEY set." }, { status: 500 });
  const { address, symbol, usd } = (await req.json().catch(() => ({}))) as { address?: string; symbol?: string; usd?: number };
  if (!address || !isAddress(address) || !symbol || !usd || usd <= 0 || usd > 100) return Response.json({ error: "Pick an asset and up to $100." }, { status: 400 });
  const token = await publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "assetBySymbol", args: [symbol] });
  if (token === "0x0000000000000000000000000000000000000000") return Response.json({ error: "That asset can't be bought here." }, { status: 400 });
  const [quotes, decimals] = await Promise.all([getQuotes(), publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" })]);
  const price = quotes[symbol]?.price;
  if (!price) return Response.json({ error: "No price yet." }, { status: 503 });
  try {
    const started = Date.now();
    const receipt = await walletFor(privateKeyToAccount(key)).writeContractSync({
      address: config.welcome,
      abi: welcomeAbi,
      functionName: "grant",
      args: [address, token, toRaw(usd / price, Number(decimals))],
    });
    return Response.json({ ok: receipt.status === "success", hash: receipt.transactionHash, units: usd / price, ms: Date.now() - started });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const msg = /insufficient funds/i.test(m) ? "The app's wallet is out of MON for gas. Top it up from the faucet." : m.split("\n")[0].slice(0, 160);
    return Response.json({ error: msg }, { status: 500 });
  }
}
