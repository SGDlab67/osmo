"use client";

import Link from "next/link";
import { useState } from "react";
import { Inbox } from "lucide-react";
import { usd } from "@/lib/assets";
import { useStore } from "@/lib/store";
import { shortName } from "./feed-card";
import { Avatar, Card, EmptyState, GhostButton } from "./ui";

/** Open requests on Monad: ones I need to pay (Pay / Decline) and ones I sent (Cancel). */
export function RequestCards({ showEmpty = false }: { showEmpty?: boolean }) {
  const { requests, me, personOf, closeRequest } = useStore();
  const [busy, setBusy] = useState<number | null>(null);
  if (!me) return null;
  const incoming = requests.filter((r) => r.payer === me.handle && r.status === "open");
  const outgoing = requests.filter((r) => r.from === me.handle && r.status === "open");
  if (!incoming.length && !outgoing.length)
    return showEmpty ? (
      <Card className="!p-0">
        <EmptyState icon={Inbox} title="No requests waiting" text="When someone asks you for money, it shows up here." />
      </Card>
    ) : null;
  const close = async (id: number, s: "declined" | "cancelled") => {
    setBusy(id);
    try {
      await closeRequest(id, s);
    } finally {
      setBusy(null);
    }
  };
  const note = (n: string) =>
    n ? (
      <>
        {" "}
        for <span className="font-semibold text-ink">{n}</span>
      </>
    ) : null;
  return (
    <div className="space-y-3">
      {incoming.map((r) => (
        <Card key={r.id}>
          <div className="flex items-start gap-3">
            <Avatar handle={r.from} size={44} />
            <p className="flex-1 text-[17px] leading-snug text-muted">
              <span className="font-semibold text-ink">{shortName(personOf(r.from).name)}</span> requests <span className="font-semibold text-ink">{usd(r.usd)}</span>
              {note(r.note)}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <Link href={`/pay?to=${r.from}&amount=${r.usd}&note=${encodeURIComponent(r.note)}&request=${r.id}`} className="flex h-11 flex-1 items-center justify-center rounded-full bg-brand text-[16px] font-semibold text-white">
              Pay
            </Link>
            <GhostButton disabled={busy === r.id} onClick={() => close(r.id, "declined")} className="h-11 flex-1">
              {busy === r.id ? "…" : "Decline"}
            </GhostButton>
          </div>
        </Card>
      ))}
      {outgoing.map((r) => (
        <Card key={r.id}>
          <div className="flex items-start gap-3">
            <Avatar handle={r.payer} size={44} />
            <div className="flex-1">
              <p className="text-[17px] leading-snug text-muted">
                You requested <span className="font-semibold text-ink">{usd(r.usd)}</span> from <span className="font-semibold text-ink">{shortName(personOf(r.payer).name)}</span>
                {note(r.note)}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">Waiting</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <GhostButton disabled={busy === r.id} onClick={() => close(r.id, "cancelled")} className="h-11 flex-1">
              {busy === r.id ? "…" : "Cancel"}
            </GhostButton>
          </div>
        </Card>
      ))}
    </div>
  );
}
