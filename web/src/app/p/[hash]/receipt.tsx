"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { decodeEventLog, formatEther, formatUnits } from "viem";
import { ArrowUpRight, Check, Copy, SearchX } from "lucide-react";
import { registryAbi, osmoAbi } from "@/lib/abi";
import { META, unitsLabel, usd } from "@/lib/assets";
import { publicClient, scanTxUrl } from "@/lib/chain";
import { config } from "@/lib/config";
import { PRIVATE_MARK } from "@/lib/feed";
import { useStore } from "@/lib/store";
import { BackHeader, Screen } from "@/components/shell";
import { AssetDot, Avatar, Card, Flag, SectionTitle } from "@/components/ui";
import { DonationReceipt } from "@/components/donation-receipt";

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
  logIndex: number;
  fromWallet: string;
}

export function Receipt({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const { tokens, prices, personOf, charityOf } = useStore();
  const [r, setR] = useState<R | null>(null);
  const [copied, setCopied] = useState(false);
  const [missing, setMissing] = useState<"" | "notfound" | "notpayment">("");
  useEffect(() => {
    if (!tokens.length) return;
    let alive = true;
    (async () => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return setMissing("notfound");
      // A payment made a moment ago can take a beat to show up on every RPC node, so retry a few times.
      let rc = null;
      for (let i = 0; i < 6 && !rc && alive; i++) {
        rc = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
        if (!rc) await new Promise((res) => setTimeout(res, 800));
      }
      if (!alive) return;
      if (!rc) return setMissing("notfound");
      let found = false;
      const blk = await publicClient.getBlock({ blockNumber: rc.blockNumber });
      for (const log of rc.logs) {
        if (log.address.toLowerCase() !== config.osmo.toLowerCase()) continue;
        const ev = decodeEventLog({ abi: osmoAbi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Sent") continue;
        const t = tokens.find((x) => x.address.toLowerCase() === ev.args.token.toLowerCase());
        const from = await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [ev.args.from] });
        const isPrivate = ev.args.memo.startsWith(PRIVATE_MARK);
        found = true;
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
          logIndex: log.logIndex ?? 0,
          fromWallet: ev.args.from,
        });
      }
      if (!found) setMissing("notpayment");
    })().catch(() => alive && setMissing("notfound"));
    return () => {
      alive = false;
    };
  }, [hash, tokens]);

  if (!r)
    return (
      <Screen tabs={false}>
        <BackHeader title="Payment" />
        {missing ? (
          <div className="flex flex-col items-center px-8 pt-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
              <SearchX size={24} />
            </span>
            <p className="mt-3 text-[17px] font-semibold">{missing === "notfound" ? "Couldn't find this payment" : "This isn't an Osmo payment"}</p>
            <p className="mt-1 text-[14px] text-muted">{missing === "notfound" ? "It may still be on its way, or the link is wrong." : "The transaction exists, but it didn't send anything through Osmo."}</p>
            {/^0x[0-9a-fA-F]{64}$/.test(hash) && (
              <a href={scanTxUrl(hash)} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-[15px] font-semibold text-brand">
                Look it up on MonadScan <ArrowUpRight size={16} />
              </a>
            )}
          </div>
        ) : (
          <div className="px-4 pt-2">
            <div className="flex flex-col items-center">
              <span className="h-16 w-28 animate-pulse rounded-full bg-chip" />
              <span className="mt-4 h-5 w-48 animate-pulse rounded-full bg-chip" />
              <span className="mt-3 h-10 w-32 animate-pulse rounded-full bg-chip" />
            </div>
            <div className="mt-8 h-[300px] animate-pulse rounded-[28px] bg-white" />
          </div>
        )}
      </Screen>
    );
  const value = r.units * (prices[r.symbol]?.price ?? 0);
  const org = charityOf(r.to);
  const rows: [string, string][] = [
    ["Status", "Settled"],
    ["Sent", `${unitsLabel(r.units, r.symbol)} (${META[r.symbol]?.name ?? r.symbol})`],
    ["Worth now", usd(value)],
    ["When", new Date(r.time).toLocaleString()],
    ["Network", config.chainId === 10143 ? "Monad testnet" : config.chainId === 143 ? "Monad" : "Local test chain"],
    ["Network fee", `${r.feeMon.toFixed(4)} MON`],
    ["Block", r.block.toString()],
  ];
  return (
    <Screen tabs={false}>
      <BackHeader title={org ? "Gift" : "Payment"} />
      <div className="px-4 pb-10">
        <div className="flex flex-col items-center pt-2 text-center">
          <div className="flex items-center -space-x-3">
            <Avatar handle={r.from} size={64} ring />
            <Avatar handle={r.to} size={64} ring />
          </div>
          <p className="mt-4 text-[18px]">
            <Link href={`/u/${r.from}`} className="font-semibold">{personOf(r.from).name}</Link> <Flag code={personOf(r.from).country} /> {org ? "gave to" : "paid"}{" "}
            {org ? (
              <Link href={`/give/${r.to}`} className="font-semibold">{org.name}</Link>
            ) : (
              <>
                <Link href={`/u/${r.to}`} className="font-semibold">{personOf(r.to).name}</Link> <Flag code={personOf(r.to).country} />
              </>
            )}
          </p>
          <p className="tabular mt-2 flex items-center gap-2 text-[40px] font-semibold tracking-tight">
            <AssetDot symbol={r.symbol} size={36} /> {usd(value)}
          </p>
          {r.note && <p className="mt-1 text-[17px]">{r.note}</p>}
          {r.isPrivate && <p className="mt-1 text-[13px] text-muted">Private in the app. The chain itself is public.</p>}
        </div>
        <SectionTitle>Transaction details</SectionTitle>
        <Card className="divide-y divide-line !py-1">
          {rows.map(([k, v]) => (
            <p key={k} className="flex justify-between gap-4 py-3 text-[15px]">
              <span className="text-muted">{k}</span>
              <span className="text-right font-semibold">{v}</span>
            </p>
          ))}
          <p className="flex justify-between gap-4 py-3 text-[15px]">
            <span className="text-muted">Transaction</span>
            <span className="font-mono text-[14px] font-semibold">
              {hash.slice(0, 8)}…{hash.slice(-6)}
            </span>
          </p>
          <a href={scanTxUrl(hash)} target="_blank" rel="noreferrer" className="-mx-5 flex items-center gap-3 rounded-b-[28px] px-5 py-3.5 active:bg-chip">
            <AssetDot symbol="MON" size={34} />
            <span className="flex-1">
              <span className="block text-[16px] font-semibold text-brand">View on MonadScan</span>
              <span className="block text-[13px] text-muted">See this payment on the Monad blockchain</span>
            </span>
            <ArrowUpRight size={20} className="text-brand" />
          </a>
        </Card>
        {org && <DonationReceipt c={org} g={{ hash, logIndex: r.logIndex, fromHandle: r.from, fromWallet: r.fromWallet, symbol: r.symbol, units: r.units, block: r.block, time: r.time, note: r.note }} />}
        <div className="no-print mt-4">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(location.href);
              setCopied(true);
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </Screen>
  );
}
