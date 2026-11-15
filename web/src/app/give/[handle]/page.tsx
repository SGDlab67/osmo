"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronLeft, Delete, FileText, Globe, Lock, X } from "lucide-react";
import { META, unitsLabel, usd } from "@/lib/assets";
import { scanTxUrl } from "@/lib/chain";
import { useRequireAccount } from "@/lib/hooks";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { Charity } from "@/lib/charities";
import { BackHeader, Screen } from "@/components/shell";
import { Confetti } from "@/components/confetti";
import { AssetDot, Avatar, Card, PrimaryButton, SectionTitle, Sheet, ago } from "@/components/ui";
import { CharityLogo, GiveNote, TaxPill, VerifiedTick } from "@/components/charity-ui";
import { shortName } from "@/components/feed-card";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
const PRESETS = [5, 10, 25, 50, 100];
const NOTE_MAX = 60;
type Done = { ms: number; hash: string; units: number; symbol: string; usd: number; feeMon: number };

function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes("InsufficientBalance")) return "Not enough of that asset.";
  if (/insufficient (funds|balance)|missing or invalid parameters/i.test(m)) return "Your wallet needed more MON for gas. We just topped it up: tap again.";
  return m.split("\n")[0].slice(0, 120);
}


/** Give to one charity: amount, what to give, confirm, done. One Osmo send to the charity's username. */
function GiveFlow({ c, onClose }: { c: Charity; onClose: () => void }) {
  const router = useRouter();
  const { balances, prices, spendable, pay } = useStore();
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [shake, setShake] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [asset, setAsset] = useState<string | null>(null);
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const value = Number(amount) || 0;

  const choices = useMemo(
    () =>
      Object.keys(balances)
        .filter((s) => s !== "MON")
        .map((s) => ({ symbol: s, units: spendable(s), value: spendable(s) * (prices[s]?.price ?? 0) }))
        .filter((x) => x.units > 0)
        .sort((a, b) => Number(b.value + 0.005 >= value) - Number(a.value + 0.005 >= value) || b.value - a.value),
    [balances, prices, value, spendable],
  );

  const press = (k: string) => {
    let next = amount;
    if (k === "del") next = amount.length > 1 ? amount.slice(0, -1) : "0";
    else if (k === ".") next = amount.includes(".") ? amount : amount + ".";
    else if (/\.\d\d$/.test(amount) || amount.replace(".", "").length >= 6) next = amount;
    else next = amount === "0" ? k : amount + k;
    if (next === amount && k !== "del") {
      setShake(true);
      setTimeout(() => setShake(false), 320);
    }
    setAmount(next);
  };

  const give = async () => {
    if (!asset) return;
    setBusy(true);
    setError("");
    try {
      const r = await pay({ to: c.handle, usd: value, symbol: asset, note, isPrivate });
      setDone({ ms: r.ms, hash: r.hash, units: r.units, symbol: asset, usd: value, feeMon: r.feeMon });
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const wrap = "fixed inset-0 z-40 mx-auto flex max-w-[430px] flex-col bg-white min-[820px]:absolute";

  if (done)
    return (
      <div className={`${wrap} px-6 pb-8`}>
        <Confetti />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative">
            <CharityLogo handle={c.handle} size={84} />
            <span className="pop absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-money text-white ring-4 ring-white">
              <Check size={20} strokeWidth={3} />
            </span>
          </div>
          <p className="mt-6 text-[24px] font-semibold leading-tight tracking-tight text-muted">
            <span className="text-ink">You</span> gave <span className="text-ink">{usd(done.usd, false)}</span> to <span className="text-ink">{c.name}</span>
          </p>
          <p className="mt-3 max-w-[300px] text-[15px] leading-snug text-muted">
            You gave {unitsLabel(done.units, done.symbol)}. Thank you.
          </p>
          <p className="mt-3 text-[15px] font-semibold text-brand">
            Settled on Monad in <span className="tabular">{done.ms} ms</span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Network fee {done.feeMon.toFixed(4)} MON, under 1¢</p>
          <div className="mt-8 w-full">
            <PrimaryButton
              onClick={() => {
                onClose();
                router.push("/");
              }}
            >
              Done
            </PrimaryButton>
            <div className="mt-3 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => {
                  // Close the flow before leaving, so Back from the receipt lands on the charity page, not mid-flow.
                  onClose();
                  router.push(`/p/${done.hash}#receipt`);
                }}
                className="flex h-11 items-center gap-1.5 text-[15px] font-semibold text-brand"
              >
                <FileText size={16} /> See your receipt
              </button>
              <a href={scanTxUrl(done.hash)} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-1 text-[15px] font-semibold text-brand">
                MonadScan <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </div>
    );

  const pick = choices.find((x) => x.symbol === asset);
  if (asset && pick)
    return (
      <div className={`${wrap} px-5 pb-8`}>
        <div className="-mx-2 flex h-14 items-center justify-between">
          <button type="button" aria-label="Back" onClick={() => setAsset(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-chip">
            <ChevronLeft size={22} />
          </button>
          <span className="text-[17px] font-semibold">Confirm your gift</span>
          <span className="w-10" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative">
            <CharityLogo handle={c.handle} size={88} />
            <span className="absolute -bottom-1 -right-2 rounded-full ring-4 ring-white">
              <AssetDot symbol={asset} size={36} />
            </span>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[20px] font-semibold">
            {c.name} <VerifiedTick size={18} />
          </p>
          <p className="tabular mt-3 text-[64px] font-semibold leading-none tracking-tight">{usd(value, false)}</p>
          <span className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-chip pl-1 pr-3.5 text-[15px] font-semibold">
            <AssetDot symbol={asset} size={28} />
            {unitsLabel(value / (prices[asset]?.price || 1), asset)}
          </span>
          {note && <p className="mt-4 text-[17px]">{note}</p>}
          <div className="mt-5">
            <TaxPill c={c} />
          </div>
          <div className="mt-4 inline-flex rounded-full bg-chip p-1 font-semibold">
            {([[false, "Public"], [true, "Private"]] as const).map(([v, label]) => (
              <button key={label} type="button" onClick={() => setPrivate(v)} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] ${isPrivate === v ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
                {v ? <Lock size={14} strokeWidth={2.2} /> : <Globe size={14} strokeWidth={2.2} />}
                {label}
              </button>
            ))}
          </div>
          <p className="mt-4 max-w-[300px] text-[13px] leading-snug text-muted">You&apos;ll get a receipt with the charity&apos;s EIN and the value on the day you gave.</p>
        </div>
        {error && <p className="mb-3 text-center text-[14px] text-down">{error}</p>}
        <PrimaryButton disabled={busy} onClick={give}>
          {busy ? "Giving…" : `Give ${usd(value, false)}`}
        </PrimaryButton>
        <button type="button" onClick={() => { setAsset(null); setChoosing(true); }} className="mt-3 text-[15px] font-semibold text-brand">
          Give something else
        </button>
      </div>
    );

  const size = amount.length > 6 ? 58 : amount.length > 4 ? 66 : 76;
  return (
    <div className={wrap}>
      <div className="flex h-14 items-center justify-between px-3">
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-chip">
          <X size={20} />
        </button>
        <span className="text-[17px] font-semibold">Give</span>
        <span className="w-10" />
      </div>
      <div className="flex flex-col items-center px-6 pt-1">
        <CharityLogo handle={c.handle} size={60} />
        <p className="mt-2.5 flex items-center gap-1.5 text-center text-[18px] font-semibold leading-tight">
          {c.name} <VerifiedTick size={16} />
        </p>
        <div className={`tabular mt-4 flex items-start justify-center font-semibold tracking-tight ${shake ? "shake" : ""}`}>
          <span className="mt-2 text-[28px]">$</span>
          <span className={`leading-none ${value ? "text-ink" : "text-line"}`} style={{ fontSize: size }}>
            {amount}
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setAmount(String(p))} className={`h-9 rounded-full px-3.5 text-[14px] font-semibold ${value === p ? "bg-ink text-white" : "bg-chip"}`}>
              ${p}
            </button>
          ))}
        </div>
        <label className="mt-4 flex min-h-12 w-full items-center rounded-2xl border border-line px-4">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} placeholder="Add a note (optional)" className="w-full bg-transparent py-2.5 text-[16px] outline-none placeholder:text-muted" />
        </label>
        {error && <p className="mt-3 text-[14px] text-down">{error}</p>}
      </div>
      <div className="mt-auto px-4 pb-6 pt-3">
        <PrimaryButton disabled={!value} onClick={() => setChoosing(true)}>
          Choose what to give
        </PrimaryButton>
        <div className="mt-2 grid grid-cols-3">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)} aria-label={k === "del" ? "Delete" : undefined} className="flex h-13 items-center justify-center text-[26px] font-medium active:bg-chip">
              {k === "del" ? <Delete size={26} /> : k}
            </button>
          ))}
        </div>
      </div>

      <Sheet open={choosing} onClose={() => setChoosing(false)} title={`Give ${usd(value, false)} as…`}>
        <p className="-mt-2 mb-3 text-[14px] leading-snug text-muted">{c.name} gets exactly what you pick. Giving stock or crypto you&apos;ve held over a year can save you capital gains tax.</p>
        {(["other", "cash"] as const).map((g) => {
          const list = choices.filter((x) => (g === "cash" ? META[x.symbol]?.market === "cash" : META[x.symbol]?.market !== "cash"));
          if (!list.length) return null;
          return (
            <div key={g} className="mb-3">
              <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted">{g === "cash" ? "Stablecoins" : "Stocks, crypto & gold"}</p>
              <div className="space-y-2">
                {list.map((x) => {
                  const enough = x.value + 0.005 >= value;
                  return (
                    <button key={x.symbol} type="button" disabled={!enough} onClick={() => { setAsset(x.symbol); setChoosing(false); }} className="flex w-full items-center gap-3 rounded-2xl bg-chip p-3 text-left active:bg-brand-soft disabled:opacity-35">
                      <AssetDot symbol={x.symbol} size={40} />
                      <span className="flex-1">
                        <span className="block text-[16px] font-semibold">{META[x.symbol]?.name ?? x.symbol}</span>
                        <span className="block text-[13px] text-muted">{enough ? unitsLabel(x.units, x.symbol) : "Not enough for this gift"}</span>
                      </span>
                      <span className="font-mono text-[15px] font-semibold">{usd(x.value)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {choices.length === 0 && <p className="py-4 text-center text-muted">Nothing to give yet. Add money first.</p>}
      </Sheet>
    </div>
  );
}

function CharityPage() {
  const ok = useRequireAccount();
  const { handle } = useParams<{ handle: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { me, charityOf, charities, feed, canSee, prices, personOf } = useStore();
  const now = useNow();
  const [giving, setGiving] = useState(sp.get("give") === "1");
  // "?give=1" opens the flow once; the address bar goes back to the plain charity page so Back never reopens it.
  useEffect(() => {
    if (sp.get("give") === "1") router.replace(`/give/${handle}`, { scroll: false });
  }, [sp, router, handle]);
  const c = charityOf(handle);
  if (!ok || !me) return <Screen tabs={false}>{null}</Screen>;
  if (!c)
    return (
      <Screen tabs={false}>
        <BackHeader title="Give" fallback="/give" />
        <p className="px-8 pt-16 text-center text-muted">{charities.length ? "This charity isn't on the verified list." : "Loading…"}</p>
      </Screen>
    );

  const gifts = feed.filter((p) => p.to === c.handle && canSee(p));
  const city = c.address.split(",").slice(-2).join(",").replace(/\s\d{5}(-\d{4})?$/, "").trim();
  const canGive = c.verified && c.detailsOk;
  const facts: [string, React.ReactNode][] = [
    ["EIN", <span key="ein" className="font-mono">{c.ein}</span>],
    ["Based in", city],
    ...(c.founded ? ([["Founded", String(c.founded)]] as [string, string][]) : []),
    ["Website", <a key="w" href={`https://${c.site}`} target="_blank" rel="noreferrer" className="text-brand">{c.site}</a>],
  ];

  return (
    <Screen tabs={false}>
      <BackHeader title="" fallback="/give" />
      <div className="px-4 pb-28">
        <div className="flex flex-col items-center text-center">
          <CharityLogo handle={c.handle} size={88} ring />
          <h1 className="mt-4 flex items-center justify-center gap-1.5 text-[22px] font-semibold leading-tight tracking-tight">
            {c.name} {c.detailsOk && <VerifiedTick size={22} />}
          </h1>
          <p className="mt-1 text-[14px] text-muted">{c.category}</p>
          <p className="mt-4 text-[17px] font-medium leading-snug">{c.mission}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.about}</p>
        </div>

        <p className={`mt-4 rounded-2xl px-4 py-3 text-center text-[13px] leading-snug ${c.deductible ? "bg-[#E3F2E9] text-money" : "bg-[#FBEFD9] text-[#9A6412]"}`}>
          {c.deductible ? "Tax-deductible. You get a receipt with a PDF for every gift." : `Not tax-deductible: ${c.name} is a ${c.status} advocacy group. You still get a receipt.`}
        </p>

        <SectionTitle>About</SectionTitle>
        <Card className="divide-y divide-line !py-1">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3 text-[15px]">
              <span className="shrink-0 text-muted">{k}</span>
              <span className="text-right font-semibold">{v}</span>
            </div>
          ))}
        </Card>

        <SectionTitle>Recent gifts</SectionTitle>
        <Card className="!p-0">
          {gifts.slice(0, 6).map((p) => (
            <Link key={p.id} href={`/p/${p.hash}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <Avatar handle={p.from} size={36} />
              <span className="flex-1 text-[15px]">
                <span className="font-semibold">{p.from === me.handle ? "You" : shortName(personOf(p.from).name)}</span>
                <span className="block text-[12px] text-muted">{now ? `${ago(p.time, now)} ago` : ""}</span>
              </span>
              <AssetDot symbol={p.symbol} size={22} />
              <span className="tabular text-[15px] font-semibold">{usd(p.units * (prices[p.symbol]?.price ?? 0))}</span>
            </Link>
          ))}
          {gifts.length === 0 && <p className="px-4 py-5 text-center text-[14px] text-muted">Be the first to give through Osmo.</p>}
        </Card>
        <GiveNote />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] bg-gradient-to-t from-page via-page to-transparent px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-6 min-[820px]:absolute">
        <PrimaryButton disabled={!canGive} onClick={() => setGiving(true)}>
          {canGive ? `Give to ${shortName(c.name).length > 24 ? "this charity" : shortName(c.name)}` : "Not available"}
        </PrimaryButton>
      </div>
      {giving && canGive && (
        <GiveFlow
          c={c}
          onClose={() => setGiving(false)}
        />
      )}
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CharityPage />
    </Suspense>
  );
}
