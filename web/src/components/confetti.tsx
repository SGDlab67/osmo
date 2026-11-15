"use client";

import { useMemo } from "react";

/** A short burst of confetti for a finished payment. Pure CSS, no library. */
export function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 9) * 0.05,
        dur: 1.1 + ((i * 13) % 7) / 10,
        color: ["#1f4f82", "#2b8a57", "#f2c14e", "#e85d4a", "#7fc8a9"][i % 5],
        rot: (i * 47) % 360,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`@keyframes fall{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(110vh) rotate(540deg);opacity:.2}}`}</style>
      {bits.map((b, i) => (
        <span key={i} className="absolute top-0 block h-3 w-2 rounded-[2px]" style={{ left: `${b.left}%`, background: b.color, transform: `rotate(${b.rot}deg)`, animation: `fall ${b.dur}s ${b.delay}s ease-in both` }} />
      ))}
    </div>
  );
}
