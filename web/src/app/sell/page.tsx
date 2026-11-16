"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Check, X } from "lucide-react";
import { META, unitsLabel, usd } from "@/lib/assets";
import { scanTxUrl } from "@/lib/chain";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { AssetDot, PrimaryButton } from "@/components/ui";

const SHARES = [
  { label: "25%", f: 0.25 },
  { label: "50%", f: 0.5 },
  { label: "75%", f: 0.75 },
  { label: "All", f: 1 },
];
const INTO = ["USDC", "USDT"];

function SellFlow({ asset }: { asset: string }) {
  const ok = useRequireAccount();
  const router = useRouter();
  const { prices, balances, sell } = useStore();
  const [share, setShare] = useState(1);
  const [into, setInto] = useState("USDC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ usd: number; hash: string; ms: number; units: number } | null>(null);
  if (!ok) return null;

  const m = META[asset];
  const held = balances[asset] ?? 0;
  const price = prices[asset]?.price ?? 0;
  const units = share === 1 ? held : Math.floor(held * share * 1e6) / 1e6;
  const value = units * price;

  if (done)
    return (
      <div className="flex min-h-dvh flex-col bg-white px-6 pb-10 pt-12 min-[820px]:min-h-full">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="pop flex h-20 w-20 items-center justify-center rounded-full bg-money text-white">
            <Check size={40} strokeWidth={3} />
          </span>
          <p className="mt-6 text-[26px] font-semibold tracking-tight">
            Sold for {usd(done.usd)} {into}
          </p>
          <p className="mt-1 text-[16px] text-muted">
            {unitsLabel(done.units, asset)} of {m.name} is now dollars in your wallet.
          </p>
          <a href={scanTxUrl(done.hash)} target="_blank" rel="noreferrer" className="mt-4 text-[14px] font-semibold text-brand">
            Done on Monad in {(done.ms / 1000).toFixed(1)} s
          </a>
        </div>
        <PrimaryButton onClick={() => router.push("/portfolio")}>Done</PrimaryButton>
      </div>
    );

  return (
    <div className="flex min-h-dvh flex-col bg-white px-5 pb-8 min-[820px]:min-h-full">
      <div className="-mx-2 flex h-14 items-center justify-between">
        <button type="button" aria-label="Back" onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-full bg-chip">
          <X size={20} />
        </button>
        <span className="text-[17px] font-semibold">Sell {m?.name ?? asset}</span>
        <span className="w-10" />
      </div>
      {held <= 0 ? (
        <p className="mt-16 text-center text-[16px] text-muted">You don&apos;t hold any {m?.name ?? asset} to sell.</p>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <AssetDot symbol={asset} size={72} />
            <p className="tabular mt-4 text-[56px] font-semibold leading-none tracking-tight">{price ? usd(value) : "…"}</p>
            <p className="mt-2 text-[16px] text-muted">
              {unitsLabel(units, asset)} of {unitsLabel(held, asset)}
            </p>
            <div className="mt-6 grid w-full grid-cols-4 gap-2">
              {SHARES.map((s) => (
                <button key={s.label} type="button" onClick={() => setShare(s.f)} className={`h-12 rounded-2xl text-[16px] font-semibold ${share === s.f ? "bg-ink text-white" : "bg-page"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Get it as</p>
            <div className="mt-2 flex gap-2">
              {INTO.map((s) => (
                <button key={s} type="button" onClick={() => setInto(s)} className={`flex h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-[15px] font-semibold ${into === s ? "bg-ink text-white" : "bg-page"}`}>
                  <AssetDot symbol={s} size={30} /> {s}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="mb-3 text-center text-[14px] text-down">{error}</p>}
          <PrimaryButton
            disabled={busy || !price || units <= 0}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setDone({ ...(await sell(asset, units, into)), units });
              } catch (e) {
                setError(e instanceof Error ? e.message.split("\n")[0] : "Sell failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Selling…" : `Sell for ${usd(value)}`}
          </PrimaryButton>
          <p className="mt-3 text-center text-[12px] text-muted">At the live price. Test tokens on Monad testnet, no real money.</p>
        </>
      )}
    </div>
  );
}

function Keyed() {
  const sp = useSearchParams();
  const asset = sp.get("asset") ?? "";
  return <SellFlow key={asset} asset={asset} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Keyed />
    </Suspense>
  );
}
