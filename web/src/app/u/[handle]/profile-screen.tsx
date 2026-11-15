"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Check, Lock, UserPlus } from "lucide-react";
import { countryName } from "@/lib/countries";
import { addressUrl } from "@/lib/chain";
import { useStore } from "@/lib/store";
import { ActivityRow, FeedCard } from "@/components/feed-card";
import { PublicPortfolio } from "@/components/public-portfolio";
import { BackHeader, Screen } from "@/components/shell";
import { Avatar, Card, Flag, GhostButton, PrimaryButton, SectionTitle, Sheet } from "@/components/ui";

export function ProfileScreen({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { personOf, me, feed, canSee, balancesFor, tokens, friends, addFriend, removeFriend, hideBalances } = useStore();
  const person = personOf(handle);
  const [bal, setBal] = useState<Record<string, number> | null>(null);
  const [removing, setRemoving] = useState(false);
  const isMe = me?.handle === handle;
  const known = person.address !== "0x0000000000000000000000000000000000000000";
  const first = person.name.split(" ")[0];
  // A private portfolio is never fetched or shown to anyone else; its owner still sees it, marked as hidden.
  const hidden = Boolean(person.privatePortfolio) && !isMe;

  useEffect(() => {
    if (!known || tokens.length === 0 || hidden) return;
    balancesFor(person.address).then(setBal).catch(() => {});
  }, [known, person.address, tokens, balancesFor, feed.length, hidden]);

  const between = feed.filter((p) => me && ((p.from === me.handle && p.to === handle) || (p.from === handle && p.to === me.handle)));
  const theirs = feed.filter((p) => canSee(p) && (p.from === handle || p.to === handle) && !between.includes(p)).slice(0, 5);
  const isFriend = friends.includes(handle);

  return (
    <Screen tabs={false}>
      <BackHeader />
      <div className="flex flex-col items-center px-6 pt-1 text-center">
        <Avatar handle={handle} size={104} />
        <h1 className="mt-4 flex items-center gap-2 text-[26px] font-semibold tracking-tight">
          {person.name} <Flag code={person.country} className="text-[22px]" />
        </h1>
        <p className="text-[16px] text-muted">
          {person.joined || known ? `@${handle}` : "Not on Osmo yet"}
          {person.country && <span> · {countryName(person.country)}</span>}
        </p>
        {person.tag && <span className="mt-2 rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand">{person.tag}</span>}
      </div>

      <div className="px-4 pt-5">
        {isMe ? (
          <PrimaryButton href="/me">Go to your profile</PrimaryButton>
        ) : (
          <div className="flex gap-3">
            {known ? (
              <PrimaryButton href={`/pay?to=${handle}`} className="flex-1">
                Pay or request
              </PrimaryButton>
            ) : (
              <PrimaryButton disabled className="flex-1">
                Not here yet
              </PrimaryButton>
            )}
            {isFriend ? (
              <GhostButton onClick={() => setRemoving(true)} className="h-14 gap-2 bg-white px-5">
                <Check size={18} /> Friends
              </GhostButton>
            ) : (
              <GhostButton onClick={() => addFriend(handle)} className="h-14 gap-2 bg-white px-5">
                <UserPlus size={18} /> Add
              </GhostButton>
            )}
          </div>
        )}

        {known && hidden && (
          <>
            <SectionTitle>{`${first}'s portfolio`}</SectionTitle>
            <Card className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip">
                <Lock size={18} />
              </span>
              <p className="text-[15px] text-muted">{first} keeps their portfolio private.</p>
            </Card>
          </>
        )}
        {known && !hidden && (
          <>
            <SectionTitle
              right={
                isMe ? (
                  <Link href="/me/settings" className="hit text-[13px] font-semibold text-brand">
                    {person.privatePortfolio ? "Hidden from others" : "Visible to everyone"}
                  </Link>
                ) : undefined
              }
            >
              {isMe ? (person.privatePortfolio ? "Your portfolio (only you see this)" : "Your portfolio, as others see it") : `${first}'s portfolio`}
            </SectionTitle>
            {isMe && hideBalances ? (
              <Card className="text-[15px] text-muted">Amounts are hidden on this phone.</Card>
            ) : bal ? (
              <PublicPortfolio balances={bal} self={isMe} />
            ) : (
              <Card className="h-[150px] animate-pulse">{null}</Card>
            )}
          </>
        )}

        {!isMe && between.length > 0 && (
          <>
            <SectionTitle>Between you</SectionTitle>
            <Card className="divide-y divide-line py-1">
              {between.map((p) => (
                <ActivityRow key={p.id} p={p} />
              ))}
            </Card>
          </>
        )}

        <SectionTitle>{isMe ? "Your payments" : `${first}'s payments`}</SectionTitle>
        {theirs.length === 0 ? (
          <p className="px-2 py-6 text-center text-muted">Nothing to show yet.</p>
        ) : (
          <div className="space-y-3">
            {theirs.map((p) => (
              <FeedCard key={p.id} p={p} />
            ))}
          </div>
        )}
        {known && (
          <a href={addressUrl(person.address)} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center text-[13px] text-muted">
            Wallet on the Monad explorer
          </a>
        )}
      </div>

      <Sheet open={removing} onClose={() => setRemoving(false)} title={`You and ${first} are friends`}>
        <button
          type="button"
          onClick={() => {
            removeFriend(handle);
            setRemoving(false);
          }}
          className="flex h-14 w-full items-center justify-center rounded-full bg-chip text-[17px] font-semibold text-down"
        >
          Remove friend
        </button>
        <Link href={`/pay?to=${handle}`} className="mt-2 flex h-14 w-full items-center justify-center rounded-full bg-chip text-[17px] font-semibold">
          Pay or request
        </Link>
      </Sheet>
    </Screen>
  );
}
