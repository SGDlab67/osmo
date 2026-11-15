import { DOLLAR_COINS, META } from "./assets";

export type Quotes = Record<string, { price: number; change: number; spark?: number[] }>;

const FALLBACK: Record<string, number> = {
  NVDA: 160.2, TSLA: 386.2, AAPL: 357.1, GOOGL: 291.7, AMZN: 263.1, META: 634.7, MSFT: 522.5, NFLX: 61.7, COIN: 118.7, CRCL: 58,
  PAXG: 3836, XAUT: 3828, KAG: 48.5, USDY: 1.15, BUIDL: 1, BTC: 64600, ETH: 1814, SOL: 71.2, MON: 0.0154,
  USDC: 1, USDT: 1, PYUSD: 1, DAI: 1, EURC: 1.1,
};

let cached: { at: number; body: Quotes } | null = null;

/** Live prices from CoinGecko, cached for a minute in memory. Dollar coins are pinned to $1. */
export async function getQuotes(): Promise<Quotes> {
  if (cached && Date.now() - cached.at < 60_000) return cached.body;
  const ids = Object.values(META).map((m) => m.cg).join(",");
  const out: Quotes = {};
  let live = false;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&ids=${ids}`, { cache: "no-store" });
    const rows: { id: string; current_price: number; price_change_percentage_24h: number | null; sparkline_in_7d?: { price: number[] } }[] = await res.json();
    for (const [symbol, m] of Object.entries(META)) {
      const r = rows.find((x) => x.id === m.cg);
      if (r) live = true;
      const pinned = DOLLAR_COINS.includes(symbol);
      out[symbol] = {
        price: pinned ? 1 : (r?.current_price ?? FALLBACK[symbol]),
        change: pinned ? 0 : (r?.price_change_percentage_24h ?? 0),
        spark: pinned ? [1, 1] : r?.sparkline_in_7d?.price?.filter((_, i, a) => i % 6 === 0 || i === a.length - 1),
      };
    }
  } catch {
    for (const symbol of Object.keys(META)) out[symbol] = { price: FALLBACK[symbol], change: 0 };
  }
  if (live) cached = { at: Date.now(), body: out };
  return out;
}
