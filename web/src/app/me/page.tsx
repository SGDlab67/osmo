"use client";

import Link from "next/link";
import { Bell, ChevronRight, QrCode, Radio, Send, Settings, Share } from "lucide-react";
import { useState } from "react";
import { usd } from "@/lib/assets";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { ActivityRow } from "@/components/feed-card";
import { RequestCards } from "@/components/request-cards";
import { Screen } from "@/components/shell";
import { Avatar, Card, DemoNote, EmptyState, Flag, SectionTitle } from "@/components/ui";

export default function MePage() {
  const ok = useRequireAccount();
  const { me, friends, totalUsd, feed, requests, hideBalances } = useStore();
  const [copied, setCopied] = useState(false);
  if (!ok || !me) return null;
  const mine = feed.filter((p) => p.from === me.handle || p.to === me.handle);
  const unread = mine.some((p) => p.to === me.handle) || requests.some((r) => r.payer === me.handle && r.status === "open");
  const share = async () => {
    const url = `${location.origin}/u/${me.handle}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `@${me.handle}`, url });
        return;
      } catch {}
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
  };
  return (
    <Screen>
      <div className="flex items-center justify-end gap-2 px-4 pt-4">
        <Link href="/notifications" aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white">
          <Bell size={20} />
          {unread && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[#E5484D] ring-2 ring-white" />}
        </Link>
        <Link href="/me/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
          <Settings size={20} />
        </Link>
      </div>

      <div className="flex flex-col items-center px-6 pt-2">
        <Link href="/me/code" className="relative" aria-label="Your code">
          <Avatar handle={me.handle} size={104} />
          <span className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white ring-4 ring-page">
            <QrCode size={18} />
          </span>
        </Link>
        <h1 className="mt-4 flex items-center gap-2 text-[26px] font-semibold tracking-tight">
          {me.name} <Flag code={me.country} className="text-[22px]" />
        </h1>
        <p className="text-[16px] text-muted">@{me.handle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-5">
        <Link href="/friends" className="rounded-[22px] bg-white p-4">
          <p className="text-[14px] font-medium text-muted">Friends</p>
          <p className="mt-1 text-[24px] font-semibold">{friends.length}</p>
        </Link>
        <Link href="/portfolio" className="rounded-[22px] bg-white p-4">
          <p className="text-[14px] font-medium text-muted">Portfolio</p>
          <p className="tabular mt-1 text-[24px] font-semibold tracking-tight">{hideBalances ? "$•••••" : usd(totalUsd)}</p>
        </Link>
      </div>

      <div className="px-4 pt-3">
        <Link href="/live" className="flex items-center gap-3 rounded-[22px] bg-[#0F2C4D] p-4 text-[#F3EEE5]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3EEE5]/15">
            <Radio size={20} />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">Live on Monad</span>
            <span className="block text-[13px] text-[#F3EEE5]/70">The room screen: every payment as it lands, with a join code.</span>
          </span>
          <ChevronRight size={18} className="text-[#F3EEE5]/70" />
        </Link>
      </div>
      <div className="px-4 pt-3">
        <div className="flex items-center gap-3 rounded-[22px] bg-white p-4">
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">Your profile</span>
            <span className="block text-[13px] text-muted">
              {me.privatePortfolio ? "Portfolio hidden" : "Visible to everyone"} ·{" "}
              <Link href="/me/settings" className="hit font-semibold text-brand">
                Edit
              </Link>
            </span>
          </span>
          <Link href={`/u/${me.handle}`} className="rounded-full bg-chip px-3.5 py-2 text-[14px] font-semibold">
            View
          </Link>
          <button type="button" onClick={share} className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-[14px] font-semibold text-white">
            <Share size={15} /> {copied ? "Copied" : "Share"}
          </button>
        </div>
      </div>

      <div className="px-4">
        <SectionTitle>Requests</SectionTitle>
        <RequestCards showEmpty />
        <SectionTitle>Your activity</SectionTitle>
        <Card className="divide-y divide-line py-1">
          {mine.map((p) => (
            <ActivityRow key={p.id} p={p} />
          ))}
          {mine.length === 0 && <EmptyState icon={Send} title="No payments yet" text="Pay a friend a slice of your portfolio and it shows up here." action={{ label: "Make your first payment", href: "/pay" }} />}
        </Card>
      </div>
      <DemoNote />
    </Screen>
  );
}
