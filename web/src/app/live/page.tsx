"use client";

import { QRCodeSVG } from "qrcode.react";
import { useSyncExternalStore } from "react";
import { RoomView } from "@/components/room-view";
import { Mark } from "@/components/ui";

const noSub = () => () => {};

/** Projector screen: join QR on the left, the room's payments landing live on the right. */
export default function LivePage() {
  const origin = useSyncExternalStore(noSub, () => location.origin, () => "");
  return (
    <div className="grid min-h-dvh grid-cols-[360px_1fr] gap-10 bg-page p-10">
      <aside className="flex flex-col rounded-[32px] bg-splash p-8 text-[#f3eee5]">
        <p className="flex items-center gap-3 text-[30px] font-bold tracking-tight">
          <Mark size={40} /> Osmo
        </p>
        <p className="mt-4 text-[24px] font-semibold leading-snug">Scan to join.</p>
        <p className="mt-1 text-[18px] leading-snug text-[#f3eee5]/75">Make a username, get $150 of test stocks and crypto, and pay someone in this room.</p>
        <div className="mt-8 self-start rounded-[24px] bg-white p-5">{origin && <QRCodeSVG value={origin} size={264} level="M" fgColor="#0f2c4d" />}</div>
        <p className="mt-4 text-[17px] font-semibold">{origin.replace(/^https?:\/\//, "")}</p>
        <p className="mt-auto text-[15px] leading-snug text-[#f3eee5]/60">Every payment is signed on the phone and settles on Monad in under a second.</p>
      </aside>
      <main>
        <RoomView big />
      </main>
    </div>
  );
}
