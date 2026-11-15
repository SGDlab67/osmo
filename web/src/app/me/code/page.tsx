"use client";

import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { BackHeader, Screen } from "@/components/shell";
import { Avatar, Flag } from "@/components/ui";

const noSub = () => () => {};

export default function CodePage() {
  const ok = useRequireAccount();
  const { me } = useStore();
  const origin = useSyncExternalStore(noSub, () => location.origin, () => "");
  if (!ok || !me) return null;
  return (
    <Screen tabs={false}>
      <BackHeader title="Your code" fallback="/me" />
      <div className="flex flex-col items-center px-6 pt-4 text-center">
        <div className="rounded-[32px] bg-white px-8 pb-7 pt-8">
          <div className="flex flex-col items-center">
            <Avatar handle={me.handle} size={72} />
            <p className="mt-3 flex items-center gap-1.5 text-[20px] font-semibold">
              {me.name} <Flag code={me.country} />
            </p>
            <p className="text-[15px] text-muted">@{me.handle}</p>
          </div>
          <div className="mt-5">{origin && <QRCodeSVG value={`${origin}/pay?to=${me.handle}`} size={220} level="M" fgColor="#14202e" />}</div>
        </div>
        <p className="mt-4 max-w-[280px] text-[15px] text-muted">Friends scan this with their phone camera to pay you on Osmo.</p>
      </div>
    </Screen>
  );
}
