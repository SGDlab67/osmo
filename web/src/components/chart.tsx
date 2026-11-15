"use client";

import { useEffect, useState, type PointerEvent } from "react";

export type Range = "1D" | "1W" | "1M";
export const RANGE_DAYS: Record<Range, string> = { "1D": "1", "1W": "7", "1M": "30" };
export const RANGE_WORDS: Record<Range, string> = { "1D": "today", "1W": "this week", "1M": "this month" };

/** Evenly resample a series to n points so lines of different lengths can be added together. */
export function resample(s: number[], n: number) {
  if (s.length === 0) return [];
  return Array.from({ length: n }, (_, i) => s[Math.round((i / (n - 1)) * (s.length - 1))]);
}

/** Live price history for one asset over a range, from /api/chart. */
export function useHistory(symbols: string[], range: Range) {
  const [data, setData] = useState<Record<string, number[]>>({});
  const key = symbols.join(",") + range;
  useEffect(() => {
    let alive = true;
    Promise.all(symbols.map((s) => fetch(`/api/chart?symbol=${s}&days=${RANGE_DAYS[range]}`).then((r) => r.json()).then((pts: number[]) => [s, pts] as const).catch(() => [s, []] as const))).then(
      (rows) => alive && setData(Object.fromEntries(rows)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return data;
}

/** A line chart. Pass `onScrub` to let a finger or the mouse run along it. */
export function Sparkline({ series, up, height = 120, scrub = null, onScrub }: { series: number[]; up: boolean; height?: number; scrub?: number | null; onScrub?: (i: number | null) => void }) {
  const w = 360;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, height - 8 - ((v - min) / span) * (height - 16)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;
  const color = up ? "var(--money)" : "var(--down)";
  const last = pts[pts.length - 1];
  const mark = scrub !== null && pts[scrub] ? pts[scrub] : null;
  const at = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onScrub?.(Math.round(t * (series.length - 1)));
  };
  const handlers = onScrub
    ? {
        onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          at(e);
        },
        onPointerMove: at,
        onPointerUp: (e: PointerEvent<SVGSVGElement>) => e.pointerType !== "mouse" && onScrub(null),
        onPointerLeave: () => onScrub(null),
        onPointerCancel: () => onScrub(null),
      }
    : {};
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height, touchAction: onScrub ? "pan-y" : undefined, cursor: onScrub ? "crosshair" : undefined }} aria-hidden {...handlers}>
      <path d={area} fill={color} opacity={0.08} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {mark ? (
        <>
          <line x1={mark[0]} x2={mark[0]} y1={0} y2={height} stroke="var(--ink)" strokeWidth={1} opacity={0.35} vectorEffect="non-scaling-stroke" />
          <circle cx={mark[0]} cy={mark[1]} r={5} fill="var(--ink)" stroke="white" strokeWidth={2} />
        </>
      ) : (
        last && <circle cx={last[0] - 3} cy={last[1]} r={4} fill={color} />
      )}
    </svg>
  );
}

export function RangeTabs({ active, onChange }: { active: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex justify-center gap-3 px-1 pt-2 text-[13px] font-semibold text-muted">
      {(["1D", "1W", "1M"] as Range[]).map((r) => (
        <button key={r} type="button" onClick={() => onChange(r)} aria-pressed={r === active} className={`h-8 min-w-11 rounded-full px-3 ${r === active ? "bg-ink text-white" : ""}`}>
          {r}
        </button>
      ))}
    </div>
  );
}

/** A tiny 7-day line for list rows. */
export function MiniLine({ series, up }: { series?: number[]; up: boolean }) {
  if (!series || series.length < 2) return <span className="w-14 shrink-0" />;
  const s = resample(series, 28);
  const mid = (Math.min(...s) + Math.max(...s)) / 2;
  const span = Math.max(Math.max(...s) - Math.min(...s), mid * 0.03) || 1;
  const min = mid - span / 2;
  const d = s.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (s.length - 1)) * 56).toFixed(1)},${(20 - ((v - min) / span) * 18 - 1).toFixed(1)}`).join(" ");
  return (
    <svg width="56" height="20" viewBox="0 0 56 20" aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke={up ? "#2B8A57" : "#C8433A"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
