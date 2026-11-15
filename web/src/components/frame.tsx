"use client";

import { QRCodeSVG } from "qrcode.react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Mark } from "./ui";

const noSub = () => () => {};

/** Phone-sized frame on a computer, with a QR code to open the same app on a phone. */
export function Frame({ children }: { children: ReactNode }) {
  const origin = useSyncExternalStore(noSub, () => window.location.origin, () => "");
  const local = /localhost|127\.0\.0\.1/.test(origin);
  const bare = useSyncExternalStore(noSub, () => window.location.pathname.startsWith("/live"), () => false);
  if (bare) return <>{children}</>;
  return (
    <div className="stage">
      <div className="frame">
        <div className="frame-scroll" id="scroller">
          {children}
        </div>
      </div>
      <aside className="hidden w-[300px] min-[820px]:block">
        <p className="flex items-center gap-2.5 text-[28px] font-bold tracking-tight text-brand">
          <Mark size={34} /> Osmo
        </p>
        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight">Pay friends in stocks and crypto, on Monad.</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">Scan with your phone to open it there. The frame is the same app at phone size.</p>
        <div className="mt-6 inline-block rounded-[28px] bg-white p-5">
          {origin && !local ? (
            <QRCodeSVG value={origin} size={168} level="M" fgColor="#14202e" />
          ) : (
            <p className="flex h-[168px] w-[168px] items-center text-center text-[13px] text-muted">Running on this computer. Deploy it to get a code a phone can scan.</p>
          )}
        </div>
        <a href="/live" className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold">
          Open the room screen
        </a>
      </aside>
    </div>
  );
}
