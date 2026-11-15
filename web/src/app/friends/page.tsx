"use client";

import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useRequireAccount } from "@/lib/hooks";
import { EVENT_TAG, type Person } from "@/lib/people";
import { useStore } from "@/lib/store";
import { Screen } from "@/components/shell";
import { Avatar, Card, DemoNote, EmptyState, Flag, SectionTitle } from "@/components/ui";

function PersonRow({ p, right }: { p: Person; right: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Link href={`/u/${p.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar handle={p.handle} size={48} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[17px] font-semibold">
            <span className="truncate">{p.name}</span>
            <Flag code={p.country} className="text-[15px]" />
          </span>
          <span className="block text-[14px] text-muted">{p.joined ? `@${p.handle}` : "Not on Osmo yet"}</span>
        </span>
      </Link>
      {right}
    </div>
  );
}

export default function FriendsPage() {
  const ok = useRequireAccount();
  const { me, people, friends, addFriend, personOf } = useStore();
  const [query, setQuery] = useState("");
  if (!ok || !me) return null;
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const others = people.filter((p) => p.handle !== me.handle);
  const event = others.filter((p) => p.tag === EVENT_TAG).sort((a, b) => a.name.localeCompare(b.name));
  const suggested = others.filter((p) => p.joined && !p.tag && !friends.includes(p.handle));
  const results = q ? others.filter((p) => p.handle.includes(q) || p.name.toLowerCase().includes(q)) : [];
  const add = (h: string) =>
    friends.includes(h) ? (
      <span className="text-[14px] font-semibold text-muted">Friends</span>
    ) : (
      <button type="button" onClick={() => addFriend(h)} className="rounded-full bg-brand px-5 py-2 text-[15px] font-semibold text-white">
        Add
      </button>
    );

  return (
    <Screen>
      <div className="px-4 pt-6">
        <h1 className="px-1 text-[30px] font-semibold tracking-tight">Friends</h1>
        <label className="mt-4 flex h-14 items-center gap-3 rounded-full bg-white px-5 shadow-sm">
          <Search size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find people" autoCapitalize="none" className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted" />
        </label>
        {q ? (
          <>
            <SectionTitle>People</SectionTitle>
            <Card className="divide-y divide-line py-1">
              {results.map((p) => (
                <PersonRow key={p.handle} p={p} right={add(p.handle)} />
              ))}
              {results.length === 0 && <p className="py-4 text-muted">Nobody by that name yet.</p>}
            </Card>
          </>
        ) : (
          <>
            {suggested.length > 0 && (
              <>
                <SectionTitle>Suggested</SectionTitle>
                <Card className="divide-y divide-line py-1">
                  {suggested.map((p) => (
                    <PersonRow key={p.handle} p={p} right={add(p.handle)} />
                  ))}
                </Card>
              </>
            )}
            <SectionTitle right={<span className="text-[13px] font-semibold text-muted">{friends.length}</span>}>Your friends</SectionTitle>
            <Card className="divide-y divide-line py-1">
              {friends
                .map((h) => personOf(h))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <PersonRow
                    key={p.handle}
                    p={p}
                    right={
                      p.joined ? (
                        <Link href={`/pay?to=${p.handle}`} className="rounded-full bg-chip px-4 py-2 text-[15px] font-semibold">
                          Pay
                        </Link>
                      ) : (
                        <span className="text-[13px] font-semibold text-muted">Not here yet</span>
                      )
                    }
                  />
                ))}
              {friends.length === 0 && <EmptyState icon={UserPlus} title="No friends yet" text="Add people from the list below, or search by name." />}
            </Card>
            <div id="event" className="scroll-mt-4" />
            <SectionTitle right={<span className="text-[13px] font-semibold text-muted">{event.length}</span>}>{EVENT_TAG}</SectionTitle>
            <Card className="divide-y divide-line py-1">
              {event.map((p) => (
                <PersonRow key={p.handle} p={p} right={add(p.handle)} />
              ))}
            </Card>
          </>
        )}
      </div>
      <DemoNote />
    </Screen>
  );
}
