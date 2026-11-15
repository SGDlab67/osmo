"use client";

import Link from "next/link";
import { META, usd } from "@/lib/assets";
import { useStore } from "@/lib/store";
import { GROUPS, groupOf } from "@/lib/groups";
import { AssetDot, Card, Change } from "./ui";

/** A person's portfolio as others see it: total, today's move, the mix, and each holding as a share of the whole. */
export function PublicPortfolio({ balances, self = false }: { balances: Record<string, number>; self?: boolean }) {
  const { prices } = useStore();
  const rows = Object.entries(balances)
    .filter(([s]) => META[s])
    .map(([s, n]) => ({ s, value: n * (prices[s]?.price ?? 0) }))
    .filter((r) => r.value > 0.005)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((a, r) => a + r.value, 0);
  const change = total ? (rows.reduce((a, r) => a + r.value * ((prices[r.s]?.change ?? 0) / 100), 0) / total) * 100 : 0;
  const mix = GROUPS.map((g) => ({ ...g, value: rows.filter((r) => groupOf(r.s) === g.id).reduce((a, r) => a + r.value, 0) })).filter((m) => m.value > 0);
  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium text-muted">Total</p>
          <p className="text-[30px] font-semibold leading-tight tracking-tight tabular-nums">{usd(total)}</p>
        </div>
        <p className="text-right text-[14px]">
          <Change pct={change} className="font-semibold" />
          <span className="block text-[12px] text-muted">today</span>
        </p>
      </div>
      {mix.length > 0 && (
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
          {mix.map((m) => (
            <span key={m.id} style={{ width: `${(m.value / total) * 100}%`, background: m.color }} />
          ))}
        </div>
      )}
      <div className="mt-2 divide-y divide-line">
        {rows.map(({ s, value }) => (
          <Link key={s} href={`/asset/${s}`} className="flex items-center gap-3 py-2.5">
            <AssetDot symbol={s} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{META[s].name}</span>
              <span className="block text-[12px] text-muted">{s}</span>
            </span>
            <span className="text-right">
              <span className="block font-mono text-[14px] font-semibold">{self ? usd(value) : `${Math.max(1, Math.round((value / total) * 100))}%`}</span>
              <Change pct={prices[s]?.change ?? 0} className="block text-[12px] font-semibold" />
            </span>
          </Link>
        ))}
        {rows.length === 0 && <p className="py-3 text-[14px] text-muted">Nothing here yet.</p>}
      </div>
    </Card>
  );
}
