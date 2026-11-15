"use client";

import { useMemo } from "react";
import { usd } from "@/lib/assets";
import { useStore } from "@/lib/store";
import { FeedCard } from "./feed-card";

/** Live stats and every public payment as it lands. Used by the Live tab and the projector screen. */
export function RoomView({ big = false }: { big?: boolean }) {
  const { feed, block, people, prices } = useStore();
  const pub = feed.filter((p) => !p.isPrivate);
  const moved = useMemo(() => feed.reduce((a, p) => a + p.units * (prices[p.symbol]?.price ?? 0), 0), [feed, prices]);
  const stats: [string, string][] = [
    ["Block", block ? `#${block.toString()}` : "…"],
    ["People", String(people.filter((p) => p.joined).length)],
    ["Payments", String(feed.length)],
    ["Value moved", usd(moved)],
  ];
  return (
    <div>
      <div className={`grid gap-2.5 ${big ? "grid-cols-4" : "grid-cols-2"}`}>
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-[22px] bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{k}</p>
            <p className={`tabular mt-1 font-semibold tracking-tight ${big ? "text-[32px]" : "text-[22px]"}`}>{v}</p>
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 px-1 pb-2 pt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">
        <span className="blink h-2.5 w-2.5 rounded-full bg-money" /> Live on Monad testnet
      </p>
      <div className={`space-y-2.5 ${big ? "grid grid-cols-2 gap-3 space-y-0" : ""}`}>
        {pub.slice(0, big ? 10 : 30).map((p) => (
          <FeedCard key={p.id} p={p} />
        ))}
        {pub.length === 0 && <p className="rounded-[22px] bg-white p-6 text-center text-muted">Waiting for the first payment…</p>}
      </div>
    </div>
  );
}
