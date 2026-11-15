"use client";

import { useStore } from "@/lib/store";

/**
 * A slim bar at the top when the app can't reach Monad, so a failed load reads as "reconnecting", not as a
 * broken app. Hidden while everything is fine.
 */
export function ChainStatus() {
  const { status } = useStore();
  if (status !== "offline" && status !== "missing") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[55] mx-auto flex max-w-[430px] justify-center pt-[max(env(safe-area-inset-top),8px)]">
      <span className="slide-up inline-flex items-center gap-2 rounded-full bg-ink/90 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-lg backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${status === "offline" ? "blink bg-[#f2c14e]" : "bg-[#e85d4a]"}`} />
        {status === "offline" ? "Reconnecting to Monad…" : "Osmo isn't deployed on this network yet"}
      </span>
    </div>
  );
}
