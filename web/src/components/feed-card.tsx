"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, SmilePlus } from "lucide-react";
import { useRef, useState } from "react";
import { usd } from "@/lib/assets";
import type { Payment } from "@/lib/feed";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { AssetChip, Avatar, Card, ago } from "./ui";

export const REACTIONS = ["❤️", "🔥", "😂", "🙏", "🎉"];

/** "Sabina O." from "Sabina Okafor". */
export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}

export function Sentence({ p, size = "md" }: { p: Payment; size?: "md" | "sm" }) {
  const { me, personOf, prices } = useStore();
  const mine = me && (p.from === me.handle || p.to === me.handle);
  const value = p.units * (prices[p.symbol]?.price ?? 0);
  const av = size === "md" ? 22 : 20;
  const name = (h: string, capital: boolean) =>
    h === me?.handle ? (
      <span className="font-semibold text-ink">{capital ? "You" : "you"}</span>
    ) : (
      <span className="font-semibold text-ink">
        <span className="mr-1.5 inline-block align-[-0.18em]">
          <Avatar handle={h} size={av} />
        </span>
        {shortName(personOf(h).name)}
      </span>
    );
  return (
    <p className={`${size === "md" ? "text-[17px]" : "text-[15px]"} font-medium leading-snug tracking-tight text-muted`}>
      {name(p.from, true)} paid {name(p.to, false)}
      {mine && <span className="font-semibold text-ink"> {usd(value)}</span>}
      {p.note && (
        <>
          {" "}
          for <span className="font-semibold text-ink">{p.note}</span>
        </>
      )}
    </p>
  );
}

export function ReactionRow({ p }: { p: Payment }) {
  const { react, reactions, me } = useStore();
  const [picking, setPicking] = useState(false);
  const entries = Object.entries(reactions[p.hash] ?? {}).filter(([, who]) => who.length > 0);
  return (
    <>
      {entries.map(([emoji, who]) => {
        const mine = me && who.includes(me.handle);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => react(p.hash, emoji)}
            className={`pop inline-flex h-9 items-center gap-1 rounded-full px-3 text-[14px] font-semibold ${mine ? "bg-brand-soft text-brand ring-1 ring-brand/40" : "bg-chip text-ink"}`}
          >
            <span>{emoji}</span>
            {who.length}
          </button>
        );
      })}
      <button type="button" aria-label="Add a reaction" onClick={() => setPicking((v) => !v)} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-chip">
        <SmilePlus size={18} />
      </button>
      {picking && (
        <div className="slide-up flex w-full gap-2 pt-1">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                react(p.hash, emoji);
                setPicking(false);
              }}
              className="flex h-10 flex-1 items-center justify-center rounded-2xl bg-chip text-xl"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function FeedCard({ p }: { p: Payment }) {
  const { me, react, reactions, prices } = useStore();
  const router = useRouter();
  const now = useNow();
  const sent = p.from === me?.handle;
  const received = p.to === me?.handle;
  const other = sent ? p.to : p.from;
  const value = p.units * (prices[p.symbol]?.price ?? 0);
  const [burst, setBurst] = useState(0);
  const timer = useRef<number | null>(null);
  // One tap opens the payment; a quick second tap likes it instead, like a photo app.
  const onTap = (e: React.MouseEvent) => {
    e.preventDefault();
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
      if (me && !reactions[p.hash]?.["❤️"]?.includes(me.handle)) react(p.hash, "❤️");
      setBurst((n) => n + 1);
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      router.push(`/p/${p.hash}`);
    }, 240);
  };
  return (
    <Card className="relative !p-4">
      {burst > 0 && (
        <span key={burst} aria-hidden className="heart-burst pointer-events-none absolute left-1/2 top-1/2 z-10 text-[72px] drop-shadow-lg">
          ❤️
        </span>
      )}
      <Link href={`/p/${p.hash}`} onClick={onTap} className="no-press block">
        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted">
          <span>{now ? ago(p.time, now) : ""}</span>
          <span>·</span>
          <span>Monad block {p.block.toString()}</span>
          {p.isPrivate && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Lock size={13} /> Private
              </span>
            </>
          )}
        </div>
        <Sentence p={p} />
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <AssetChip symbol={p.symbol} />
        {sent && (
          <Link href={`/pay?to=${other}&amount=${Math.max(0.01, Math.round(value * 100) / 100)}&note=${encodeURIComponent(p.note)}`} className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[14px] font-semibold text-white">
            Pay again
          </Link>
        )}
        {received && (
          <button
            type="button"
            onClick={() => {
              if (me && !reactions[p.hash]?.["🙏"]?.includes(me.handle)) react(p.hash, "🙏");
            }}
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[14px] font-semibold text-white"
          >
            Say thanks
          </button>
        )}
        <ReactionRow p={p} />
      </div>
    </Card>
  );
}

export function ActivityRow({ p }: { p: Payment }) {
  const { me, prices } = useStore();
  const now = useNow();
  const sent = p.from === me?.handle;
  const other = sent ? p.to : p.from;
  return (
    <Link href={`/p/${p.hash}`} className="flex items-center gap-3 py-3">
      <Avatar handle={other} size={44} />
      <div className="min-w-0 flex-1">
        <Sentence p={p} size="sm" />
        <div className="mt-0.5 text-[13px] text-muted">
          {now ? ago(p.time, now) : ""} · {p.symbol}
        </div>
      </div>
      <span className={`font-mono text-[15px] font-semibold ${sent ? "text-ink" : "text-money"}`}>
        {sent ? "−" : "+"} {usd(p.units * (prices[p.symbol]?.price ?? 0))}
      </span>
    </Link>
  );
}
