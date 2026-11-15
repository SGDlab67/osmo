"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Pencil, Printer, Share2 } from "lucide-react";
import { META, unitsLabel, usd } from "@/lib/assets";
import { scanTxUrl } from "@/lib/chain";
import { config } from "@/lib/config";
import { receiptId, type Charity } from "@/lib/charities";
import { loadDonor, saveDonor, type Donor } from "@/lib/donor";
import { CharityLogo } from "./charity-ui";

export interface Gift {
  hash: string;
  logIndex: number;
  fromHandle: string;
  fromWallet: string;
  symbol: string;
  units: number;
  block: bigint;
  /** ms since epoch, from the block. */
  time: number;
  note: string;
}

type Fmv = { usdPerUnit: number; source: string; asOf: number } | { error: string } | null;

export function useFmv(symbol: string, timeMs: number): Fmv {
  const [fmv, setFmv] = useState<Fmv>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/fmv?symbol=${symbol}&t=${Math.floor(timeMs / 1000)}`)
      .then((r) => r.json())
      .then((d) => alive && setFmv(d))
      .catch(() => alive && setFmv({ error: "unavailable" }));
    return () => {
      alive = false;
    };
  }, [symbol, timeMs]);
  return fmv;
}

export const utc = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
export const NETWORK_NAME = config.chainId === 10143 ? "Monad testnet (chain 10143)" : config.chainId === 143 ? "Monad (chain 143)" : `Local test chain (${config.chainId})`;
const testnet = config.chainId !== 143;
const addrUrl = (a: string) => `${config.chainId === 143 ? "https://monadscan.com" : "https://testnet.monadscan.com"}/address/${a}`;

/** Name and address the donor typed on this device, shown on their own copy only. */
export function DonorBlock() {
  const [donor, setDonor] = useState<Donor | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Donor>({ name: "", address: "" });
  useEffect(() => {
    // Read after mount: localStorage only exists in the browser.
    const d = loadDonor();
    queueMicrotask(() => setDonor(d));
  }, []);
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted";
  if (editing)
    return (
      <div className="no-print rounded-2xl bg-chip p-3">
        <p className={label}>Donor (kept on this phone, never uploaded)</p>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })} placeholder="Full name" className="mt-2 h-11 w-full rounded-xl bg-white px-3 text-[15px] outline-none" />
        <textarea value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value.slice(0, 160) })} placeholder="Mailing address" rows={2} className="mt-2 w-full resize-none rounded-xl bg-white px-3 py-2 text-[15px] outline-none" />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => { saveDonor(draft); setDonor(loadDonor()); setEditing(false); }} className="h-10 flex-1 rounded-full bg-brand text-[14px] font-semibold text-white">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="h-10 flex-1 rounded-full bg-white text-[14px] font-semibold">
            Cancel
          </button>
        </div>
      </div>
    );
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={label}>Donor</p>
        {donor ? (
          <>
            <p className="mt-1 text-[15px] font-semibold">{donor.name}</p>
            {donor.address && <p className="whitespace-pre-line text-[13px] text-muted">{donor.address}</p>}
          </>
        ) : (
          <p className="mt-1 text-[14px] text-muted">Add your name and address so your accountant can use this.</p>
        )}
      </div>
      <button type="button" onClick={() => { setDraft(donor ?? { name: "", address: "" }); setEditing(true); }} className="no-print flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3 text-[13px] font-semibold text-brand">
        <Pencil size={13} /> {donor ? "Edit" : "Add"}
      </button>
    </div>
  );
}

/** The flags a US donor (and their accountant) should see for a non-cash gift of this size. */
export function giftNotes(c: Charity, value: number | null, symbol: string): string[] {
  if (!c.deductible)
    return [`${c.legalName} is a ${c.status} organization. Contributions to it are generally not deductible as charitable contributions for federal income tax purposes.`];
  const out = [
    `Digital assets${META[symbol]?.market === "cash" ? ", stablecoins included," : ""} are property for US tax purposes, so this is a non-cash gift. Held over a year: the deduction is generally the fair market value. Held a year or less: generally the lower of value and your cost basis. Keep your cost basis and the date you got the asset.`,
  ];
  if (value !== null && value >= 250) out.push("Gifts of $250 or more need a written acknowledgment from the charity itself. Keep this record with it.");
  if (value !== null && value > 500) out.push("Non-cash gifts over $500 in a year are reported on IRS Form 8283.");
  if (value !== null && value > 5000) out.push("Non-cash gifts over $5,000 generally need a qualified appraisal. Digital assets don't get the exception for publicly traded stock.");
  return out;
}

/** The donation receipt: everything an accountant needs, printable, with the transaction to audit it on chain. */
export function DonationReceipt({ c, g }: { c: Charity; g: Gift }) {
  const fmv = useFmv(g.symbol, g.time);
  const value = fmv && "usdPerUnit" in fmv ? fmv.usdPerUnit * g.units : null;
  const rid = receiptId(g.hash, g.logIndex);
  const row = (k: string, v: React.ReactNode, mono = false) => (
    <div className="flex justify-between gap-4 py-2 text-[14px]">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={`text-right font-semibold ${mono ? "break-all font-mono text-[12px]" : ""}`}>{v}</span>
    </div>
  );
  const head = "pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted";
  return (
    <div id="receipt" className="print-area mt-6 scroll-mt-16">
      <div className="rounded-[28px] bg-white p-5">
        {testnet && <p className="-mx-5 -mt-5 mb-4 rounded-t-[28px] bg-[#FBEFD9] px-5 py-2.5 text-center text-[12px] font-semibold text-[#9A6412]">Testnet demo. Not a tax document: no real money moved.</p>}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">Donation receipt</p>
            <p className="mt-0.5 text-[20px] font-semibold leading-tight">{c.legalName}</p>
            <p className="mt-0.5 text-[13px] text-muted">Receipt {rid} · Osmo</p>
          </div>
          <CharityLogo handle={c.handle} size={52} />
        </div>

        <div className="mt-4 rounded-2xl bg-chip p-4 text-center">
          <p className="text-[13px] text-muted">Fair market value on the day of the gift</p>
          <p className="tabular mt-1 text-[34px] font-semibold leading-none tracking-tight">{value !== null ? usd(value) : fmv ? "Unavailable" : "…"}</p>
          <p className="mt-1.5 text-[13px] font-semibold">{unitsLabel(g.units, g.symbol)} ({META[g.symbol]?.name ?? g.symbol})</p>
        </div>

        <p className={head}>Organization</p>
        <div className="divide-y divide-line">
          {row("Legal name", c.legalName)}
          {row("EIN", <span className="font-mono">{c.ein}</span>)}
          {row("IRS status", `${c.status}, ${c.deductible ? "tax-deductible" : "not tax-deductible"}`)}
          {row("Address", c.address)}
          {row("Website", c.site)}
        </div>

        <p className={head}>Gift</p>
        <div className="divide-y divide-line">
          {row("Date and time", utc(g.time))}
          {row("Asset given", `${unitsLabel(g.units, g.symbol)} (${META[g.symbol]?.name ?? g.symbol})`)}
          {fmv && "usdPerUnit" in fmv ? (
            <>
              {row("Price per unit", usd(fmv.usdPerUnit))}
              {row("Price source", fmv.source)}
              {row("Price as of", utc(fmv.asOf * 1000))}
            </>
          ) : (
            row("Fair market value", fmv ? "Unavailable from the price source; value the gift from your own records" : "Looking up…")
          )}
          {g.note && row("Note", g.note)}
          {row("Goods or services", "None were provided in exchange for this gift")}
        </div>

        <p className={head}>Audit trail</p>
        <div className="divide-y divide-line">
          {row("Network", NETWORK_NAME)}
          {row("Block", g.block.toString())}
          {row("Transaction", g.hash, true)}
          {row("From (donor wallet)", <a href={addrUrl(g.fromWallet)} target="_blank" rel="noreferrer" className="text-brand">{g.fromWallet}</a>, true)}
          {row("To (charity wallet)", <a href={addrUrl(c.wallet)} target="_blank" rel="noreferrer" className="text-brand">{c.wallet}</a>, true)}
          {row("Osmo username", `@${g.fromHandle} to @${c.handle}`)}
        </div>
        <a href={scanTxUrl(g.hash)} target="_blank" rel="noreferrer" className="no-print mt-2 flex h-11 items-center justify-center gap-1.5 rounded-full bg-chip text-[14px] font-semibold text-brand">
          Verify on MonadScan <ArrowUpRight size={15} />
        </a>

        <div className="mt-5 border-t border-line pt-4">
          <DonorBlock />
        </div>

        <ul className="mt-4 space-y-2 rounded-2xl bg-chip p-4 text-[12px] leading-snug text-muted">
          {giftNotes(c, value, g.symbol).map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>This record is generated by Osmo from the public blockchain. It is not the charity&apos;s own acknowledgment and not tax advice; check with a tax professional.</li>
          {testnet && <li>On Monad testnet the charity wallet is a stand-in, so this gift never reached {c.name}.</li>}
        </ul>
      </div>

      <div className="no-print mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => window.print()} className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-white">
          <Printer size={17} /> Save as PDF
        </button>
        <button
          type="button"
          onClick={() => {
            const url = location.href.split("#")[0] + "#receipt";
            if (navigator.share) navigator.share({ title: `Donation receipt ${rid}`, text: `Donation to ${c.legalName} (EIN ${c.ein})`, url }).catch(() => {});
            else navigator.clipboard?.writeText(url);
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold"
        >
          <Share2 size={17} /> Send to accountant
        </button>
      </div>
    </div>
  );
}
