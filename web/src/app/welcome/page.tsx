"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { registryAbi } from "@/lib/abi";
import { scanTxUrl, publicClient } from "@/lib/chain";
import { config } from "@/lib/config";
import { COUNTRIES, countryName, flagOf } from "@/lib/countries";
import { defaultPicture } from "@/lib/people";
import { useStore } from "@/lib/store";
import { PASSWORD_HINT, PasswordField, passwordOk } from "@/components/password-field";
import { Mark, Picture, PicturePicker, PrimaryButton, Sheet } from "@/components/ui";

const RULE = /^[a-z0-9_]{3,20}$/;
type Step = { label: string; ms?: number; hash?: string };

function suggestHandle(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

export default function WelcomePage() {
  const router = useRouter();
  const { ready, account, join, setPassword, status } = useStore();
  const [stage, setStage] = useState<"splash" | "picture" | "name" | "username" | "password" | "creating" | "done">("splash");
  const [name, setName] = useState("");
  const [handleTyped, setHandleTyped] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [pickCountry, setPickCountry] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState("");
  const [password, setPasswordValue] = useState("");
  const [again, setAgain] = useState("");
  const [pinReady, setPinReady] = useState(false);
  const [pinSaved, setPinSaved] = useState<boolean | null>(null);

  const handle = handleTyped ?? suggestHandle(name);
  const shownPicture = picture ?? defaultPicture(handle || "new");
  const passwordGood = !pinReady || (passwordOk(password) && again === password);
  const valid = RULE.test(handle) && name.trim().length > 0 && passwordGood;
  const isTaken = taken[handle];

  // Already signed in on this phone: go home.
  useEffect(() => {
    if (ready && account && stage === "splash") router.replace("/");
  }, [ready, account, stage, router]);

  // Is login by password switched on for this server? If so, a password is part of signing up.
  useEffect(() => {
    fetch("/api/auth/pin", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ready?: boolean }) => setPinReady(Boolean(j.ready)))
      .catch(() => {});
  }, []);

  // Check the username on-chain as it is typed.
  useEffect(() => {
    if (!RULE.test(handle) || handle in taken) return;
    const t = setTimeout(() => {
      publicClient
        .readContract({ address: config.registry, abi: registryAbi, functionName: "resolve", args: [handle] })
        .then((a) => setTaken((m) => ({ ...m, [handle]: a !== "0x0000000000000000000000000000000000000000" })))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [handle, taken]);

  const countries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    return COUNTRIES.map((c) => ({ c, n: countryName(c) }))
      .filter((x) => !q || x.n.toLowerCase().includes(q))
      .sort((a, b) => a.n.localeCompare(b.n));
  }, [countryQuery]);

  const create = async () => {
    setError("");
    setStage("creating");
    setSteps([{ label: "Wallet made on this phone" }, { label: "Starter kit and gas from Osmo" }, { label: `@${handle} claimed on Monad` }]);
    try {
      await join({ handle, name: name.trim(), picture: shownPicture, country }, (i, ms, hash) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ms, hash } : x))));
      if (pinReady && passwordOk(password)) setPinSaved(await setPassword(handle, password).then(() => true, () => false));
      setTimeout(() => setStage("done"), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Something went wrong");
      setStage("password");
    }
  };

  if (stage === "splash") {
    return (
      <div className="flex min-h-dvh flex-col bg-splash px-6 pb-10 text-[#f3eee5] min-[820px]:min-h-full">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Mark size={168} className="drop-shadow-[0_12px_30px_rgba(0,0,0,0.35)]" />
          <p className="mt-8 text-[40px] font-bold tracking-tight">Osmo</p>
          <p className="mt-2 text-[18px] text-[#f3eee5]/75">Pay friends in stocks and crypto.</p>
        </div>
        <button type="button" onClick={() => setStage("picture")} className="h-14 rounded-full bg-[#f3eee5] text-[17px] font-semibold text-splash">
          Create a wallet
        </button>
        <Link href="/login" className="mt-3 flex h-12 items-center justify-center rounded-full border border-[#f3eee5]/40 text-[16px] font-semibold text-[#f3eee5]">
          Log in
        </Link>
        <p className="mt-4 text-center text-[12px] text-[#f3eee5]/50">No ID needed. Your money stays in your own wallet. Live on Monad testnet.</p>
      </div>
    );
  }

  if (stage === "creating" || stage === "done") {
    const doneAll = stage === "done";
    return (
      <div className="flex min-h-dvh flex-col px-6 pb-10 pt-16 min-[820px]:min-h-full">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative">
            <Picture picture={shownPicture} size={112} />
            {doneAll && <span className="pop absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-money text-white ring-4 ring-page"><Check size={22} strokeWidth={3} /></span>}
          </div>
          <p className="mt-5 text-[28px] font-semibold tracking-tight">
            {doneAll ? `You're in, @${handle}` : "Setting you up"} {flagOf(country)}
          </p>
          <p className="mt-1 text-[15px] text-muted">{doneAll ? "$150 to send around: $50 USDC, $40 NVIDIA, $25 Tesla, $20 Bitcoin and $15 gold." : "Three steps on Monad"}</p>
          {doneAll && pinSaved !== null && (
            <p className="mt-3 text-[14px] text-muted">{pinSaved ? `On any phone, log in with @${handle} and your password.` : "Your password wasn't saved. Set it later in Settings."}</p>
          )}
          <ol className="mt-8 w-full space-y-2 text-left">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${s.ms !== undefined ? "bg-money text-white" : "blink bg-brand-soft"}`}>
                  {s.ms !== undefined && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="flex-1 text-[15px]">{s.label}</span>
                {s.ms !== undefined &&
                  (s.hash ? (
                    <a href={scanTxUrl(s.hash)} target="_blank" rel="noreferrer" className="tabular text-[14px] font-semibold text-brand">
                      {s.ms} ms
                    </a>
                  ) : (
                    <span className="tabular text-[14px] text-muted">{s.ms} ms</span>
                  ))}
              </li>
            ))}
          </ol>
        </div>
        {doneAll && <PrimaryButton onClick={() => router.replace("/")}>Go to Home</PrimaryButton>}
      </div>
    );
  }

  const field = "h-14 w-full rounded-2xl border border-[#ddd5c8] bg-white px-4 text-[17px] outline-none focus-within:border-brand";
  const order = ["picture", "name", "username", "password"] as const;
  const at = order.indexOf(stage as (typeof order)[number]);
  const back = () => setStage(at <= 0 ? "splash" : order[at - 1]);
  const next = () => setStage(order[at + 1]);
  const title = { picture: "Pick your picture", name: "What's your name?", username: "Pick a username", password: pinReady ? "Set a password" : "Almost done" }[stage as (typeof order)[number]];
  const sub = {
    picture: "Friends see it next to your name. You can change it later.",
    name: "Your real name or a nickname. Friends use it to find you.",
    username: "How people pay you. It's yours on Monad, so pick one you like.",
    password: pinReady ? "With your username, it logs you in on any phone." : "One last check, then we make your wallet.",
  }[stage as (typeof order)[number]];
  const canNext = stage === "picture" ? true : stage === "name" ? name.trim().length > 0 : stage === "username" ? RULE.test(handle) && isTaken === false : valid && agreed;

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 min-[820px]:min-h-full">
      <div className="-mx-2 flex h-14 items-center gap-3">
        <button type="button" aria-label="Back" onClick={back} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
          <ChevronLeft size={22} />
        </button>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${((at + 1) / order.length) * 100}%` }} />
        </span>
        <span className="w-10 text-right text-[13px] font-semibold text-muted">
          {at + 1}/{order.length}
        </span>
      </div>

      {/* Who you'll be: the same card on every step, filling in as you go. */}
      <div className="mt-3 flex items-center gap-3.5 rounded-[22px] bg-white p-3.5">
        <Picture picture={shownPicture} size={56} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[17px] font-semibold">
            {name.trim() || <span className="text-muted">Your name</span>} {country && <span>{flagOf(country)}</span>}
          </p>
          <p className="truncate text-[14px] text-muted">@{handle || "username"}</p>
        </div>
      </div>

      <h1 className="mt-6 px-1 text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
      <p className="mt-1 px-1 text-[15px] text-muted">{sub}</p>

      {stage === "picture" && (
        <div className="fade-up mt-4">
          <PicturePicker value={shownPicture} onPick={(pic) => setPicture(pic)} />
        </div>
      )}

      {stage === "name" && (
        <div className="fade-up mt-5">
          <label className="block">
            <span className="px-1 text-[13px] font-semibold text-muted">Name or nickname</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} onKeyDown={(e) => e.key === "Enter" && canNext && next()} placeholder="e.g. Riley Stone, or just Riley" className={`mt-1 ${field}`} />
          </label>
          <div className="mt-3">
            <span className="px-1 text-[13px] font-semibold text-muted">Country (optional)</span>
            <button type="button" onClick={() => setPickCountry(true)} className={`mt-1 flex items-center justify-between text-left ${field}`}>
              <span className={country ? "" : "text-muted"}>{country ? `${flagOf(country)}  ${countryName(country)}` : "Prefer not to say"}</span>
              <ChevronRight size={18} className="text-muted" />
            </button>
            <p className="mt-1 px-1 text-[12px] text-muted">Shows as a flag by your name, so friends can tell you apart from look-alikes.</p>
          </div>
        </div>
      )}

      {stage === "username" && (
        <div className="fade-up mt-5">
          <label className="block">
            <span className="px-1 text-[13px] font-semibold text-muted">Username</span>
            <span className={`mt-1 flex items-center gap-1 ${field} ${RULE.test(handle) && isTaken ? "!border-down" : ""}`}>
              <span className="text-muted">@</span>
              <input
                autoFocus
                value={handle}
                onChange={(e) => setHandleTyped(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
                onKeyDown={(e) => e.key === "Enter" && canNext && next()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent outline-none"
              />
              {RULE.test(handle) && handle in taken && (isTaken ? <span className="shrink-0 text-[13px] font-semibold text-down">Taken</span> : <Check size={18} className="shrink-0 text-money" />)}
            </span>
          </label>
          <p className="mt-1 px-1 text-[12px] text-muted">
            {RULE.test(handle) && isTaken ? `@${handle} is taken. Try another.` : "3 to 20 lower-case letters, numbers or underscores."}
          </p>
        </div>
      )}

      {stage === "password" && (
        <div className="fade-up mt-5">
          {pinReady && (
            <>
              <PasswordField value={password} onChange={setPasswordValue} label="Password" placeholder="Choose a password" autoComplete="new-password" autoFocus state={password && !passwordOk(password) ? "bad" : undefined} />
              <div className="mt-3">
                <PasswordField value={again} onChange={setAgain} label="Confirm password" placeholder="Type it again" autoComplete="new-password" state={again ? (again === password ? "ok" : "bad") : undefined} />
              </div>
              <p className={`mt-1.5 px-1 text-[12px] ${again && again !== password ? "text-down" : "text-muted"}`}>{again && again !== password ? "The passwords don't match yet." : PASSWORD_HINT}</p>
            </>
          )}
          <label className="mt-4 flex items-start gap-3 rounded-2xl bg-white p-4">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f4f82]" />
            <span className="text-[13px] leading-snug text-muted">I understand payments are final, my wallet is mine to protect, and this is a testnet demo with test tokens.</span>
          </label>
        </div>
      )}

      <div className="flex-1" />
      <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-page via-page to-page/0 px-5 pb-1 pt-4">
      {error && <p className="mb-3 mt-4 text-center text-[14px] text-down">{error}</p>}
      {status === "missing" && <p className="mb-3 text-center text-[14px] text-down">Osmo isn&apos;t deployed on this network yet, so accounts can&apos;t be made.</p>}
      {stage === "password" ? (
        <PrimaryButton className="mt-2" disabled={!canNext || isTaken !== false || status === "missing"} onClick={create}>
          Create my wallet
        </PrimaryButton>
      ) : (
        <PrimaryButton className="mt-2" disabled={!canNext} onClick={next}>
          {stage === "picture" && !picture ? "Use this one" : "Continue"}
        </PrimaryButton>
      )}
      {stage === "password" && <p className="mt-3 text-center text-[12px] text-muted">We make a wallet on this phone and fill it with $150 of test stocks and crypto.</p>}
      </div>

      <Sheet open={pickCountry} onClose={() => setPickCountry(false)} title="Where are you?">
        <label className="flex h-12 items-center gap-2 rounded-full bg-chip px-4">
          <Search size={18} className="text-muted" />
          <input value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} placeholder="Search countries" className="w-full bg-transparent text-[16px] outline-none" />
        </label>
        <div className="mt-2 divide-y divide-line">
          <button type="button" onClick={() => { setCountry(""); setPickCountry(false); }} className="w-full py-3 text-left text-[16px] text-muted">
            Prefer not to say
          </button>
          {countries.map((x) => (
            <button key={x.c} type="button" onClick={() => { setCountry(x.c); setPickCountry(false); }} className="flex w-full items-center gap-3 py-3 text-left text-[16px]">
              <span className="text-[22px]">{flagOf(x.c)}</span>
              {x.n}
              {country === x.c && <Check size={18} className="ml-auto text-brand" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
