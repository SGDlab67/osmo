"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Download, Pencil, Share2 } from "lucide-react";
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
  const fieldLabel = "Donor (kept on this phone, never uploaded)";
  if (editing)
    return (
      <div className="rounded-2xl bg-chip p-3">
        <p className={label}>{fieldLabel}</p>
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
            <p className="mt-0.5 text-[15px] font-semibold">{donor.name}</p>
            {donor.address && <p className="truncate text-[13px] text-muted">{donor.address.replace(/\n/g, ", ")}</p>}
          </>
        ) : (
          <p className="mt-0.5 text-[13px] text-muted">Add your name and address for the PDF.</p>
        )}
      </div>
      <button type="button" onClick={() => { setDraft(donor ?? { name: "", address: "" }); setEditing(true); }} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3 text-[13px] font-semibold text-brand">
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

/** The receipt as a real PDF: the full record (audit trail, IRS notes) for an accountant. */
export async function buildReceiptPdf(c: Charity, g: Gift, fmv: Fmv) {
  const { receiptPdf } = await import("@/lib/pdf");
  const ok = fmv && "usdPerUnit" in fmv ? fmv : null;
  const value = ok ? ok.usdPerUnit * g.units : null;
  return receiptPdf({
    receiptId: receiptId(g.hash, g.logIndex),
    testnet,
    charity: c,
    dateUtc: utc(g.time),
    units: unitsLabel(g.units, g.symbol),
    assetName: META[g.symbol]?.name ?? g.symbol,
    value: value !== null ? usd(value) : null,
    pricePerUnit: ok ? usd(ok.usdPerUnit) : null,
    priceSource: ok?.source ?? null,
    priceAsOf: ok ? utc(ok.asOf * 1000) : null,
    note: g.note,
    network: NETWORK_NAME,
    block: g.block.toString(),
    hash: g.hash,
    fromWallet: g.fromWallet,
    toWallet: c.wallet,
    explorerUrl: scanTxUrl(g.hash),
    donor: loadDonor(),
    notes: [
      ...giftNotes(c, value, g.symbol),
      "Generated by Osmo from the public blockchain. Not the charity's own acknowledgment and not tax advice.",
      ...(testnet ? [`On Monad testnet the charity wallet is a stand-in, so this gift never reached ${c.name}.`] : []),
    ],
  });
}

/** The charity receipt: the few facts that matter on screen, and the full record as a PDF. */
export function DonationReceipt({ c, g }: { c: Charity; g: Gift }) {
  const fmv = useFmv(g.symbol, g.time);
  const value = fmv && "usdPerUnit" in fmv ? fmv.usdPerUnit * g.units : null;
  const rid = receiptId(g.hash, g.logIndex);
  const [busy, setBusy] = useState(false);
  const file = `${c.handle}-receipt-${rid}.pdf`;
  const make = async (share: boolean) => {
    setBusy(true);
    try {
      const { downloadPdf, sharePdf } = await import("@/lib/pdf");
      const bytes = await buildReceiptPdf(c, g, fmv);
      if (!share || !(await sharePdf(bytes, file, `Donation receipt ${rid}`))) downloadPdf(bytes, file);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id="receipt" className="mt-5 scroll-mt-16">
      <div className="rounded-[28px] bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-brand">Charity receipt</p>
            <p className="mt-1 text-[17px] font-semibold leading-tight">{c.legalName}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              EIN {c.ein} · {c.status}
            </p>
          </div>
          <CharityLogo handle={c.handle} size={44} />
        </div>
        <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl bg-chip px-4 py-3">
          <div>
            <p className="text-[12px] text-muted">Value on the day you gave</p>
            <p className="tabular text-[26px] font-semibold leading-tight tracking-tight">{value !== null ? usd(value) : fmv ? "n/a" : "…"}</p>
          </div>
          <div className="text-right text-[13px]">
            <p className="font-semibold">{unitsLabel(g.units, g.symbol)}</p>
            <p className="text-muted">{new Date(g.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          </div>
        </div>
        <p className="mt-3 flex items-center justify-between text-[13px]">
          <span className={c.deductible ? "font-semibold text-money" : "font-semibold text-[#9A6412]"}>{c.deductible ? "Tax-deductible" : "Not tax-deductible"}</span>
          <span className="font-mono text-muted">#{rid}</span>
        </p>
        <div className="mt-3 border-t border-line pt-3">
          <DonorBlock />
        </div>
      </div>
      <button type="button" disabled={busy} onClick={() => make(false)} className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-[16px] font-semibold text-white disabled:opacity-50">
        <Download size={18} /> {busy ? "Making PDF…" : "Download PDF"}
      </button>
      <div className="mt-2 flex items-center justify-center gap-6">
        <button type="button" disabled={busy} onClick={() => make(true)} className="flex h-10 items-center gap-1.5 text-[14px] font-semibold text-brand">
          <Share2 size={15} /> Send to accountant
        </button>
        <a href={scanTxUrl(g.hash)} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-1 text-[14px] font-semibold text-brand">
          MonadScan <ArrowUpRight size={15} />
        </a>
      </div>
      {testnet && <p className="mt-1 text-center text-[12px] text-muted">Testnet demo: no real money moved, so this isn&apos;t a tax document.</p>}
    </div>
  );
}
