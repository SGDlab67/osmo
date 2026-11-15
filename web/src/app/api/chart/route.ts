import { DOLLAR_COINS, META } from "@/lib/assets";

const cache = new Map<string, { at: number; body: number[] }>();

/** Price history from CoinGecko for charts: days=1, 7 or 30. Cached ten minutes. Dollar coins draw flat at $1. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "";
  const days = ["1", "7", "30"].includes(url.searchParams.get("days") ?? "") ? url.searchParams.get("days")! : "7";
  const m = META[symbol];
  if (!m) return Response.json([], { status: 404 });
  if (DOLLAR_COINS.includes(symbol)) return Response.json(Array(48).fill(1));
  const key = `${symbol}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return Response.json(hit.body);
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${m.cg}/market_chart?vs_currency=usd&days=${days}`, { cache: "no-store" });
    const j: { prices?: [number, number][] } = await r.json();
    const pts = (j.prices ?? []).map((p) => p[1]);
    if (pts.length) cache.set(key, { at: Date.now(), body: pts });
    return Response.json(pts);
  } catch {
    return Response.json(hit?.body ?? []);
  }
}
