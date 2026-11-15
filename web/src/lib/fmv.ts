import { DOLLAR_COINS, META } from "./assets";
import { getQuotes } from "./prices-server";

export type Fmv = { usdPerUnit: number; source: string; asOf: number } | { error: string };

const cache = new Map<string, { at: number; body: Fmv }>();

/** The point in `pts` ([ms, price]) nearest to `tMs`, if it is within `windowMs`. */
export function nearest(pts: [number, number][], tMs: number, windowMs = 3_600_000): [number, number] | null {
  let best: [number, number] | null = null;
  for (const p of pts) if (!best || Math.abs(p[0] - tMs) < Math.abs(best[0] - tMs)) best = p;
  return best && Math.abs(best[0] - tMs) <= windowMs ? best : null;
}

/**
 * USD fair market value of one unit of `symbol` at unix time `t` (seconds), for donation receipts.
 * Dollar coins are pegged at $1. Everything else is the real asset's CoinGecko price nearest to `t`, within an hour.
 * A gift from the last few minutes, before CoinGecko has a point for it, uses the current price and says so.
 * Never guesses: if there is no price, the answer is an error and the receipt says "unavailable".
 */
export async function fmvAt(symbol: string, t: number): Promise<Fmv> {
  const m = META[symbol];
  if (!m) return { error: "unknown asset" };
  if (DOLLAR_COINS.includes(symbol)) return { usdPerUnit: 1, source: "Pegged to the US dollar", asOf: t };
  const key = `${symbol}:${Math.floor(t / 300)}`;
  const hit = cache.get(key);
  if (hit && ("usdPerUnit" in hit.body || Date.now() - hit.at < 60_000)) return hit.body;
  let body: Fmv = { error: "unavailable" };
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${m.cg}/market_chart/range?vs_currency=usd&from=${t - 3600}&to=${t + 3600}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as { prices?: [number, number][] };
    const p = Array.isArray(data.prices) ? nearest(data.prices, t * 1000) : null;
    if (p) body = { usdPerUnit: p[1], source: `CoinGecko, ${m.name} (${m.cg})`, asOf: Math.round(p[0] / 1000) };
  } catch {}
  if ("error" in body && Date.now() / 1000 - t < 900) {
    const q = (await getQuotes())[symbol];
    if (q?.price) body = { usdPerUnit: q.price, source: `CoinGecko, ${m.name} (${m.cg}), price when the gift was made`, asOf: Math.round(Date.now() / 1000) };
  }
  // A live answer for a recent gift is refined later by CoinGecko's own point, so keep it only briefly.
  cache.set(key, { at: Date.now(), body });
  return body;
}
