"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { MARKETS, META, usd, type Market } from "@/lib/assets";
import { useStore } from "@/lib/store";
import { MiniLine } from "@/components/chart";
import { BackHeader, Screen } from "@/components/shell";
import { AssetDot, Card, Change } from "@/components/ui";

type Filter = "all" | Market;
type Sort = "movers" | "price" | "name";
const SORTS: { id: Sort; label: string }[] = [
  { id: "movers", label: "Biggest moves" },
  { id: "price", label: "Price" },
  { id: "name", label: "A to Z" },
];

/** Remount on every new link so the filter matches it. */
export function Markets() {
  const params = useSearchParams();
  return <MarketsInner key={params.toString()} start={params.get("m")} />;
}

function MarketsInner({ start }: { start: string | null }) {
  const { prices } = useStore();
  const [filter, setFilter] = useState<Filter>(MARKETS.some((m) => m.id === start) ? (start as Market) : "all");
  const [sort, setSort] = useState<Sort>("movers");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const all = Object.keys(META);
  const ch = (s: string) => prices[s]?.change ?? 0;
  const list = all
    .filter((s) => filter === "all" || META[s].market === filter)
    .filter((s) => !q || META[s].name.toLowerCase().includes(q) || s.toLowerCase().includes(q))
    .sort((a, b) => (sort === "movers" ? Math.abs(ch(b)) - Math.abs(ch(a)) : sort === "price" ? (prices[b]?.price ?? 0) - (prices[a]?.price ?? 0) : META[a].name.localeCompare(META[b].name)));
  const movers = all.filter((s) => META[s].market !== "cash").sort((a, b) => Math.abs(ch(b)) - Math.abs(ch(a))).slice(0, 6);

  return (
    <Screen>
      <BackHeader title="Markets" fallback="/portfolio" />
      <div className="px-4">
        <div className="flex items-center gap-2 rounded-2xl bg-brand-soft px-4 py-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-money opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-money" />
          </span>
          <p className="text-[14px] leading-snug text-brand">
            <span className="font-semibold">Open 24/7.</span> Everything here trades on-chain, so buys and sells fill and settle in under a second on Monad, nights and weekends too.
          </p>
        </div>
        <label className="mt-3 flex h-12 items-center gap-2 rounded-full bg-white px-4">
          <Search size={18} className="text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stocks, crypto, gold…" className="w-full bg-transparent text-[16px] outline-none placeholder:text-muted" />
        </label>
      </div>

      {!q && filter === "all" && (
        <div className="pt-5">
          <p className="px-5 pb-2 text-[15px] font-semibold">Moving today</p>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1">
            {movers.map((s) => (
              <Link key={s} href={`/asset/${s}`} className="w-[132px] shrink-0 rounded-[22px] bg-white p-3.5">
                <AssetDot symbol={s} size={34} />
                <p className="mt-2 truncate text-[15px] font-semibold">{META[s].name}</p>
                <p className="font-mono text-[13px] text-muted">{prices[s] ? usd(prices[s].price) : "…"}</p>
                <Change pct={ch(s)} className="mt-1 block text-[13px] font-semibold" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="sticky top-14 z-20 bg-page/95 pt-4 backdrop-blur">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          {([{ id: "all", label: "All" }, ...MARKETS] as { id: Filter; label: string }[]).map((m) => (
            <button key={m.id} type="button" aria-pressed={filter === m.id} onClick={() => setFilter(m.id)} className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold ${filter === m.id ? "bg-ink text-white" : "bg-white text-ink"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-[13px] text-muted">
            {list.length} {list.length === 1 ? "market" : "markets"}
          </p>
          <div className="flex gap-1">
            {SORTS.map((x) => (
              <button key={x.id} type="button" onClick={() => setSort(x.id)} className={`h-8 rounded-full px-3 text-[13px] font-semibold ${sort === x.id ? "bg-chip text-ink" : "text-muted"}`}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <Card className="divide-y divide-line !px-4 py-1">
          {list.map((s) => (
            <Link key={s} href={`/asset/${s}`} className="flex items-center gap-3 py-3">
              <AssetDot symbol={s} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{META[s].name}</span>
                <span className="block text-[13px] text-muted">{s}</span>
              </span>
              <MiniLine series={prices[s]?.spark} up={ch(s) >= 0} />
              <span className="w-[84px] text-right">
                <span className="block font-mono text-[14px] font-semibold">{prices[s] ? usd(prices[s].price) : "…"}</span>
                <Change pct={ch(s)} className="block text-[12px] font-semibold" />
              </span>
            </Link>
          ))}
          {list.length === 0 && <p className="py-6 text-center text-[15px] text-muted">Nothing matches “{query}”.</p>}
        </Card>
        <p className="px-2 pt-3 text-center text-[12px] leading-snug text-muted">Test tokens on Monad testnet that follow real prices. Prices and 7-day lines live from CoinGecko.</p>
      </div>
    </Screen>
  );
}
