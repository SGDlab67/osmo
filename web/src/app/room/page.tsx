"use client";

import { useRequireAccount } from "@/lib/hooks";
import { RoomView } from "@/components/room-view";
import { Screen } from "@/components/shell";

export default function RoomPage() {
  const ok = useRequireAccount();
  if (!ok) return null;
  return (
    <Screen>
      <div className="px-4 pt-6">
        <h1 className="px-1 text-[30px] font-semibold tracking-tight">Live</h1>
        <p className="mt-1 px-1 pb-4 text-[15px] text-muted">Everyone paying on Osmo right now, straight from Monad.</p>
        <RoomView />
      </div>
    </Screen>
  );
}
