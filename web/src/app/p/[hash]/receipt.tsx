"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { decodeEventLog, formatEther, formatUnits } from "viem";
import { Check, Copy } from "lucide-react";
import { registryAbi, osmoAbi } from "@/lib/abi";
import { META, unitsLabel, usd } from "@/lib/assets";
import { publicClient, txUrl } from "@/lib/chain";
import { config } from "@/lib/config";
import { PRIVATE_MARK } from "@/lib/feed";
import { useStore } from "@/lib/store";
import { BackHeader, Screen } from "@/components/shell";
import { AssetDot, Avatar, Card, Flag } from "@/components/ui";

interface R {
  from: string;
  to: string;
  symbol: string;
  units: number;
  note: string;
  isPrivate: boolean;
  block: bigint;
  time: number;
  feeMon: number;
}

export function Receipt({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const { tokens, prices, personOf } = useStore();
  const [r, setR] = useState<R | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!tokens.length) return;
    (async () => {
      const rc = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` });
      const blk = await publicClient.getBlock({ blockNumber: rc.blockNumber });
      for (const log of rc.logs) {
        if (log.address.toLowerCase() !== config.osmo.toLowerCase()) continue;
        const ev = decodeEventLog({ abi: osmoAbi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Sent") continue;
        const t = tokens.find((x) => x.address.toLowerCase() === ev.args.token.toLowerCase());
        const from = await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [ev.args.from] });
        const isPrivate = ev.args.memo.startsWith(PRIVATE_MARK);
        setR({
          from: from.toLowerCase(),
          to: ev.args.name.toLowerCase(),
          symbol: t?.symbol ?? "?",
          units: Number(formatUnits(ev.args.value, t?.decimals ?? 18)),
          note: isPrivate ? ev.args.memo.slice(PRIVATE_MARK.length) : ev.args.memo,
          isPrivate,
          block: rc.blockNumber,
          time: Number(blk.timestamp) * 1000,
          feeMon: Number(formatEther(rc.gasUsed * rc.effectiveGasPrice)),
        });
      }
    })().catch(() => {});
  }, [hash, tokens]);

  if (!r) return (
    <Screen tabs={false}>
      <BackHeader title="Payment" />
      <p className="px-6 pt-10 text-center text-muted">Loading from Monad…</p>
    </Screen>
  );
  const value = r.units * (prices[r.symbol]?.price ?? 0);
  const rows: [string, string][] = [
    ["Status", "Settled"],
    ["Sent", `${unitsLabel(r.units, r.symbol)} (${META[r.symbol]?.name ?? r.symbol})`],
    ["Worth now", usd(value)],
    ["When", new Date(r.time).toLocaleString()],
    ["Network", "Monad testnet"],
    ["Network fee", `${r.feeMon.toFixed(4)} MON`],
    ["Block", r.block.toString()],
  ];
  return (
    <Screen tabs={false}>
      <BackHeader title="Payment" />
      <div className="px-4 pb-10">
        <div className="flex flex-col items-center pt-2 text-center">
          <div className="flex items-center -space-x-3">
            <Avatar handle={r.from} size={64} ring />
            <Avatar handle={r.to} size={64} ring />
          </div>
          <p className="mt-4 text-[18px]">
            <Link href={`/u/${r.from}`} className="font-semibold">{personOf(r.from).name}</Link> <Flag code={personOf(r.from).country} /> paid{" "}
            <Link href={`/u/${r.to}`} className="font-semibold">{personOf(r.to).name}</Link> <Flag code={personOf(r.to).country} />
          </p>
          <p className="tabular mt-2 flex items-center gap-2 text-[40px] font-semibold tracking-tight">
            <AssetDot symbol={r.symbol} size={36} /> {usd(value)}
          </p>
          {r.note && <p className="mt-1 text-[17px]">{r.note}</p>}
          {r.isPrivate && <p className="mt-1 text-[13px] text-muted">Private in the app. The chain itself is public.</p>}
        </div>
        <Card className="mt-6 divide-y divide-line !py-1">
          {rows.map(([k, v]) => (
            <p key={k} className="flex justify-between gap-4 py-3 text-[15px]">
              <span className="text-muted">{k}</span>
              <span className="text-right font-semibold">{v}</span>
            </p>
          ))}
        </Card>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(location.href);
              setCopied(true);
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
          </button>
          <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-full bg-white text-[15px] font-semibold text-brand">
            Explorer
          </a>
        </div>
      </div>
    </Screen>
  );
}
