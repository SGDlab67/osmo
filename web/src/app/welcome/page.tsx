"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { registryAbi } from "@/lib/abi";
import { txUrl, publicClient } from "@/lib/chain";
import { config } from "@/lib/config";
import { COUNTRIES, countryName, flagOf } from "@/lib/countries";
import { defaultPicture } from "@/lib/people";
import { useStore } from "@/lib/store";
import { Mark, Picture, PicturePicker, PrimaryButton, Sheet } from "@/components/ui";

const RULE = /^[a-z0-9_]{3,20}$/;
type Step = { label: string; ms?: number; hash?: string };

function suggestHandle(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

export default function WelcomePage() {
  const router = useRouter();
  const { ready, account, join } = useStore();
  const [stage, setStage] = useState<"splash" | "profile" | "creating" | "done">("splash");
  const [name, setName] = useState("");
  const [handleTyped, setHandleTyped] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [pickPicture, setPickPicture] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [pickCountry, setPickCountry] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState("");

  const handle = handleTyped ?? suggestHandle(name);
  const shownPicture = picture ?? defaultPicture(handle || "new");
  const valid = RULE.test(handle) && name.trim().length > 0;
  const isTaken = taken[handle];

  // Already signed in on this phone: go home.
  useEffect(() => {
    if (ready && account && stage === "splash") router.replace("/");
  }, [ready, account, stage, router]);

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
      setTimeout(() => setStage("done"), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Something went wrong");
      setStage("profile");
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
        <button type="button" onClick={() => setStage("profile")} className="h-14 rounded-full bg-[#f3eee5] text-[17px] font-semibold text-splash">
          Create a wallet
        </button>
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
          <p className="mt-1 text-[15px] text-muted">{doneAll ? "$25 USDC, $15 NVIDIA, $10 Tesla and $10 Bitcoin to try it with." : "Three steps on Monad"}</p>
          <ol className="mt-8 w-full space-y-2 text-left">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${s.ms !== undefined ? "bg-money text-white" : "blink bg-brand-soft"}`}>
                  {s.ms !== undefined && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="flex-1 text-[15px]">{s.label}</span>
                {s.ms !== undefined &&
                  (s.hash ? (
                    <a href={txUrl(s.hash)} target="_blank" rel="noreferrer" className="tabular text-[14px] font-semibold text-brand">
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
  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 min-[820px]:min-h-full">
      <div className="-mx-2 flex h-14 items-center gap-3">
        <button type="button" aria-label="Back" onClick={() => setStage("splash")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
          <ChevronLeft size={22} />
        </button>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full w-1/2 rounded-full bg-brand" />
        </span>
        <span className="w-10" />
      </div>
      <h1 className="mt-2 px-1 text-[30px] font-semibold tracking-tight">Make it yours</h1>
      <p className="mt-1 px-1 text-[15px] text-muted">Friends use these to find you and check it&apos;s really you.</p>

      <div className="mt-5 flex items-center gap-4 px-1">
        <button type="button" onClick={() => setPickPicture(true)} className="relative shrink-0" aria-label="Change picture">
          <Picture picture={shownPicture} size={76} />
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white ring-4 ring-page">
            <Camera size={15} />
          </span>
        </button>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[19px] font-semibold">
            {name.trim() || "Your name"} {country && <span>{flagOf(country)}</span>}
          </p>
          <p className="text-[15px] text-muted">@{handle || "username"}</p>
          <p className="mt-1 flex items-center gap-1 text-[12px] text-muted">
            <span className="h-2 w-2 rounded-full bg-money" /> A new wallet, made on this phone
          </p>
        </div>
      </div>

      <label className="mt-6 block">
        <span className="px-1 text-[13px] font-semibold text-muted">Name or nickname</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="e.g. Riley Stone, or just Riley" className={`mt-1 ${field}`} />
      </label>
      <label className="mt-3 block">
        <span className="px-1 text-[13px] font-semibold text-muted">Username</span>
        <span className={`mt-1 flex items-center gap-1 ${field}`}>
          <span className="text-muted">@</span>
          <input
            value={handle}
            onChange={(e) => setHandleTyped(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent outline-none"
          />
          {RULE.test(handle) && handle in taken && (isTaken ? <span className="shrink-0 text-[13px] font-semibold text-down">Taken</span> : <Check size={18} className="shrink-0 text-money" />)}
        </span>
      </label>
      <p className="mt-1 px-1 text-[12px] text-muted">3 to 20 lower-case letters, numbers or underscores.</p>
      <div className="mt-3">
        <span className="px-1 text-[13px] font-semibold text-muted">Country</span>
        <button type="button" onClick={() => setPickCountry(true)} className={`mt-1 flex items-center justify-between text-left ${field}`}>
          <span className={country ? "" : "text-muted"}>{country ? `${flagOf(country)}  ${countryName(country)}` : "Prefer not to say"}</span>
          <ChevronRight size={18} className="text-muted" />
        </button>
        <p className="mt-1 px-1 text-[12px] text-muted">Shows as a flag by your name, so friends can tell you apart from look-alikes. Optional.</p>
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-2xl bg-white p-4">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f4f82]" />
        <span className="text-[13px] leading-snug text-muted">I understand payments are final, my wallet lives on this phone and is mine to protect, and this is a testnet demo with test tokens.</span>
      </label>

      <div className="flex-1" />
      {error && <p className="mb-3 text-center text-[14px] text-down">{error}</p>}
      <PrimaryButton className="mt-6" disabled={!valid || !agreed || isTaken !== false} onClick={create}>
        Create my account
      </PrimaryButton>

      <Sheet open={pickPicture} onClose={() => setPickPicture(false)} title="Pick a picture">
        <PicturePicker
          value={shownPicture}
          onPick={(p) => {
            setPicture(p);
            setPickPicture(false);
          }}
        />
      </Sheet>

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
