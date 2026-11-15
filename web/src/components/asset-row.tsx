"use client";

import Link from "next/link";
import { META, unitsLabel, usd } from "@/lib/assets";
import { useStore } from "@/lib/store";
import { AssetDot, Change } from "./ui";

const MASK = "$•••••";

export function AssetRow({ symbol, units, hidden = false }: { symbol: string; units?: number; hidden?: boolean }) {
  const { prices } = useStore();
  const q = prices[symbol];
  const price = q?.price ?? 0;
  return (
    <Link href={`/asset/${symbol}`} className="flex items-center gap-3 py-3">
      <AssetDot symbol={symbol} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold">{META[symbol]?.name ?? symbol}</span>
        <span className="block text-[14px] text-muted">{units === undefined ? symbol : hidden ? `••• ${symbol}` : unitsLabel(units, symbol)}</span>
      </span>
      <span className="text-right">
        <span className="block font-mono text-[16px] font-semibold">{units !== undefined && hidden ? MASK : usd(units !== undefined ? units * price : price)}</span>
        <Change pct={q?.change ?? 0} className="text-[13px] font-medium" />
      </span>
    </Link>
  );
}
