"use client";

import { BadgeCheck } from "lucide-react";
import { charityLogo, type CharityRecord } from "@/lib/charities";

/** A charity's real logo in a white circle. */
export function CharityLogo({ handle, size = 48, ring = false }: { handle: string; size?: number; ring?: boolean }) {
  return (
    <span
      role="img"
      aria-hidden
      className={`inline-block shrink-0 rounded-full bg-white bg-cover bg-center ${ring ? "ring-4 ring-white" : "ring-1 ring-black/5"}`}
      style={{ width: size, height: size, backgroundImage: `url(${charityLogo(handle)})` }}
    />
  );
}

export function VerifiedTick({ size = 16 }: { size?: number }) {
  return <BadgeCheck size={size} className="shrink-0 fill-brand text-white" aria-label="Verified nonprofit" />;
}

/** "Tax-deductible" in green, or "Not tax-deductible" in amber, with the IRS status. */
export function TaxPill({ c, small = false }: { c: Pick<CharityRecord, "deductible" | "status">; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[12px]"} ${
        c.deductible ? "bg-[#E3F2E9] text-money" : "bg-[#FBEFD9] text-[#9A6412]"
      }`}
    >
      {c.deductible ? "Tax-deductible" : "Not tax-deductible"}
      {!small && <span className="font-medium opacity-75">· {c.status}</span>}
    </span>
  );
}

/** The honest line at the foot of every Give screen. */
export function GiveNote() {
  return (
    <p className="px-6 pb-6 pt-8 text-center text-xs leading-relaxed text-muted">
      Osmo isn&apos;t affiliated with these organizations. Names, EINs and addresses are from IRS records. On Monad testnet each
      gift goes to a stand-in wallet for the charity, not to the charity itself. Receipts are records, not tax advice.
    </p>
  );
}
