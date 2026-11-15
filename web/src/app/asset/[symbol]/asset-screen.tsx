"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { MARKETS, META, unitsLabel, usd } from "@/lib/assets";
import { useStore } from "@/lib/store";
import { BackHeader, Screen } from "@/components/shell";
import { AssetDot, Card } from "@/components/ui";

function Line({ pts, up }: { pts: number[]; up: boolean }) {
  if (pts.length < 2) return <div className="h-[160px]" />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const band = Math.max(max - min, max * 0.01);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * 100).toFixed(2)},${(100 - ((p - min) / band) * 92 - 4).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[160px] w-full">
      <path d={d} fill="none" stroke={up ? "#2b8a57" : "#c8433a"} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AssetScreen({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const { prices, balances } = useStore();
  const m = META[symbol];
  const q = prices[symbol];
  const [pts, setPts] = useState<number[]>([]);
  useEffect(() => {
    fetch(`/api/chart?symbol=${symbol}`).then((r) => r.json()).then(setPts).catch(() => {});
  }, [symbol]);
  if (!m) return null;
  const held = balances[symbol] ?? 0;
  const week = pts.length > 1 ? (pts[pts.length - 1] / pts[0] - 1) * 100 : 0;
  return (
    <Screen>
      <BackHeader title={symbol} />
      <div className="px-4">
        <div className="flex items-center gap-3 px-1">
          <AssetDot symbol={symbol} size={52} />
          <div>
            <p className="text-[22px] font-semibold tracking-tight">{m.name}</p>
            <p className="text-[14px] text-muted">
              {MARKETS.find((x) => x.id === m.market)?.label} · {symbol} · open 24/7
            </p>
          </div>
        </div>
        <p className="tabular mt-5 px-1 text-[44px] font-semibold leading-none tracking-tight">{q ? usd(q.price) : "…"}</p>
        {q && m.market !== "cash" && (
          <p className={`tabular mt-2 px-1 text-[15px] font-semibold ${q.change >= 0 ? "text-money" : "text-down"}`}>
            {q.change >= 0 ? "+" : ""}
            {q.change.toFixed(2)}% today · {week >= 0 ? "+" : ""}
            {week.toFixed(2)}% this week
          </p>
        )}
        <Card className="mt-4 !px-2 !py-4">
          <Line pts={pts} up={week >= 0} />
          <p className="px-3 pt-1 text-[12px] text-muted">Last 7 days, live from CoinGecko</p>
        </Card>
        {held > 0 && (
          <Card className="mt-3 flex items-center justify-between">
            <span className="text-[15px] text-muted">You hold</span>
            <span className="text-right">
              <span className="tabular block text-[18px] font-semibold">{usd(held * (q?.price ?? 0))}</span>
              <span className="block text-[13px] text-muted">{unitsLabel(held, symbol)}</span>
            </span>
          </Card>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {symbol !== "MON" ? (
            <Link href={`/buy?asset=${symbol}`} className="flex h-14 items-center justify-center rounded-full bg-white text-[17px] font-semibold">
              Buy
            </Link>
          ) : (
            <span className="flex h-14 items-center justify-center rounded-full bg-white text-[14px] text-muted">From the faucet</span>
          )}
          <Link href={held > 0 ? `/pay?asset=${symbol}` : `/buy?asset=${symbol}`} className="flex h-14 items-center justify-center rounded-full bg-brand text-[17px] font-semibold text-white">
            Send some
          </Link>
        </div>
        <p className="px-1 pt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">About</p>
        <p className="px-1 pt-1 text-[15px] leading-relaxed">{m.about}</p>
        {symbol !== "MON" && <p className="px-1 pb-8 pt-3 text-[12px] text-muted">On this testnet it is a test token priced at the real market price. It has no cash value.</p>}
      </div>
    </Screen>
  );
}
