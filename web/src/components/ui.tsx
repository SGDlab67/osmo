"use client";

import Link from "next/link";
import { Check, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { META } from "@/lib/assets";
import { countryName, flagOf } from "@/lib/countries";
import { CHARACTERS, PIXELS, defaultPicture, pictureUrl } from "@/lib/people";
import { useStore } from "@/lib/store";

/** The Slice: our logo, a portfolio with one piece being sent. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="8 8 48 48" className={className} aria-hidden>
      <path d="M30 34 L30 14 A20 20 0 1 0 47.3 44 Z" fill="currentColor" />
      <path d="M35 30 L35 10 A20 20 0 0 1 52.3 40 Z" fill="currentColor" opacity={0.55} />
    </svg>
  );
}

export function Picture({ picture, size = 40, ring = false }: { picture: string; size?: number; ring?: boolean }) {
  return (
    <span
      role="img"
      aria-hidden
      className={`inline-block shrink-0 rounded-full bg-chip bg-cover bg-center ${ring ? "ring-2 ring-white" : ""}`}
      style={{ width: size, height: size, backgroundImage: `url(${pictureUrl(picture)})`, imageRendering: picture.startsWith("px") || picture.startsWith("person:") ? "pixelated" : undefined }}
    />
  );
}

export function Avatar({ handle, size = 40, ring = false }: { handle: string; size?: number; ring?: boolean }) {
  const { personOf } = useStore();
  return <Picture picture={personOf(handle).picture || defaultPicture(handle)} size={size} ring={ring} />;
}

export function Flag({ code, className = "" }: { code?: string; className?: string }) {
  if (!code) return null;
  return (
    <span title={countryName(code)} aria-label={countryName(code)} className={className}>
      {flagOf(code)}
    </span>
  );
}

export function AssetDot({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const m = META[symbol];
  return (
    <span
      className="inline-block shrink-0 rounded-full bg-white bg-cover bg-center ring-1 ring-black/5"
      style={{ width: size, height: size, backgroundImage: m ? `url(${m.logo})` : undefined }}
      aria-hidden
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] bg-white p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = "",
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  href?: string;
}) {
  const cls = `flex h-14 w-full items-center justify-center rounded-full bg-brand text-lg font-semibold text-white disabled:opacity-40 ${className}`;
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = "", disabled }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex h-10 items-center justify-center rounded-full bg-chip px-4 text-[15px] font-semibold text-ink disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}

/** A day's move, with an arrow: ▲ 1.20% in green or ▼ 0.40% in red. */
export function Change({ pct, className = "" }: { pct: number; className?: string }) {
  if (!pct) return <span className={`text-muted ${className}`}>0.00%</span>;
  const up = pct > 0;
  return (
    <span className={`${up ? "text-money" : "text-down"} ${className}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

/** The asset a payment was sent in. The receiver gets the same asset. */
export function AssetChip({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-chip px-2.5 text-[13px] font-medium text-ink">
      <AssetDot symbol={symbol} size={20} />
      {symbol === "USDC" ? "Dollars" : (META[symbol]?.name ?? symbol)}
    </span>
  );
}

/** One look for every empty list: an icon in a soft circle, a title, one line of help, and an optional button. */
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon size={24} />
      </span>
      <p className="mt-3 text-[16px] font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-[280px] text-[14px] leading-snug text-muted">{text}</p>}
      {action && (
        <Link href={action.href} className="mt-4 inline-flex h-11 items-center rounded-full bg-brand px-5 text-[15px] font-semibold text-white">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** The note at the foot of each main screen. */
export function DemoNote() {
  return (
    <p className="px-6 pb-4 pt-8 text-center text-xs leading-relaxed text-muted">
      Live on Monad testnet. Demo assets are test tokens that follow real prices. Not shares or coins, and nothing here is advice.
    </p>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] items-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="no-press absolute inset-0 bg-black/40" />
      <div className="slide-up relative max-h-[85%] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(env(safe-area-inset-bottom),32px)] text-ink">
        <div className="-mx-5 -mt-5 mb-1 flex justify-center pb-3 pt-3">
          <div className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        {title && <h2 className="mb-4 text-xl font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/** The picture picker: cartoon characters and pixel NFTs. */
export function PicturePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const group = (title: string, ids: string[]) => (
    <div>
      <p className="mb-2 mt-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="mb-4 grid grid-cols-5 gap-2.5">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            aria-label={id}
            aria-pressed={value === id}
            onClick={() => onPick(id)}
            className={`relative aspect-square rounded-full bg-chip bg-cover bg-center transition-transform active:scale-95 ${value === id ? "ring-[3px] ring-brand ring-offset-2 ring-offset-page" : ""}`}
            style={{ backgroundImage: `url(${pictureUrl(id)})`, imageRendering: id.startsWith("px") ? "pixelated" : undefined }}
          >
            {value === id && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-page">
                <Check size={12} strokeWidth={3.2} />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      {group("Pixel NFTs", PIXELS)}
      {group("Characters", CHARACTERS)}
    </>
  );
}
