"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownToLine, ChevronRight, Eye, EyeOff, Plus, Send } from "lucide-react";
import { MARKETS, META, usd } from "@/lib/assets";
import { addressUrl } from "@/lib/chain";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { RANGE_WORDS, RangeTabs, Sparkline, resample, useHistory, type Range } from "@/components/chart";
import { Screen } from "@/components/shell";
import { AssetRow } from "@/components/asset-row";
import { Card, Change, DemoNote, SectionTitle } from "@/components/ui";
import { GROUPS, groupOf } from "@/lib/groups";

const MASK = "$•••••";

export default function PortfolioPage() {
  const ok = useRequireAccount();
  const { account, balances, prices, totalUsd, hideBalances, toggleHideBalances } = useStore();
  const [range, setRange] = useState<Range>("1D");
  const [scrub, setScrub] = useState<number | null>(null);

  const held = Object.entries(balances)
    .filter(([s, n]) => n > 0 && META[s] && (s !== "MON" || n > 0.0001))
    .map(([s, n]) => ({ s, n, value: n * (prices[s]?.price ?? 0) }))
    .sort((a, b) => b.value - a.value);
  const history = useHistory(held.map((h) => h.s), range);
  // What today's holdings were worth across the range, from live price history.
  const series = useMemo(() => {
    const lines = held.map((h) => resample(history[h.s] ?? [], 48).map((v) => v * h.n)).filter((l) => l.length === 48);
    if (!lines.length) return [];
    const out = Array.from({ length: 48 }, (_, i) => lines.reduce((a, l) => a + l[i], 0));
    out[47] = totalUsd;
    return out;
  }, [history, held, totalUsd]);
  const rest = Object.keys(META)
    .filter((s) => !held.some((h) => h.s === s) && META[s].market !== "cash")
    .sort((a, b) => Math.abs(prices[b]?.change ?? 0) - Math.abs(prices[a]?.change ?? 0));

  if (!ok || !account) return null;
  const point = scrub !== null && scrub < series.length ? scrub : null;
  const shown = point !== null ? series[point] : totalUsd;
  const first = series[0] ?? totalUsd;
  const changeUsd = shown - first;
  const changePct = first ? (changeUsd / first) * 100 : 0;
  const up = changeUsd >= 0;
  const mix = GROUPS.map((g) => ({ ...g, value: held.filter((h) => groupOf(h.s) === g.id).reduce((a, h) => a + h.value, 0) })).filter((g) => g.value > 0);

  return (
    <Screen>
      <div className="px-5 pt-8">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-medium text-muted">Portfolio</p>
          <div className="flex items-center gap-2">
            <Link href="/buy" className="flex h-10 items-center gap-1 rounded-full bg-brand px-4 text-[15px] font-semibold text-white">
              <Plus size={17} strokeWidth={2.5} /> Buy
            </Link>
            <button type="button" onClick={toggleHideBalances} aria-label={hideBalances ? "Show amounts" : "Hide amounts"} aria-pressed={hideBalances} className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
              {hideBalances ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </div>
        <p className="mt-1 text-[46px] font-semibold leading-none tracking-tight tabular-nums">{hideBalances ? MASK : usd(shown)}</p>
        <p className="mt-2 text-[15px] font-semibold">
          <span className={up ? "text-money" : "text-down"}>
            {!hideBalances && `${up ? "+" : "−"}${usd(Math.abs(changeUsd))} `}
            {hideBalances ? <Change pct={changePct} /> : `(${Math.abs(changePct).toFixed(2)}%)`}
          </span>{" "}
          <span className="font-medium text-muted">{point !== null && point < series.length - 1 ? "earlier" : RANGE_WORDS[range]}</span>
        </p>
      </div>
      <div className="px-4 pt-4">
        {series.length > 1 ? <Sparkline series={series} up={up} height={130} scrub={point} onScrub={setScrub} /> : <div className="h-[130px]" />}
        <RangeTabs
          active={range}
          onChange={(r) => {
            setRange(r);
            setScrub(null);
          }}
        />
        <p className="pt-1 text-center text-[12px] text-muted">What you hold now, at real market prices over time. Drag along it to see a past value.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pt-4">
        {[
          { href: "/buy?asset=USDC", label: "Add money", icon: <ArrowDownToLine size={20} /> },
          { href: "/buy", label: "Buy", icon: <Plus size={20} /> },
          { href: "/pay", label: "Send", icon: <Send size={19} /> },
        ].map((x) => (
          <Link key={x.label} href={x.href} className="flex flex-col items-center gap-1.5 rounded-[20px] bg-white py-3 text-[13px] font-semibold">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">{x.icon}</span>
            {x.label}
          </Link>
        ))}
      </div>

      {mix.length > 0 && (
        <div className="px-4 pt-5">
          <Card>
            <p className="text-[14px] font-medium text-muted">What you hold</p>
            <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
              {mix.map((g) => (
                <span key={g.id} style={{ background: g.color, flexGrow: g.value, flexBasis: 0, minWidth: 6 }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {mix.map((g) => (
                <span key={g.id} className="flex items-center gap-1.5 text-[13px]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                  <span className="font-medium">{g.short}</span>
                  <span className="font-mono font-semibold">{Math.round((g.value / (totalUsd || 1)) * 100)}%</span>
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="px-4">
        {GROUPS.map((g) => {
          const rows = held.filter((h) => groupOf(h.s) === g.id);
          if (!rows.length) return null;
          return (
            <div key={g.id} id={g.id}>
              <SectionTitle
                right={
                  <span className="flex items-center gap-3">
                    {g.id === "cash" && (
                      <Link href="/buy?asset=USDC" className="hit text-[13px] font-semibold text-brand">
                        + Add
                      </Link>
                    )}
                    <span className="tabular text-[13px] font-semibold text-muted">{hideBalances ? MASK : usd(rows.reduce((a, h) => a + h.value, 0))}</span>
                  </span>
                }
              >
                {g.title}
              </SectionTitle>
              <Card className="divide-y divide-line py-1">
                {rows.map((h) => (
                  <AssetRow key={h.s} symbol={h.s} units={h.n} hidden={hideBalances} />
                ))}
              </Card>
            </div>
          );
        })}

        <SectionTitle
          right={
            <Link href="/markets" className="hit text-[14px] font-semibold text-brand">
              See all
            </Link>
          }
        >
          Markets · open 24/7
        </SectionTitle>
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {MARKETS.map((m) => (
            <Link key={m.id} href={`/markets?m=${m.id}`} className="flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-[14px] font-semibold">
              {m.label}
            </Link>
          ))}
        </div>
        <Card className="divide-y divide-line py-1">
          {rest.slice(0, 5).map((s) => (
            <AssetRow key={s} symbol={s} />
          ))}
          <Link href="/markets" className="flex h-12 items-center justify-center gap-1 text-[15px] font-semibold text-brand">
            See all {Object.keys(META).length} markets <ChevronRight size={16} />
          </Link>
        </Card>
        <a href={addressUrl(account.address)} target="_blank" rel="noreferrer" className="mt-2 flex h-11 items-center justify-center gap-1 text-[13px] text-muted">
          Wallet {account.address.slice(0, 6)}…{account.address.slice(-4)} on Monad <ChevronRight size={14} />
        </a>
      </div>
      <DemoNote />
    </Screen>
  );
}
