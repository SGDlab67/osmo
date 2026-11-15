import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Everything a donation receipt PDF shows. Built on the phone, so the donor's name never leaves it. */
export interface ReceiptData {
  receiptId: string;
  testnet: boolean;
  charity: { handle: string; legalName: string; ein: string; status: string; deductible: boolean; address: string; site: string };
  dateUtc: string;
  units: string;
  assetName: string;
  value: string | null;
  pricePerUnit: string | null;
  priceSource: string | null;
  priceAsOf: string | null;
  note: string;
  network: string;
  block: string;
  hash: string;
  fromWallet: string;
  toWallet: string;
  explorerUrl: string;
  donor: { name: string; address: string } | null;
  notes: string[];
}

export interface SummaryData {
  year: number;
  testnet: boolean;
  handle: string;
  wallet: string;
  made: string;
  total: string;
  deductible: string;
  donor: { name: string; address: string } | null;
  groups: { legalName: string; ein: string; status: string; deductible: boolean; subtotal: string; gifts: { date: string; asset: string; value: string; hash: string }[] }[];
  notes: string[];
}

const INK = rgb(0.078, 0.125, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const NAVY = rgb(0.122, 0.31, 0.51);
const LINE = rgb(0.88, 0.86, 0.82);
const AMBER_BG = rgb(0.984, 0.937, 0.851);
const AMBER = rgb(0.6, 0.39, 0.07);
const GREEN = rgb(0.17, 0.54, 0.34);

/** Standard PDF fonts only cover Latin-1, so drop emoji and other symbols rather than failing. */
const clean = (s: string) =>
  s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        // A single long token (a hash) is broken by characters.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let i = w.length;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          out.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    public font: PDFFont,
    public bold: PDFFont,
    public mono: PDFFont,
  ) {
    this.page = doc.addPage([612, 792]);
    this.y = 792 - 54;
  }
  readonly left = 54;
  readonly width = 612 - 108;
  ensure(h: number) {
    if (this.y - h < 54) {
      this.page = this.doc.addPage([612, 792]);
      this.y = 792 - 54;
    }
  }
  text(s: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.font;
    const lines = wrap(s, font, size, opts.width ?? this.width);
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x: opts.x ?? this.left, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size + (opts.gap ?? 4);
    }
  }
  rule(space = 10) {
    this.ensure(space * 2);
    this.y -= space;
    this.page.drawLine({ start: { x: this.left, y: this.y }, end: { x: this.left + this.width, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= space;
  }
  heading(s: string) {
    this.ensure(30);
    this.y -= 6;
    this.text(s.toUpperCase(), { size: 8.5, font: this.bold, color: MUTED, gap: 6 });
  }
  /** A label on the left, a value on the right that wraps within its column. */
  row(label: string, value: string, mono = false) {
    const size = 10;
    const valueX = this.left + 150;
    const valueW = this.width - 150;
    const font = mono ? this.mono : this.bold;
    const lines = wrap(value, font, mono ? 8.5 : size, valueW);
    this.ensure(lines.length * (size + 4) + 6);
    this.page.drawText(clean(label), { x: this.left, y: this.y - size, size, font: this.font, color: MUTED });
    for (const l of lines) {
      this.page.drawText(l, { x: valueX, y: this.y - size, size: mono ? 8.5 : size, font, color: INK });
      this.y -= size + 4;
    }
    this.y -= 4;
  }
  banner(s: string) {
    this.ensure(30);
    this.page.drawRectangle({ x: this.left, y: this.y - 24, width: this.width, height: 24, color: AMBER_BG });
    const w = this.bold.widthOfTextAtSize(clean(s), 9.5);
    this.page.drawText(clean(s), { x: this.left + (this.width - w) / 2, y: this.y - 16, size: 9.5, font: this.bold, color: AMBER });
    this.y -= 36;
  }
}

async function start() {
  const doc = await PDFDocument.create();
  const [font, bold, mono] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold), doc.embedFont(StandardFonts.Courier)]);
  return { doc, w: new Writer(doc, font, bold, mono) };
}

async function image(doc: PDFDocument, url: string) {
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    return url.endsWith(".jpg") ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

function header(w: Writer, title: string, sub: string) {
  w.page.drawText("Osmo", { x: w.left, y: w.y - 12, size: 12, font: w.bold, color: NAVY });
  const t = clean(title);
  w.page.drawText(t, { x: w.left + w.width - w.bold.widthOfTextAtSize(t, 12), y: w.y - 12, size: 12, font: w.bold, color: INK });
  w.y -= 18;
  const s = clean(sub);
  w.page.drawText(s, { x: w.left + w.width - w.font.widthOfTextAtSize(s, 9), y: w.y - 9, size: 9, font: w.font, color: MUTED });
  w.y -= 22;
}

function donorBlock(w: Writer, donor: { name: string; address: string } | null) {
  w.heading("Donor");
  if (donor?.name) {
    w.text(donor.name, { font: w.bold, size: 11 });
    if (donor.address) for (const l of donor.address.split("\n")) w.text(l, { color: MUTED });
  } else {
    w.text("Name: ______________________________________", { color: MUTED, gap: 10 });
    w.text("Address: ____________________________________", { color: MUTED });
  }
}

export async function receiptPdf(r: ReceiptData): Promise<Uint8Array> {
  const { doc, w } = await start();
  doc.setTitle(`Donation receipt ${r.receiptId}`);
  doc.setAuthor("Osmo");
  header(w, "Donation receipt", `Receipt ${r.receiptId}`);
  if (r.testnet) w.banner("Testnet demo. Not a tax document: no real money moved.");

  const logo = await image(doc, `/charities/${r.charity.handle}.png`);
  const top = w.y;
  if (logo) w.page.drawImage(logo, { x: w.left + w.width - 56, y: top - 56, width: 56, height: 56 });
  w.text(r.charity.legalName, { size: 16, font: w.bold, width: w.width - 70, gap: 5 });
  w.text(`EIN ${r.charity.ein}  ·  ${r.charity.status}  ·  ${r.charity.deductible ? "Tax-deductible" : "Not tax-deductible"}`, { color: r.charity.deductible ? GREEN : AMBER, font: w.bold, size: 9.5, width: w.width - 70 });
  w.text(r.charity.address, { color: MUTED, width: w.width - 70 });
  w.text(r.charity.site, { color: MUTED, width: w.width - 70 });
  w.y = Math.min(w.y, top - 62);

  w.rule(12);
  w.text("Fair market value on the day of the gift", { color: MUTED, size: 9.5 });
  w.text(r.value ?? "Unavailable", { size: 26, font: w.bold, gap: 6 });
  w.text(`${r.units} (${r.assetName})`, { font: w.bold });
  w.rule(12);

  w.heading("Gift");
  w.row("Date and time", r.dateUtc);
  w.row("Asset given", `${r.units} (${r.assetName})`);
  if (r.pricePerUnit) {
    w.row("Price per unit", r.pricePerUnit);
    w.row("Price source", r.priceSource ?? "");
    w.row("Price as of", r.priceAsOf ?? "");
  } else w.row("Fair market value", "Unavailable from the price source");
  if (clean(r.note)) w.row("Note", r.note);
  w.row("Goods or services", "None were provided in exchange for this gift");

  w.heading("Audit trail");
  w.row("Network", r.network);
  w.row("Block", r.block);
  w.row("Transaction", r.hash, true);
  w.row("From (donor wallet)", r.fromWallet, true);
  w.row("To (charity wallet)", r.toWallet, true);
  w.row("Verify", r.explorerUrl, true);

  donorBlock(w, r.donor);
  w.heading("Notes");
  for (const n of r.notes) w.text(`- ${n}`, { size: 8.5, color: MUTED });
  return doc.save();
}

export async function summaryPdf(s: SummaryData): Promise<Uint8Array> {
  const { doc, w } = await start();
  doc.setTitle(`Charitable giving summary ${s.year}`);
  doc.setAuthor("Osmo");
  header(w, `Giving summary ${s.year}`, `@${s.handle}  ·  ${s.wallet}  ·  made ${s.made}`);
  if (s.testnet) w.banner("Testnet demo. Not a tax document: no real money moved.");
  w.text(`Tax year ${s.year}`, { size: 20, font: w.bold, gap: 8 });
  w.row("Total given", s.total);
  w.row("To 501(c)(3) charities", `${s.deductible} (potentially deductible)`);
  for (const g of s.groups) {
    w.rule(10);
    w.text(g.legalName, { font: w.bold, size: 12, width: w.width - 90 });
    const sub = clean(g.subtotal);
    w.page.drawText(sub, { x: w.left + w.width - w.bold.widthOfTextAtSize(sub, 12), y: w.y + 4, size: 12, font: w.bold, color: INK });
    w.text(`EIN ${g.ein}  ·  ${g.status}  ·  ${g.deductible ? "deductible" : "not deductible"}`, { color: MUTED, size: 9 });
    w.y -= 4;
    for (const x of g.gifts) {
      w.ensure(28);
      const v = clean(x.value);
      w.page.drawText(clean(x.date), { x: w.left, y: w.y - 10, size: 10, font: w.bold, color: INK });
      w.page.drawText(clean(x.asset), { x: w.left + 90, y: w.y - 10, size: 10, font: w.font, color: INK });
      w.page.drawText(v, { x: w.left + w.width - w.font.widthOfTextAtSize(v, 10), y: w.y - 10, size: 10, font: w.font, color: INK });
      w.y -= 14;
      w.page.drawText(x.hash, { x: w.left + 90, y: w.y - 7.5, size: 7.5, font: w.mono, color: MUTED });
      w.y -= 14;
    }
  }
  w.rule(10);
  donorBlock(w, s.donor);
  w.heading("Notes");
  for (const n of s.notes) w.text(`- ${n}`, { size: 8.5, color: MUTED });
  return doc.save();
}

/** Save the PDF on the phone or laptop. */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Open the share sheet with the PDF attached (Mail, Messages, Files), where the browser supports it. */
export async function sharePdf(bytes: Uint8Array, filename: string, title: string): Promise<boolean> {
  const file = new File([bytes as BlobPart], filename, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title }).catch(() => {});
    return true;
  }
  return false;
}
