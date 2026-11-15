"use client";

import { useMemo } from "react";
import { META, usd } from "@/lib/assets";
import { config } from "@/lib/config";
import type { Payment } from "@/lib/feed";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { FeedCard, shortName } from "./feed-card";
import { AssetDot, Avatar, ago } from "./ui";

const NETWORK = config.chainId === 10143 ? "Monad testnet" : config.chainId === 143 ? "Monad" : "a local test chain";

/** A payment as the room sees it: names in the third person, the amount, the asset and the note. No buttons. */
function RoomCard({ p, hero = false }: { p: Payment; hero?: boolean }) {
  const { personOf, prices, charityOf } = useStore();
  const now = useNow();
  const value = p.units * (prices[p.symbol]?.price ?? 0);
  return (
    <div className={`fade-up flex items-center gap-4 rounded-[26px] bg-white ${hero ? "p-6 ring-2 ring-brand/30" : "p-4"}`}>
      <div className="flex shrink-0 -space-x-3">
        <Avatar handle={p.from} size={hero ? 64 : 44} ring />
        <Avatar handle={p.to} size={hero ? 64 : 44} ring />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`${hero ? "text-[30px]" : "text-[19px]"} font-medium leading-tight tracking-tight text-muted`}>
          <span className="font-semibold text-ink">{shortName(personOf(p.from).name)}</span> {charityOf(p.to) ? "gave to" : "paid"}{" "}
          <span className="font-semibold text-ink">{shortName(personOf(p.to).name)}</span>
          {p.note && (
            <>
              {" "}
              for <span className="font-semibold text-ink">{p.note}</span>
            </>
          )}
        </p>
        <p className={`${hero ? "mt-2 text-[16px]" : "mt-1 text-[13px]"} text-muted`}>
          {now ? ago(p.time, now) : ""} ago · block {p.block.toString()}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <AssetDot symbol={p.symbol} size={hero ? 48 : 34} />
        <div className="text-right">
          <p className={`tabular font-semibold tracking-tight ${hero ? "text-[34px]" : "text-[20px]"}`}>{usd(value)}</p>
          <p className={`${hero ? "text-[15px]" : "text-[12px]"} text-muted`}>{p.symbol === "USDC" ? "Dollars" : (META[p.symbol]?.name ?? p.symbol)}</p>
        </div>
      </div>
    </div>
  );
}

/** Live stats and every public payment as it lands. The projector (big) shows the room's view; the Live tab uses the normal feed cards. */
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
          <div key={k} className={`rounded-[22px] bg-white ${big ? "p-5" : "p-4"}`}>
            <p className={`${big ? "text-[14px]" : "text-[12px]"} font-semibold uppercase tracking-wide text-muted`}>{k}</p>
            <p className={`tabular mt-1 font-semibold tracking-tight ${big ? "text-[40px] leading-none" : "text-[22px]"}`}>{v}</p>
          </div>
        ))}
      </div>
      <p className={`flex items-center gap-2 px-1 pb-3 pt-6 font-semibold uppercase tracking-wide text-muted ${big ? "text-[15px]" : "text-[13px]"}`}>
        <span className="blink h-2.5 w-2.5 rounded-full bg-money" /> Live on {NETWORK}
      </p>
      {big ? (
        <div className="space-y-3">
          {pub[0] && <RoomCard key={pub[0].id} p={pub[0]} hero />}
          <div className="grid grid-cols-2 gap-3">
            {pub.slice(1, 9).map((p) => (
              <RoomCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pub.slice(0, 30).map((p) => (
            <FeedCard key={p.id} p={p} />
          ))}
        </div>
      )}
      {pub.length === 0 && <p className="rounded-[22px] bg-white p-6 text-center text-muted">Waiting for the first payment…</p>}
    </div>
  );
}
