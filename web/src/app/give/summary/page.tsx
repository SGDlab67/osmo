"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, HeartHandshake } from "lucide-react";
import { loadDonor } from "@/lib/donor";
import { META, unitsLabel, usd } from "@/lib/assets";
import { config } from "@/lib/config";
import { receiptId } from "@/lib/charities";
import { useNow, useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { WirePayment } from "@/lib/state";
import { BackHeader, Screen } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { CharityLogo, GiveNote } from "@/components/charity-ui";
import { DonorBlock, NETWORK_NAME, utc } from "@/components/donation-receipt";

type Fmv = { usdPerUnit: number; source: string; asOf: number } | { error: string };
const testnet = config.chainId !== 143;

export default function SummaryPage() {
  const ok = useRequireAccount();
  const { me, charityOf } = useStore();
  const [gifts, setGifts] = useState<WirePayment[] | null>(null);
  const [complete, setComplete] = useState(true);
  const [fmv, setFmv] = useState<Record<string, Fmv>>({});
  const now = useNow();
  const thisYear = now ? new Date(now).getFullYear() : 0;
  const [picked, setYear] = useState<number | null>(null);
  const year = picked ?? thisYear;

  useEffect(() => {
    if (!me) return;
    let alive = true;
    fetch(`/api/donations?from=${me.handle}`)
      .then((r) => r.json())
      .then((d: { donations?: WirePayment[]; complete?: boolean }) => {
        if (!alive) return;
        setGifts(d.donations ?? []);
        setComplete(d.complete !== false);
        for (const g of d.donations ?? [])
          fetch(`/api/fmv?symbol=${g.symbol}&t=${Math.floor(g.time / 1000)}`)
            .then((r) => r.json())
            .then((f: Fmv) => alive && setFmv((m) => ({ ...m, [g.id]: f })))
            .catch(() => alive && setFmv((m) => ({ ...m, [g.id]: { error: "unavailable" } })));
      })
      .catch(() => alive && setGifts([]));
    return () => {
      alive = false;
    };
  }, [me]);

  const years = useMemo(() => [...new Set([thisYear, ...(gifts ?? []).map((g) => new Date(g.time).getFullYear())])].filter(Boolean).sort((a, b) => b - a), [gifts, thisYear]);
  const inYear = (gifts ?? []).filter((g) => new Date(g.time).getFullYear() === year && charityOf(g.to));
  const valueOf = (g: WirePayment) => {
    const f = fmv[g.id];
    return f && "usdPerUnit" in f ? f.usdPerUnit * g.units : null;
  };
  const groups = useMemo(() => {
    const m = new Map<string, WirePayment[]>();
    for (const g of inYear) m.set(g.to, [...(m.get(g.to) ?? []), g]);
    return [...m.entries()].map(([handle, list]) => ({ c: charityOf(handle)!, list, total: list.reduce((a, g) => a + (valueOf(g) ?? 0), 0) })).sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inYear.length, fmv, year]);
  const total = groups.reduce((a, x) => a + x.total, 0);
  const deductible = groups.filter((x) => x.c.deductible).reduce((a, x) => a + x.total, 0);
  const missing = inYear.filter((g) => fmv[g.id] && valueOf(g) === null).length;
  const pending = inYear.some((g) => !fmv[g.id]);

  const csv = () => {
    const head = ["date_utc", "organization", "ein", "irs_status", "deductible", "asset", "units", "usd_per_unit", "usd_fair_market_value", "price_source", "price_as_of_utc", "network", "block", "transaction", "receipt_id", "note"];
    const rows = inYear.map((g) => {
      const c = charityOf(g.to)!;
      const f = fmv[g.id];
      const okF = f && "usdPerUnit" in f ? f : null;
      const logIndex = Number(g.id.split("-").pop());
      return [utc(g.time), c.legalName, c.ein, c.status, c.deductible ? "yes" : "no", g.symbol, String(g.units), okF ? okF.usdPerUnit.toFixed(4) : "", okF ? (okF.usdPerUnit * g.units).toFixed(2) : "", okF?.source ?? "unavailable", okF ? utc(okF.asOf * 1000) : "", NETWORK_NAME, g.block, g.hash, receiptId(g.hash, logIndex), g.note];
    });
    const text = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `osmo-giving-${year}.csv`;
    a.click();
  };

  const pdf = async () => {
    const { summaryPdf, downloadPdf } = await import("@/lib/pdf");
    const bytes = await summaryPdf({
      year,
      testnet,
      handle: me!.handle,
      wallet: me!.address,
      made: now ? new Date(now).toLocaleDateString() : "",
      total: usd(total),
      deductible: usd(deductible),
      donor: loadDonor(),
      groups: groups.map(({ c, list, total: sub }) => ({
        legalName: c.legalName,
        ein: c.ein,
        status: c.status,
        deductible: c.deductible,
        subtotal: usd(sub),
        gifts: list.map((g) => {
          const v = valueOf(g);
          return { date: new Date(g.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), asset: `${unitsLabel(g.units, g.symbol)} (${META[g.symbol]?.name ?? g.symbol})`, value: v !== null ? usd(v) : "no price", hash: g.hash };
        }),
      })),
      notes: [
        "Each gift is valued at the real asset's price nearest the moment it was given (CoinGecko; dollar coins at $1).",
        "Gifts of digital assets are non-cash gifts: over $500 a year goes on Form 8283, and gifts of $250 or more need the charity's written acknowledgment.",
        ...(missing ? [`${missing} gift(s) had no price from the source and are left out of the totals.`] : []),
        "Generated by Osmo from the public blockchain. Not tax advice.",
      ],
    });
    downloadPdf(bytes, `osmo-giving-${year}.pdf`);
  };

  if (!ok || !me) return <Screen tabs={false}>{null}</Screen>;

  return (
    <Screen tabs={false}>
      <BackHeader title="Tax summary" fallback="/give" />
      <div className="px-4 pb-6">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {years.map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold ${y === year ? "bg-ink text-white" : "bg-white"}`}>
              {y}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className="rounded-[28px] bg-white p-5">
            {testnet && <p className="-mx-5 -mt-5 mb-4 rounded-t-[28px] bg-[#FBEFD9] px-5 py-2.5 text-center text-[12px] font-semibold text-[#9A6412]">Testnet demo. Not a tax document: no real money moved.</p>}
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">Charitable giving summary</p>
            <p className="mt-0.5 text-[22px] font-semibold leading-tight">Tax year {year}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              @{me.handle} · {me.address.slice(0, 6)}…{me.address.slice(-4)} · made {now ? new Date(now).toLocaleDateString() : ""}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-chip p-3.5">
                <p className="text-[12px] text-muted">Total given</p>
                <p className="tabular mt-0.5 text-[24px] font-semibold tracking-tight">{gifts === null || pending ? "…" : usd(total)}</p>
                <p className="text-[12px] text-muted">
                  {inYear.length} {inYear.length === 1 ? "gift" : "gifts"} to {groups.length} {groups.length === 1 ? "organization" : "organizations"}
                </p>
              </div>
              <div className="rounded-2xl bg-[#E3F2E9] p-3.5">
                <p className="text-[12px] text-money">To 501(c)(3) charities</p>
                <p className="tabular mt-0.5 text-[24px] font-semibold tracking-tight text-money">{gifts === null || pending ? "…" : usd(deductible)}</p>
                <p className="text-[12px] text-money/80">Potentially deductible</p>
              </div>
            </div>

            {groups.map(({ c, list, total: sub }) => (
              <div key={c.handle} className="mt-5">
                <div className="flex items-center gap-3">
                  <CharityLogo handle={c.handle} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{c.legalName}</p>
                    <p className="text-[12px] text-muted">
                      EIN {c.ein} · {c.status} · {c.deductible ? "deductible" : "not deductible"}
                    </p>
                  </div>
                  <p className="tabular text-[16px] font-semibold">{usd(sub)}</p>
                </div>
                <div className="mt-2 divide-y divide-line rounded-2xl border border-line">
                  {list.map((g) => {
                    const v = valueOf(g);
                    return (
                      <Link key={g.id} href={`/p/${g.hash}#receipt`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]">
                        <span>
                          <span className="font-semibold">{new Date(g.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          <span className="block text-muted">
                            {unitsLabel(g.units, g.symbol)} ({META[g.symbol]?.name ?? g.symbol}) · {g.hash.slice(0, 10)}…
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-semibold">{v !== null ? usd(v) : fmv[g.id] ? "No price" : "…"}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {gifts !== null && inYear.length === 0 && <EmptyState icon={HeartHandshake} title={`No gifts in ${year} yet`} text="Gifts you make through Give show up here with their value on the day you gave." action={{ label: "Find a charity", href: "/give" }} />}

            <div className="mt-5 border-t border-line pt-4">
              <DonorBlock />
            </div>
            <p className="mt-4 text-[12px] leading-snug text-muted">
              Valued at each asset&apos;s price the moment you gave. Every line links to its receipt. Not tax advice.
              {missing > 0 && ` ${missing} gift${missing === 1 ? " has" : "s have"} no price and ${missing === 1 ? "is" : "are"} left out of the totals.`}
              {!complete && " Shows the most recent 500 payments on Osmo."}
            </p>
          </div>
        </div>

        {inYear.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" onClick={pdf} disabled={pending} className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-white disabled:opacity-40">
              <Download size={17} /> Download PDF
            </button>
            <button type="button" onClick={csv} disabled={pending} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold disabled:opacity-40">
              <Download size={17} /> CSV
            </button>
          </div>
        )}
        <Link href="/give" className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-brand">
          <FileText size={17} /> Give to a charity
        </Link>
        <GiveNote />
      </div>
    </Screen>
  );
}
