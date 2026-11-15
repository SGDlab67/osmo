"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { META, unitsLabel, usd } from "@/lib/assets";
import { useStore } from "@/lib/store";
import { AssetDot, Mark } from "./ui";

let audio: AudioContext | null = null;

/** Phones only play sound after a tap, so open the audio context on the first one. */
function primeAudio() {
  if (audio || typeof window === "undefined") return;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) audio = new Ctx();
}

/** A soft two-note chime, like a message arriving. */
function chime() {
  if (!audio) return;
  audio.resume().catch(() => {});
  const now = audio.currentTime;
  [880, 1318.5].forEach((f, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, now + i * 0.11);
    g.gain.linearRampToValueAtTime(0.12, now + i * 0.11 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.45);
    o.connect(g).connect(audio!.destination);
    o.start(now + i * 0.11);
    o.stop(now + i * 0.11 + 0.5);
  });
}

/**
 * The "you got paid" notification: slides down from the top like an iPhone notification when a payment to you
 * lands on Monad. Tap to open it, swipe up to dismiss, or it goes by itself after a few seconds.
 */
export function ArrivalBanner() {
  const { arrivals, dismissArrival, personOf, prices } = useStore();
  const router = useRouter();
  const p = arrivals[0];
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    window.addEventListener("pointerdown", primeAudio, { once: true });
    return () => window.removeEventListener("pointerdown", primeAudio);
  }, []);

  useEffect(() => {
    if (!p) return;
    chime();
    navigator.vibrate?.([25, 60, 25]);
    const t = window.setTimeout(() => setLeaving(true), 6000);
    return () => window.clearTimeout(t);
  }, [p]);

  useEffect(() => {
    if (!leaving || !p) return;
    const t = window.setTimeout(() => {
      dismissArrival(p.id);
      setLeaving(false);
      setDragY(0);
    }, 260);
    return () => window.clearTimeout(t);
  }, [leaving, p, dismissArrival]);

  if (!p) return null;
  const from = personOf(p.from);
  const first = from.name.split(" ")[0] || `@${p.from}`;
  const price = prices[p.symbol]?.price;
  const amount = price ? usd(p.units * price) : unitsLabel(p.units, p.symbol);
  const asset = p.symbol === "USDC" ? "dollars" : (META[p.symbol]?.name ?? p.symbol);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto max-w-[430px] px-2.5 pt-[max(env(safe-area-inset-top),10px)]">
      <button
        type="button"
        key={p.id}
        aria-live="polite"
        onClick={() => {
          if (Math.abs(dragY) > 6) return;
          setLeaving(true);
          router.push(`/p/${p.hash}`);
        }}
        onPointerDown={(e) => {
          start.current = e.clientY;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => start.current !== null && setDragY(Math.min(0, e.clientY - start.current))}
        onPointerUp={() => {
          if (dragY < -30) setLeaving(true);
          else setDragY(0);
          start.current = null;
        }}
        className={`no-press pointer-events-auto flex w-full touch-none items-center gap-3 rounded-[24px] bg-white/85 p-3 pr-3.5 text-left shadow-[0_10px_40px_rgba(20,32,46,0.22)] ring-1 ring-black/5 backdrop-blur-2xl ${leaving ? "banner-out" : "banner-in"}`}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-b from-[#2A62A0] to-brand text-white shadow-sm">
          <Mark size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold leading-tight">Osmo</span>
            <span className="text-[13px] text-muted">now</span>
          </span>
          <span className="mt-0.5 block text-[15px] leading-snug">
            <span className="font-semibold">{first}</span> sent you <span className="font-semibold">{amount}</span> in {asset}
          </span>
          {p.note && <span className="block truncate text-[14px] leading-snug text-muted">{p.note}</span>}
        </span>
        <AssetDot symbol={p.symbol} size={38} />
      </button>
    </div>
  );
}
