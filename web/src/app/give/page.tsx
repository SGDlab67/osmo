"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, HeartHandshake, Search, TrendingUp } from "lucide-react";
import { usd } from "@/lib/assets";
import { CHARITY_CATEGORIES, FEATURED } from "@/lib/charities";
import { useNow, useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { BackHeader, Screen } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { CharityLogo, GiveNote, TaxPill, VerifiedTick } from "@/components/charity-ui";

export default function GivePage() {
  const ok = useRequireAccount();
  const { me, charities, prices } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [given, setGiven] = useState<{ usd: number; n: number } | null>(null);
  const now = useNow();
  const thisYear = now ? new Date(now).getFullYear() : 0;

  // This year's giving, for the summary card. Valued at today's prices here; the summary uses each gift's own day.
  useEffect(() => {
    if (!me) return;
    let alive = true;
    fetch(`/api/donations?from=${me.handle}`)
      .then((r) => r.json())
      .then((d: { donations?: { units: number; symbol: string; time: number }[] }) => {
        if (!alive || !d.donations) return;
        const year = new Date().getFullYear();
        const mine = d.donations.filter((g) => new Date(g.time).getFullYear() === year);
        setGiven({ n: mine.length, usd: mine.reduce((a, g) => a + g.units * (prices[g.symbol]?.price ?? 0), 0) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [me, prices]);

  const listed = charities.filter((c) => c.verified);
  const featured = listed.find((c) => c.handle === FEATURED);
  const cats = useMemo(() => ["All", ...CHARITY_CATEGORIES.filter((k) => listed.some((c) => c.category === k))], [listed]);
  const term = q.trim().toLowerCase();
  const shown = listed.filter(
    (c) => (cat === "All" || c.category === cat) && (!term || c.name.toLowerCase().includes(term) || c.legalName.toLowerCase().includes(term) || c.category.toLowerCase().includes(term) || c.ein.includes(term)),
  );

  if (!ok || !me) return <Screen tabs={false}>{null}</Screen>;

  return (
    <Screen tabs={false}>
      <BackHeader title="Give" fallback="/" />
      <div className="px-4 pb-4">
        {featured && !term && cat === "All" && (
          <div className="fade-up overflow-hidden rounded-[28px] bg-[#0F2C4D] p-5 text-[#F3EEE5]">
            <div className="flex items-center gap-3">
              <CharityLogo handle={featured.handle} size={56} />
              <div className="min-w-0">
                <span className="inline-flex h-6 items-center rounded-full bg-white/12 px-2.5 text-[11px] font-semibold uppercase tracking-wide">Featured</span>
                <p className="mt-1 flex items-center gap-1.5 text-[20px] font-semibold leading-tight">
                  {featured.name} <VerifiedTick size={18} />
                </p>
              </div>
            </div>
            <p className="mt-3 text-[15px] leading-snug text-[#F3EEE5]/85">{featured.mission}</p>
            <div className="mt-4 flex gap-2.5">
              <Link href={`/give/${featured.handle}?give=1`} className="flex h-12 flex-1 items-center justify-center rounded-full bg-[#F3EEE5] text-[16px] font-semibold text-[#0F2C4D]">
                Give
              </Link>
              <Link href={`/give/${featured.handle}`} className="flex h-12 flex-1 items-center justify-center rounded-full bg-white/12 text-[16px] font-semibold">
                Learn more
              </Link>
            </div>
            {!featured.deductible && <p className="mt-3 text-[12px] text-[#F3EEE5]/60">A {featured.status} advocacy group, so gifts are not tax-deductible.</p>}
          </div>
        )}

        {!term && cat === "All" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-[22px] bg-white p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand">
                <TrendingUp size={18} />
              </span>
              <p className="mt-2 text-[15px] font-semibold leading-tight">Give stocks or crypto</p>
              <p className="mt-1 text-[12px] leading-snug text-muted">Held over a year? You can usually deduct the full value and skip capital gains tax.</p>
            </div>
            <Link href="/give/summary" className="flex flex-col rounded-[22px] bg-white p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand">
                <FileText size={18} />
              </span>
              <p className="mt-2 text-[15px] font-semibold leading-tight">Tax summary</p>
              <p className="mt-1 text-[12px] leading-snug text-muted">
                {given && given.n > 0 ? (
                  <>
                    <span className="tabular font-semibold text-ink">{usd(given.usd)}</span> given in {thisYear} across {given.n} {given.n === 1 ? "gift" : "gifts"}
                  </>
                ) : (
                  "Every gift gets a receipt for your accountant."
                )}
              </p>
            </Link>
          </div>
        )}

        <label className="mt-4 flex h-12 items-center gap-2.5 rounded-full bg-white px-4">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search charities or EIN" className="w-full bg-transparent text-[16px] outline-none placeholder:text-muted" />
        </label>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {cats.map((k) => (
            <button key={k} type="button" onClick={() => setCat(k)} className={`h-9 shrink-0 rounded-full px-3.5 text-[14px] font-semibold ${cat === k ? "bg-ink text-white" : "bg-white text-ink"}`}>
              {k}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-[28px] bg-white">
          {shown.map((c) => (
            <Link key={c.handle} href={`/give/${c.handle}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 active:bg-chip">
              <CharityLogo handle={c.handle} size={50} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[16px] font-semibold">
                  <span className="truncate">{c.name}</span> {c.detailsOk && <VerifiedTick size={15} />}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                  {c.category} <TaxPill c={c} small />
                </span>
              </span>
              <ChevronRight size={18} className="text-line" />
            </Link>
          ))}
          {shown.length === 0 && (
            <EmptyState icon={HeartHandshake} title={listed.length ? "No charity by that name" : "Charities are loading"} text={listed.length ? "Try another name, a cause, or an EIN." : "The verified list comes from Monad."} />
          )}
        </div>
        <GiveNote />
      </div>
    </Screen>
  );
}
