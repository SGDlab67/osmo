"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Delete, Globe, Lock, Plus, QrCode, Search, X } from "lucide-react";
import { registryAbi } from "@/lib/abi";
import { META, unitsLabel, usd } from "@/lib/assets";
import { publicClient, scanTxUrl } from "@/lib/chain";
import { config } from "@/lib/config";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { Confetti } from "@/components/confetti";
import { shortName } from "@/components/feed-card";
import { EVENT_TAG } from "@/lib/people";
import { AssetDot, Avatar, Flag, PrimaryButton, Sheet } from "@/components/ui";

const NOTE_EMOJI = ["🍕", "🍔", "🌮", "☕", "🍻", "🏠", "🚗", "⛽", "🎟️", "🎉", "🛒", "✈️", "💸", "🎂", "🏀"];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
type Done = { kind: "paid"; ms: number; hash: string; units: number; symbol: string; usd: number; to: string; feeMon: number } | { kind: "requested"; usd: number; to: string };

function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes("NoSuchName")) return "No one has that username yet.";
  if (m.includes("InsufficientBalance")) return "Not enough of that asset.";
  if (m.toLowerCase().includes("insufficient funds")) return "This wallet is out of MON for gas.";
  return m.split("\n")[0].slice(0, 120);
}

function PayPageFlow({ params }: { params: Record<string, string> }) {
  const ok = useRequireAccount();
  const router = useRouter();
  const { me, people, personOf, balances, prices, spendable, pay, request, feed, friends, charityOf } = useStore();
  const [toPicked, setTo] = useState<string | null>(null);
  const rawTo = (toPicked ?? params.to ?? "").toLowerCase();
  // You can't pay yourself; a link to your own code lands on the person picker instead.
  const to = me && rawTo === me.handle ? "" : rawTo;
  const [query, setQuery] = useState("");
  const [amountTyped, setAmount] = useState<string | null>(null);
  const amount = amountTyped ?? (params.amount || "0");
  const [noteTyped, setNote] = useState<string | null>(null);
  const note = noteTyped ?? params.note ?? "";
  const [shake, setShake] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [assetPicked, setAsset] = useState<string | null>(null);
  const asset = assetPicked ?? (params.asset && params.amount ? params.asset : null);
  const requestId = params.request ? Number(params.request) : undefined;
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const value = Number(amount) || 0;

  const recent = useMemo(() => {
    if (!me) return [];
    const out: string[] = [];
    for (const p of feed) {
      const o = p.from === me.handle ? p.to : p.to === me.handle ? p.from : null;
      if (o && !out.includes(o) && !charityOf(o)) out.push(o);
    }
    return out.slice(0, 8);
  }, [feed, me, charityOf]);

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const match = (p: { handle: string; name: string }) => !q || p.handle.includes(q) || p.name.toLowerCase().includes(q);
  const joined = people.filter((p) => p.joined && p.handle !== me?.handle && match(p));
  const notYet = people.filter((p) => !p.joined && match(p));

  const choices = useMemo(
    () =>
      Object.keys(balances)
        .map((s) => ({ symbol: s, units: spendable(s), value: spendable(s) * (prices[s]?.price ?? 0) }))
        .filter((c) => c.units > 0)
        .sort((a, b) => Number(b.value + 0.005 >= value) - Number(a.value + 0.005 >= value) || b.value - a.value),
    [balances, prices, value, spendable],
  );
  const firstTime = me && to && !feed.some((p) => p.from === me.handle && p.to === to);

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

  const pickTyped = async () => {
    setError("");
    const a = await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "resolve", args: [q] }).catch(() => null);
    if (me && q === me.handle) setError("That's you. Pick someone else to pay.");
    else if (!a || a === "0x0000000000000000000000000000000000000000") setError(`No one has @${q} yet.`);
    else setTo(q);
  };

  const send = async () => {
    if (!asset) return;
    setBusy(true);
    setError("");
    try {
      const r = await pay({ to, usd: value, symbol: asset, note, isPrivate, requestId });
      setDone({ kind: "paid", ms: r.ms, hash: r.hash, units: r.units, symbol: asset, usd: value, to, feeMon: r.feeMon });
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setBusy(true);
    setError("");
    try {
      await request([to], value, note);
      setDone({ kind: "requested", usd: value, to });
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  if (!ok || !me) return null;

  if (done) {
    const p = personOf(done.to);
    const reset = () => {
      setDone(null);
      setTo("");
      setAmount("0");
      setNote("");
      setAsset(null);
    };
    return (
      <div className="relative flex min-h-dvh flex-col bg-white px-6 pb-8 min-[820px]:min-h-full">
        {done.kind === "paid" && <Confetti />}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
          <span className="pop flex h-[72px] w-[72px] items-center justify-center rounded-full bg-money text-white">
            <Check size={36} strokeWidth={3} />
          </span>
          {done.kind === "paid" ? (
            <>
              <p className="mt-6 text-[24px] font-semibold leading-tight tracking-tight text-muted">
                <span className="text-ink">You</span> paid{" "}
                <span className="text-ink">
                  <span className="mr-1.5 inline-block align-[-0.15em]">
                    <Avatar handle={done.to} size={24} />
                  </span>
                  {shortName(p.name)} {usd(done.usd, false)}
                </span>
                {note && (
                  <>
                    {" "}
                    for <span className="text-ink">{note.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "")}</span>
                  </>
                )}
              </p>
              <p className="mt-3 max-w-[300px] text-[15px] leading-snug text-muted">
                You sent {unitsLabel(done.units, done.symbol)}. It&apos;s in {p.name.split(" ")[0]}&apos;s wallet now, to keep or sell.
              </p>
              <p className="mt-3 text-[15px] font-semibold text-brand">
                Settled on Monad in <span className="tabular">{done.ms} ms</span>
              </p>
              <p className="mt-0.5 text-[12px] text-muted">Network fee {done.feeMon.toFixed(4)} MON, under 1¢</p>
            </>
          ) : (
            <>
              <p className="mt-6 text-[24px] font-semibold leading-tight tracking-tight text-muted">
                <span className="text-ink">You</span> requested <span className="text-ink">{usd(done.usd, false)}</span> from{" "}
                <span className="text-ink">
                  <span className="mr-1.5 inline-block align-[-0.15em]">
                    <Avatar handle={done.to} size={24} />
                  </span>
                  {shortName(p.name)}
                </span>
              </p>
              <p className="mt-3 max-w-[300px] text-[15px] leading-snug text-muted">The request is on Monad. {p.name.split(" ")[0]} sees it on their Home screen.</p>
            </>
          )}
          <div className="mt-8 w-full">
            <PrimaryButton
              onClick={() => {
                reset();
                router.push("/");
              }}
            >
              Done
            </PrimaryButton>
            {done.kind === "paid" && (
              <div className="mt-3 flex items-center justify-center gap-6">
                <Link href={`/p/${done.hash}`} className="flex h-11 items-center text-[15px] font-semibold text-brand">
                  See the payment
                </Link>
                <a href={scanTxUrl(done.hash)} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-1 text-[15px] font-semibold text-brand">
                  MonadScan <ArrowUpRight size={16} />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 1: who
  if (!to) {
    const row = (h: string, disabled = false) => {
      const p = personOf(h);
      return (
        <li key={h}>
          <button
            type="button"
            onClick={() => (disabled ? setError(`${p.name.split(" ")[0]} hasn't joined yet. Show them your code.`) : setTo(h))}
            className={`flex w-full items-center gap-3 px-5 py-3 text-left active:bg-chip ${disabled ? "opacity-55" : ""}`}
          >
            <Avatar handle={h} size={48} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[17px] font-semibold">
                <span className="truncate">{p.name}</span> <Flag code={p.country} className="text-[15px]" />
              </span>
              <span className="block text-[15px] text-muted">{disabled ? "Not on Osmo yet" : `@${h}`}</span>
            </span>
            <ChevronRight size={18} className="text-line" />
          </button>
        </li>
      );
    };
    const friendRows = joined.filter((p) => friends.includes(p.handle));
    const moreRows = joined.filter((p) => !friends.includes(p.handle));
    const label = "px-5 pb-1 pt-6 text-[13px] font-semibold uppercase tracking-wide text-muted";
    return (
      <div className="min-h-dvh bg-white pb-8 min-[820px]:min-h-full">
        <div className="flex h-14 items-center justify-between px-3">
          <button type="button" aria-label="Close" onClick={() => router.push("/")} className="flex h-10 w-10 items-center justify-center rounded-full bg-chip">
            <X size={20} />
          </button>
          <span className="text-[17px] font-semibold">Pay or request</span>
          <span className="w-10" />
        </div>
        <div className="flex items-center gap-2 px-4 pt-2">
          <label className="flex h-14 flex-1 items-center gap-3 rounded-full bg-chip px-5">
            <Search size={20} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q && pickTyped()} placeholder="Name or @username" autoCapitalize="none" className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted" />
          </label>
          <Link href="/me/code" aria-label="Your code" className="flex h-14 w-14 items-center justify-center rounded-full bg-chip">
            <QrCode size={22} />
          </Link>
        </div>
        {error && <p className="px-6 pt-3 text-[14px] text-down">{error}</p>}
        {!q && recent.length > 0 && (
          <>
            <p className="px-5 pb-2 pt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Recent</p>
            <div className="no-scrollbar flex gap-4 overflow-x-auto px-5">
              {recent.map((h) => (
                <button key={h} type="button" onClick={() => setTo(h)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                  <Avatar handle={h} size={58} />
                  <span className="w-full truncate text-center text-[13px] font-medium">{personOf(h).name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {q ? (
          <>
            <p className={label}>People</p>
            <ul>{[...joined, ...notYet].map((p) => row(p.handle, !p.joined))}</ul>
            {joined.length + notYet.length === 0 && <p className="px-5 py-6 text-muted">Nobody by that name yet.</p>}
            {!joined.some((p) => p.handle === q) && (
              <button type="button" onClick={pickTyped} className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl bg-chip py-4 text-[16px] font-semibold text-brand">
                Pay @{q}
              </button>
            )}
          </>
        ) : (
          <>
            {friendRows.length > 0 && (
              <>
                <p className={label}>Friends</p>
                <ul>{friendRows.map((p) => row(p.handle))}</ul>
              </>
            )}
            {moreRows.length > 0 && (
              <>
                <p className={label}>{friendRows.length ? "More people" : "People"}</p>
                <ul>{moreRows.map((p) => row(p.handle))}</ul>
              </>
            )}
            {notYet.length > 0 && (
              <>
                <p className={label}>{EVENT_TAG}</p>
                <ul>{notYet.map((p) => row(p.handle, true))}</ul>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  const person = personOf(to);
  const pick = choices.find((c) => c.symbol === asset);

  // Step 3: confirm
  if (asset && pick) {
    return (
      <div className="flex min-h-dvh flex-col bg-white px-5 pb-8 min-[820px]:min-h-full">
        <div className="-mx-2 flex h-14 items-center justify-between">
          <button type="button" aria-label="Back" onClick={() => setAsset(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-chip">
            <ChevronLeft size={22} />
          </button>
          <span className="text-[17px] font-semibold">Confirm</span>
          <span className="w-10" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative">
            <Avatar handle={to} size={88} />
            <span className="absolute -bottom-1 -right-2 rounded-full ring-4 ring-white">
              <AssetDot symbol={asset} size={36} />
            </span>
          </div>
          <p className="mt-4 text-[20px] font-semibold">
            {person.name} <Flag code={person.country} />
          </p>
          <p className="tabular mt-3 text-[64px] font-semibold leading-none tracking-tight">{usd(value, false)}</p>
          <span className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-chip pl-1 pr-3.5 text-[15px] font-semibold">
            <AssetDot symbol={asset} size={28} />
            {unitsLabel(value / (prices[asset]?.price || 1), asset)}
          </span>
          {note && <p className="mt-4 text-[17px]">for {note}</p>}
          <div className="mt-6 inline-flex rounded-full bg-chip p-1 font-semibold">
            {([[false, "Public"], [true, "Private"]] as const).map(([v, label]) => (
              <button key={label} type="button" onClick={() => setPrivate(v)} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] ${isPrivate === v ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
                {v ? <Lock size={14} strokeWidth={2.2} /> : <Globe size={14} strokeWidth={2.2} />}
                {label}
              </button>
            ))}
          </div>
          {firstTime && <p className="mt-4 text-[13px] font-medium text-brand">First payment to this person. Check the photo and flag.</p>}
        </div>
        {error && <p className="mb-3 text-center text-[14px] text-down">{error}</p>}
        <PrimaryButton disabled={busy} onClick={send}>
          {busy ? "Paying…" : `Pay ${usd(value, false)}`}
        </PrimaryButton>
        <button type="button" onClick={() => { setAsset(null); setChoosing(true); }} className="mt-3 text-[15px] font-semibold text-brand">
          Pay with something else
        </button>
      </div>
    );
  }

  // Step 2: amount
  const size = amount.length > 6 ? 58 : amount.length > 4 ? 66 : 76;
  return (
    <div className="flex min-h-dvh flex-col bg-white min-[820px]:min-h-full">
      <div className="flex h-14 items-center justify-between px-3">
        <button type="button" aria-label="Back" onClick={() => setTo("")} className="flex h-10 w-10 items-center justify-center rounded-full bg-chip">
          <X size={20} />
        </button>
        <span className="w-10" />
      </div>
      <div className="flex flex-col items-center px-6 pt-2">
        <Avatar handle={to} size={64} ring />
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[20px] font-semibold">
          {person.name} <Flag code={person.country} className="text-[18px]" />
        </p>
        <p className="text-[15px] text-muted">@{to}</p>
        <div className={`tabular mt-5 flex items-start justify-center font-semibold tracking-tight ${shake ? "shake" : ""}`}>
          <span className="mt-2 text-[28px]">$</span>
          <span className={`leading-none ${value ? "text-ink" : "text-line"}`} style={{ fontSize: size }}>
            {amount}
          </span>
        </div>
        <label className="mt-5 flex min-h-14 w-full items-center rounded-2xl border border-line px-4">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 60))} placeholder="What's it for?" className="w-full bg-transparent py-3 text-[17px] outline-none placeholder:text-muted" />
        </label>
        <div className="no-scrollbar -mx-6 mt-2 flex w-[calc(100%+3rem)] gap-1 overflow-x-auto px-6">
          {NOTE_EMOJI.map((e) => (
            <button key={e} type="button" onClick={() => setNote((n0) => { const n = n0 ?? note; return (n.includes(e) ? n : `${e} ${n}`.trim() + (n ? "" : " ")).slice(0, 60); })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-xl">
              {e}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-[14px] text-down">{error}</p>}
      </div>
      <div className="mt-auto px-4 pb-6 pt-4">
        <div className="flex gap-3">
          <button type="button" disabled={!value || busy} onClick={ask} className="h-14 flex-1 rounded-full bg-brand text-lg font-semibold text-white disabled:opacity-40">
            {busy ? "Requesting…" : "Request"}
          </button>
          <button type="button" disabled={!value} onClick={() => setChoosing(true)} className="h-14 flex-1 rounded-full bg-brand text-lg font-semibold text-white disabled:opacity-40">
            Pay
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)} aria-label={k === "del" ? "Delete" : undefined} className="flex h-14 items-center justify-center text-[26px] font-medium active:bg-chip">
              {k === "del" ? <Delete size={26} /> : k}
            </button>
          ))}
        </div>
      </div>

      <Sheet open={choosing} onClose={() => setChoosing(false)} title={`Pay ${shortName(person.name)} ${usd(value, false)} with…`}>
        <p className="-mt-2 mb-3 text-[14px] text-muted">Pick what to send. They get exactly that.</p>
        {(["cash", "other"] as const).map((g) => {
          const list = choices.filter((c) => (g === "cash" ? META[c.symbol]?.market === "cash" : META[c.symbol]?.market !== "cash"));
          if (!list.length) return null;
          return (
            <div key={g} className="mb-3">
              <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted">{g === "cash" ? "Stablecoins" : "From your portfolio"}</p>
              <div className="space-y-2">
                {list.map((c) => {
                  const enough = c.value + 0.005 >= value;
                  return (
                    <button key={c.symbol} type="button" disabled={!enough} onClick={() => { setAsset(c.symbol); setChoosing(false); }} className="flex w-full items-center gap-3 rounded-2xl bg-chip p-3 text-left active:bg-brand-soft disabled:opacity-35">
                      <AssetDot symbol={c.symbol} size={40} />
                      <span className="flex-1">
                        <span className="block text-[16px] font-semibold">{META[c.symbol]?.name ?? c.symbol}</span>
                        <span className="block text-[13px] text-muted">{enough ? unitsLabel(c.units, c.symbol) : "Not enough for this payment"}</span>
                      </span>
                      <span className="font-mono text-[15px] font-semibold">{usd(c.value)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Link href={`/buy?to=${to}&amount=${value}&note=${encodeURIComponent(note)}`} className="mt-3 flex h-12 w-full items-center justify-center gap-1.5 rounded-full border border-line text-[15px] font-semibold text-brand">
          <Plus size={17} strokeWidth={2.5} /> Buy something to send
        </Link>
      </Sheet>
    </div>
  );
}

/** Keyed by the query string, so opening this screen from a new link always starts fresh. */
function Keyed() {
  const sp = useSearchParams();
  return <PayPageFlow key={sp.toString()} params={Object.fromEntries(sp.entries())} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Keyed />
    </Suspense>
  );
}
