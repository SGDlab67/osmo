"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Building2, Check, CreditCard, Wallet, X } from "lucide-react";
import { MARKETS, META, unitsLabel, usd } from "@/lib/assets";
import { scanTxUrl } from "@/lib/chain";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { AssetDot, PrimaryButton } from "@/components/ui";

const METHODS = [
  { id: "apple", label: "Apple Pay", note: "Fastest", icon: "Pay" },
  { id: "card", label: "Debit card", note: "Visa or Mastercard", icon: "card" },
  { id: "venmo", label: "Venmo", note: "Through a payment partner", icon: "V" },
  { id: "paypal", label: "PayPal", note: "Through a payment partner", icon: "P" },
  { id: "cashapp", label: "Cash App", note: "Through a payment partner", icon: "$" },
  { id: "bank", label: "Bank account", note: "1 to 2 days in real life", icon: "bank" },
  { id: "wallet", label: "MetaMask or Phantom", note: "From a wallet you already have", icon: "wallet" },
];

function BuyPageFlow({ params }: { params: Record<string, string> }) {
  const ok = useRequireAccount();
  const router = useRouter();
  const { prices, buy, personOf } = useStore();
  const [assetPicked, setAsset] = useState<string | null>(null);
  const asset = assetPicked ?? (params.asset || null);
  const [dollarsPicked, setDollars] = useState<number | null>(null);
  const dollars = dollarsPicked ?? (params.amount ? Math.min(100, Math.ceil(Number(params.amount))) : null);
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ units: number; hash: string; ms: number } | null>(null);
  if (!ok) return null;

  const close = () => router.back();
  const header = (title: string, back?: () => void) => (
    <div className="flex h-14 items-center justify-between px-3">
      <button type="button" aria-label="Back" onClick={back ?? close} className="flex h-10 w-10 items-center justify-center rounded-full bg-chip">
        <X size={20} />
      </button>
      <span className="text-[17px] font-semibold">{title}</span>
      <span className="w-10" />
    </div>
  );

  if (done && asset && dollars) {
    const to = params.to;
    return (
      <div className="flex min-h-dvh flex-col bg-white px-6 pb-10 pt-12 min-[820px]:min-h-full">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="pop flex h-20 w-20 items-center justify-center rounded-full bg-money text-white">
            <Check size={40} strokeWidth={3} />
          </span>
          <p className="mt-6 text-[26px] font-semibold tracking-tight">
            You bought {usd(dollars)} of {META[asset].name}
          </p>
          <p className="mt-1 text-[16px] text-muted">{unitsLabel(done.units, asset)} is in your wallet, on Monad.</p>
          <a href={scanTxUrl(done.hash)} target="_blank" rel="noreferrer" className="mt-4 text-[14px] font-semibold text-brand">
            Confirmed in {done.ms} ms
          </a>
        </div>
        {to ? (
          <Link href={`/pay?to=${to}&amount=${params.amount}&note=${encodeURIComponent(params.note)}&asset=${asset}`} className="flex h-14 items-center justify-center rounded-full bg-brand text-[17px] font-semibold text-white">
            Send it to {personOf(to).name.split(" ")[0]} now
          </Link>
        ) : (
          <PrimaryButton
            onClick={() => {
              setDone(null);
              setAsset(null);
              setDollars(null);
              setMethod(null);
              router.push("/portfolio");
            }}
          >
            Done
          </PrimaryButton>
        )}
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-dvh bg-white pb-8 min-[820px]:min-h-full">
        {header("Buy")}
        {MARKETS.map((mk) => {
          const list = Object.entries(META).filter(([s, m]) => m.market === mk.id && s !== "MON");
          return (
            <div key={mk.id}>
              <p className="px-5 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-wide text-muted">{mk.label}</p>
              <div className="divide-y divide-line px-4">
                {list.map(([s, m]) => (
                  <button key={s} type="button" onClick={() => setAsset(s)} className="flex w-full items-center gap-3 py-3 text-left">
                    <AssetDot symbol={s} size={40} />
                    <span className="flex-1 text-[16px] font-semibold">{m.name}</span>
                    <span className="tabular text-[15px] text-muted">{prices[s] ? usd(prices[s].price) : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (!dollars) {
    return (
      <div className="flex min-h-dvh flex-col bg-white min-[820px]:min-h-full">
        {header(`Buy ${META[asset].name}`, () => setAsset(null))}
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <AssetDot symbol={asset} size={64} />
          <p className="mt-4 text-[20px] font-semibold">How much?</p>
          <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
            {[10, 25, 50, 100].map((d) => (
              <button key={d} type="button" onClick={() => setDollars(d)} className="h-16 rounded-2xl bg-page text-[22px] font-semibold">
                ${d}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!method) {
    return (
      <div className="min-h-dvh bg-white pb-8 min-[820px]:min-h-full">
        {header(`Pay ${usd(dollars, false)} with`, () => setDollars(null))}
        <div className="divide-y divide-line px-4">
          {METHODS.map((m) => (
            <button key={m.id} type="button" onClick={() => setMethod(m.id)} className="flex w-full items-center gap-3 py-3.5 text-left">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-ink font-bold text-white ${m.icon.length > 1 && !["card", "bank", "wallet"].includes(m.icon) ? "text-[11px]" : "text-[16px]"}`}>
                {m.icon === "card" ? <CreditCard size={18} /> : m.icon === "bank" ? <Building2 size={18} /> : m.icon === "wallet" ? <Wallet size={18} /> : m.icon}
              </span>
              <span className="flex-1">
                <span className="block text-[16px] font-semibold">{m.label}</span>
                <span className="block text-[13px] text-muted">{m.note}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="px-6 pt-4 text-center text-[12px] text-muted">Demo: no real money moves. In the real app a licensed partner handles this step and may ask for ID.</p>
      </div>
    );
  }

  const price = prices[asset]?.price ?? 0;
  return (
    <div className="flex min-h-dvh flex-col bg-white px-5 pb-8 min-[820px]:min-h-full">
      {header("Review", () => setMethod(null))}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <AssetDot symbol={asset} size={72} />
        <p className="tabular mt-4 text-[56px] font-semibold leading-none tracking-tight">{usd(dollars, false)}</p>
        <p className="mt-2 text-[16px] text-muted">
          about {price ? unitsLabel(dollars / price, asset) : "…"} of {META[asset].name}
        </p>
        <p className="mt-1 text-[14px] text-muted">with {METHODS.find((m) => m.id === method)?.label}</p>
      </div>
      {error && <p className="mb-3 text-center text-[14px] text-down">{error}</p>}
      <PrimaryButton
        disabled={busy || !price}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setDone(await buy(asset, dollars));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Buy failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Buying…" : `Buy ${usd(dollars, false)}`}
      </PrimaryButton>
      <p className="mt-3 text-center text-[12px] text-muted">Demo: no real money moves.</p>
    </div>
  );
}

/** Keyed by the query string, so opening this screen from a new link always starts fresh. */
function Keyed() {
  const sp = useSearchParams();
  return <BuyPageFlow key={sp.toString()} params={Object.fromEntries(sp.entries())} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Keyed />
    </Suspense>
  );
}
