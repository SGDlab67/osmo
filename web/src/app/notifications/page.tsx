"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { usd } from "@/lib/assets";
import { useNow, useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { Sentence } from "@/components/feed-card";
import { BackHeader, Screen } from "@/components/shell";
import { Avatar, Card, EmptyState, ago } from "@/components/ui";

export default function NotificationsPage() {
  const ok = useRequireAccount();
  const { me, feed, requests, personOf } = useStore();
  const now = useNow();
  if (!ok || !me) return null;
  const got = feed.filter((p) => p.to === me.handle);
  const asks = requests.filter((r) => r.payer === me.handle && r.status === "open");
  return (
    <Screen tabs={false}>
      <BackHeader title="Notifications" fallback="/me" />
      <div className="px-4">
        <Card className="divide-y divide-line py-1">
          {asks.map((r) => (
            <Link key={`r${r.id}`} href="/requests" className="flex items-center gap-3 py-3">
              <Avatar handle={r.from} size={44} />
              <p className="flex-1 text-[15px] leading-snug text-muted">
                <span className="font-semibold text-ink">{personOf(r.from).name}</span> requested <span className="font-semibold text-ink">{usd(r.usd)}</span>
                {r.note ? ` for ${r.note}` : ""}
              </p>
            </Link>
          ))}
          {got.map((p) => (
            <Link key={p.id} href={`/p/${p.hash}`} className="flex items-center gap-3 py-3">
              <Avatar handle={p.from} size={44} />
              <div className="min-w-0 flex-1">
                <Sentence p={p} size="sm" />
                <p className="mt-0.5 text-[13px] text-muted">{now ? ago(p.time, now) : ""}</p>
              </div>
            </Link>
          ))}
          {asks.length + got.length === 0 && <EmptyState icon={Bell} title="All caught up" text="Payments you receive and requests for you show up here." />}
        </Card>
      </div>
    </Screen>
  );
}
