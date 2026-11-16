"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ChevronRight, Plus, UsersRound } from "lucide-react";
import { usd } from "@/lib/assets";
import { useRequireAccount } from "@/lib/hooks";
import { EVENT_TAG, JUDGE_TAG } from "@/lib/people";
import { useStore } from "@/lib/store";
import { FeedCard } from "@/components/feed-card";
import { Screen, SearchBar } from "@/components/shell";
import { AssetDot, Avatar, DemoNote, EmptyState, Mark } from "@/components/ui";
import { CharityLogo } from "@/components/charity-ui";
import { FEATURED } from "@/lib/charities";

const noSub = () => () => {};
function greetingNow() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const ok = useRequireAccount();
  const { me, people, feed, canSee, totalUsd, cashUsd, requests, friends, addFriend, personOf, hideBalances, charities } = useStore();
  const greet = useSyncExternalStore(noSub, greetingNow, () => "Hi");
  const [scope, setScope] = useState<"friends" | "everyone">("friends");
  if (!ok || !me) return <Screen tabs={false}>{null}</Screen>;

  const waiting = requests.filter((r) => r.payer === me.handle && r.status === "open").length;
  // Event builders you haven't added yet first, so the row always has someone to add.
  const event = people
    .filter((p) => (p.tag === EVENT_TAG || p.tag === JUDGE_TAG) && p.handle !== me.handle)
    .sort((a, b) => Number(friends.includes(a.handle)) - Number(friends.includes(b.handle)) || Number(b.tag === JUDGE_TAG) - Number(a.tag === JUDGE_TAG) || Number(b.joined) - Number(a.joined));
  const top = [...friends, ...people.filter((p) => p.joined && p.handle !== me.handle).map((p) => p.handle)].filter((h, i, a) => a.indexOf(h) === i).slice(0, 6);
  const visible = feed.filter(canSee);
  const shown = scope === "everyone" ? visible.filter((p) => !p.isPrivate) : visible.filter((p) => [p.from, p.to].some((h) => h === me.handle || friends.includes(h)));

  return (
    <Screen>
      <SearchBar give={charities.length > 0} />
      <p className="px-5 pb-2 text-[22px] font-semibold tracking-tight">
        {greet}, {me.name.split(" ")[0]}
      </p>

      <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-1 pt-1">
        {top.map((h) => (
          <Link key={h} href={`/pay?to=${h}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <Avatar handle={h} size={60} />
            <span className="w-full truncate text-center text-[13px] font-medium">{personOf(h).name.split(" ")[0]}</span>
          </Link>
        ))}
        <Link href="/friends" className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white text-2xl text-brand">+</span>
          <span className="text-[13px] font-medium text-brand">Add</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <Link href="/portfolio" className="rounded-[22px] bg-white p-4">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <Mark size={15} className="text-brand" /> Portfolio
          </span>
          <span className="tabular mt-1 block text-[22px] font-semibold tracking-tight">{hideBalances ? "$•••••" : usd(totalUsd - cashUsd)}</span>
          <span className="mt-0.5 block text-[12px] text-muted">Stocks, crypto & more</span>
        </Link>
        <div className="flex flex-col rounded-[22px] bg-white p-4">
          <Link href="/portfolio#cash" className="block">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
              <span className="flex -space-x-1.5">
                {["USDC", "USDT", "PYUSD"].map((s) => (
                  <span key={s} className="rounded-full ring-2 ring-white">
                    <AssetDot symbol={s} size={15} />
                  </span>
                ))}
              </span>
              Stablecoins
            </span>
            <span className="tabular mt-1 block text-[22px] font-semibold tracking-tight">{hideBalances ? "$•••••" : usd(cashUsd)}</span>
          </Link>
          <Link href="/buy?asset=USDC" className="mt-1.5 inline-flex h-7 w-fit items-center gap-1 rounded-full bg-brand px-2.5 text-[12px] font-semibold text-white">
            <Plus size={13} strokeWidth={2.8} /> Add money
          </Link>
        </div>
      </div>

      {charities.length > 0 && (
        <Link href="/give" className="mx-4 mt-3 flex items-center gap-3 rounded-[22px] bg-white px-4 py-3">
          <span className="flex -space-x-2.5">
            {[FEATURED, "stjude", "redcross", "msf"].filter((h) => charities.some((c) => c.handle === h)).map((h) => (
              <CharityLogo key={h} handle={h} size={34} ring />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Give to a cause</span>
            <span className="block truncate text-[13px] text-muted">Stocks or crypto, with a receipt for taxes</span>
          </span>
          <ChevronRight size={18} className="text-muted" />
        </Link>
      )}

      {waiting > 0 && (
        <Link href="/requests" className="mx-4 mt-3 flex items-center gap-3 rounded-[22px] bg-white px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[14px] font-bold text-brand">{waiting}</span>
          <span className="flex-1 text-[15px] font-semibold">{waiting === 1 ? "Request" : "Requests"} waiting for you</span>
          <ChevronRight size={18} className="text-muted" />
        </Link>
      )}

      {event.length > 0 && (
        <div className="pt-5">
          <div className="flex items-center justify-between px-5 pb-2">
            <p className="text-[15px] font-semibold">At {EVENT_TAG}</p>
            <Link href="/friends#event" className="hit text-[14px] font-semibold text-brand">
              See all {event.length}
            </Link>
          </div>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1">
            {event.slice(0, 14).map((p) => {
              const [first, ...last] = p.name.split(" ");
              return (
                <div key={p.handle} className="flex w-[112px] shrink-0 flex-col items-center rounded-[20px] bg-white px-2 pb-2.5 pt-3">
                  <Link href={`/u/${p.handle}`} className="flex w-full flex-col items-center">
                    <Avatar handle={p.handle} size={52} />
                    <span className="mt-1.5 w-full truncate text-center text-[14px] font-semibold">{first}</span>
                    <span className="w-full truncate text-center text-[12px] text-muted">{last.join(" ")}</span>
                  </Link>
                  {friends.includes(p.handle) ? (
                    <span className="mt-2 h-7 text-[12px] font-semibold leading-7 text-muted">Friends</span>
                  ) : (
                    <button type="button" onClick={() => addFriend(p.handle)} className="mt-2 h-7 rounded-full bg-brand px-3.5 text-[12px] font-semibold text-white">
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-4 mt-5 flex rounded-full bg-white p-1 text-[15px] font-semibold">
        {(["friends", "everyone"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setScope(s)} className={`h-10 flex-1 rounded-full capitalize ${scope === s ? "bg-ink text-white" : "text-muted"}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-2.5 px-4 pt-3">
        {shown.map((p) => (
          <FeedCard key={p.id} p={p} />
        ))}
        {shown.length === 0 && (
          <div className="rounded-[28px] bg-white">
            {scope === "friends" ? (
              <EmptyState icon={UsersRound} title="Nothing here yet" text="Add a few friends to see what they are paying for." action={{ label: "Find friends", href: "/friends" }} />
            ) : (
              <EmptyState icon={UsersRound} title="No payments yet" text="Pay someone a piece of your portfolio and it shows up here." action={{ label: "Make the first payment", href: "/pay" }} />
            )}
          </div>
        )}
      </div>
      <DemoNote />
    </Screen>
  );
}
