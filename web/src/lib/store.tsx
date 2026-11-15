"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { registryAbi, osmoAbi, welcomeAbi } from "./abi";
import { META, MON_GAS_RESERVE, balancesOf, loadTokens, toRaw, unitsFor, type Token } from "./assets";
import { createWallet, forgetWallet, loadWallet, saveName } from "./burner";
import { publicClient, sendAndConfirm, type Sent } from "./chain";
import { config } from "./config";
import { PRIVATE_MARK, readFeed, sentBlockCount, type Payment } from "./feed";
import { DEMO_PEOPLE, EVENT_PEOPLE, EVENT_TAG, defaultPicture, encodeProfile, loadMembers, type Person } from "./people";

export interface Quote {
  price: number;
  change: number;
  spark?: number[];
}

export interface MoneyRequest {
  id: number;
  from: string;
  payer: string;
  usd: number;
  note: string;
  status: "open" | "paid" | "declined" | "cancelled";
}

const STATUS = ["open", "paid", "declined", "cancelled"] as const;
const ZERO = "0x0000000000000000000000000000000000000000";

export interface JoinInput {
  handle: string;
  name: string;
  picture: string;
  country: string;
}

export interface PayInput {
  to: string;
  usd: number;
  symbol: string;
  note: string;
  isPrivate: boolean;
  requestId?: number;
}

interface Store {
  ready: boolean;
  account: PrivateKeyAccount | null;
  me: Person | null;
  tokens: Token[];
  balances: Record<string, number>;
  prices: Record<string, Quote>;
  /** Everyone who joined, plus the event's builders who haven't yet. */
  people: Person[];
  feed: Payment[];
  requests: MoneyRequest[];
  block: bigint | null;
  totalUsd: number;
  cashUsd: number;
  personOf: (handle: string) => Person;
  canSee: (p: Payment) => boolean;
  spendable: (symbol: string) => number;
  join: (input: JoinInput, onStep: (step: number, ms: number, hash?: string) => void) => Promise<void>;
  pay: (input: PayInput) => Promise<Sent & { units: number }>;
  request: (from: string[], usdEach: number, note: string) => Promise<void>;
  closeRequest: (id: number, status: "paid" | "declined" | "cancelled") => Promise<void>;
  buy: (symbol: string, usd: number) => Promise<{ units: number; hash: string; ms: number }>;
  saveProfile: (name: string, picture: string, country: string) => Promise<void>;
  signOut: () => void;
  balancesFor: (address: `0x${string}`) => Promise<Record<string, number>>;
  /** Friends, reactions and "hide amounts" are kept on this phone; payments, profiles and requests are on Monad. */
  friends: string[];
  addFriend: (handle: string) => void;
  removeFriend: (handle: string) => void;
  reactions: Record<string, Record<string, string[]>>;
  react: (hash: string, emoji: string) => void;
  hideBalances: boolean;
  toggleHideBalances: () => void;
  /** Payments to me that landed while the app was open, newest last, for the notification banner. */
  arrivals: Payment[];
  dismissArrival: (id: string) => void;
}

const LOCAL = "osmo.monad.local";
interface Local {
  friends: Record<string, string[]>;
  reactions: Record<string, Record<string, string[]>>;
  hide: boolean;
}
function readLocal(): Local {
  try {
    return { friends: {}, reactions: {}, hide: false, ...JSON.parse(localStorage.getItem(LOCAL) ?? "{}") };
  } catch {
    return { friends: {}, reactions: {}, hide: false };
  }
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null);
  const [handle, setHandle] = useState("");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, Quote>>({});
  const [members, setMembers] = useState<Person[]>([]);
  const [feed, setFeed] = useState<Payment[]>([]);
  const [requests, setRequests] = useState<MoneyRequest[]>([]);
  const [block, setBlock] = useState<bigint | null>(null);
  const seen = useRef({ sends: -1, members: -1, requests: -1 });
  const [arrivals, setArrivals] = useState<Payment[]>([]);
  // Payment ids already on screen when this account's feed first loaded, so only new ones notify.
  const known = useRef<{ who: string; ids: Set<string> } | null>(null);
  const [local, setLocal] = useState<Local>({ friends: {}, reactions: {}, hide: false });
  const saveLocal = useCallback((f: (l: Local) => Local) => {
    setLocal((l) => {
      const next = f(l);
      localStorage.setItem(LOCAL, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      setLocal(readLocal());
      const w = loadWallet();
      if (w && w.name) {
        setAccount(w.account);
        setHandle(w.name);
      }
      setReady(true);
    });
    loadTokens().then(setTokens).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/prices")
        .then((r) => r.json())
        .then((p) => alive && setPrices(p))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const loadRequests = useCallback(async (count: number) => {
    const idx = Array.from({ length: Math.min(count, 60) }, (_, i) => count - 1 - i);
    const rows = await Promise.all(idx.map((i) => publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "requests", args: [BigInt(i)] })));
    const names = await Promise.all(
      rows.flatMap(([from, payer]) => [from, payer]).map((a) => publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [a] })),
    );
    return rows.map(([, , cents, status, note], k) => ({
      id: idx[k],
      from: names[k * 2].toLowerCase(),
      payer: names[k * 2 + 1].toLowerCase(),
      usd: Number(cents) / 100,
      note,
      status: STATUS[Number(status)] ?? "open",
    }));
  }, []);

  // Poll Monad every 1.5 seconds: the block, new payments, new people, new requests, and my balances when anything moved.
  useEffect(() => {
    if (tokens.length === 0) return;
    let alive = true;
    seen.current = { sends: -1, members: -1, requests: -1 };
    const tick = async () => {
      try {
        const [b, sends, memberCount, requestCount] = await Promise.all([
          publicClient.getBlockNumber(),
          sentBlockCount(),
          publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "memberCount" }).then(Number),
          publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "requestCount" }).then(Number),
        ]);
        if (!alive) return;
        setBlock(b);
        if (memberCount !== seen.current.members) {
          seen.current.members = memberCount;
          loadMembers().then((p) => alive && setMembers(p)).catch(() => {});
        }
        if (requestCount !== seen.current.requests) {
          seen.current.requests = requestCount;
          loadRequests(requestCount).then((r) => alive && setRequests(r)).catch(() => {});
        }
        if (sends !== seen.current.sends) {
          seen.current.sends = sends;
          const [items, bal] = await Promise.all([readFeed(tokens, sends), account ? balancesOf(account.address, tokens) : Promise.resolve(null)]);
          if (!alive) return;
          setFeed(items);
          if (bal) setBalances(bal);
          if (handle) {
            if (known.current?.who !== handle) known.current = { who: handle, ids: new Set(items.map((p) => p.id)) };
            else {
              const fresh = items.filter((p) => !known.current!.ids.has(p.id));
              fresh.forEach((p) => known.current!.ids.add(p.id));
              const mine = fresh.filter((p) => p.to === handle && p.from !== handle);
              if (mine.length) setArrivals((a) => [...a, ...mine.reverse()].slice(-5));
            }
          }
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tokens, account, handle, loadRequests]);

  const people = useMemo(() => {
    const joined = new Set(members.map((m) => m.handle));
    const eventList: Person[] = EVENT_PEOPLE.filter(([h]) => !joined.has(h)).map(([h, name]) => ({ address: ZERO, handle: h, name, picture: defaultPicture(h), country: "", joined: false, tag: EVENT_TAG }));
    const tagged = members.map((m) => (EVENT_PEOPLE.some(([h]) => h === m.handle) ? { ...m, tag: EVENT_TAG } : m));
    return [...tagged, ...eventList];
  }, [members]);

  const personOf = useCallback(
    (h: string): Person => {
      const found = people.find((p) => p.handle === h);
      if (found) return found;
      const demo = DEMO_PEOPLE.find((d) => d.handle === h);
      return { address: ZERO, handle: h, name: demo?.name ?? h, picture: demo?.picture ?? defaultPicture(h), country: demo?.country ?? "", joined: false };
    },
    [people],
  );

  const me = useMemo(() => (account && handle ? { ...personOf(handle), address: account.address, joined: true } : null), [account, handle, personOf]);
  const canSee = useCallback((p: Payment) => !p.isPrivate || p.from === handle || p.to === handle, [handle]);
  const spendable = useCallback((s: string) => Math.max(0, (balances[s] ?? 0) - (s === "MON" ? MON_GAS_RESERVE : 0)), [balances]);

  const join = useCallback(async (input: JoinInput, onStep: (step: number, ms: number, hash?: string) => void) => {
    let t = performance.now();
    const acct = loadWallet()?.account ?? createWallet();
    onStep(0, Math.max(1, Math.round(performance.now() - t)));
    t = performance.now();
    const res = await fetch("/api/welcome", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: acct.address, profile: encodeProfile(input.name, input.picture, input.country) }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Sign-up failed");
    onStep(1, Math.round(performance.now() - t), body.hash);
    const existing = await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [acct.address] });
    if (!existing) {
      const claim = await sendAndConfirm(acct, { address: config.registry, abi: registryAbi, functionName: "claim", args: [input.handle] });
      onStep(2, claim.ms, claim.hash);
    } else onStep(2, 0);
    saveName(input.handle);
    setAccount(acct);
    setHandle(input.handle);
    seen.current = { sends: -1, members: -1, requests: -1 };
  }, []);

  const closeRequest = useCallback(
    async (id: number, status: "paid" | "declined" | "cancelled") => {
      if (!account) return;
      await sendAndConfirm(account, { address: config.welcome, abi: welcomeAbi, functionName: "closeRequest", args: [BigInt(id), STATUS.indexOf(status)] });
      seen.current.requests = -1;
    },
    [account],
  );

  const pay = useCallback(
    async (input: PayInput) => {
      if (!account) throw new Error("Join first");
      const t = tokens.find((x) => x.symbol === input.symbol);
      if (!t) throw new Error("Unknown asset");
      const price = prices[input.symbol]?.price ?? 0;
      if (!price) throw new Error("No price yet, try again in a second");
      let value = unitsFor(input.usd, price, t.decimals);
      const all = toRaw(spendable(input.symbol), t.decimals);
      if (value > all) value = all;
      const memo = (input.isPrivate ? PRIVATE_MARK : "") + input.note;
      const sent = t.native
        ? await sendAndConfirm(account, { address: config.osmo, abi: osmoAbi, functionName: "sendNative", args: [input.to, memo], value })
        : await sendAndConfirm(account, { address: config.osmo, abi: osmoAbi, functionName: "sendToken", args: [t.address, input.to, value, memo] });
      if (input.requestId !== undefined) await closeRequest(input.requestId, "paid").catch(() => {});
      seen.current.sends = -1;
      return { ...sent, units: input.usd / price };
    },
    [account, tokens, prices, spendable, closeRequest],
  );

  const request = useCallback(
    async (from: string[], usdEach: number, note: string) => {
      if (!account) throw new Error("Join first");
      for (const h of from) {
        const payer = await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "resolve", args: [h] });
        if (payer === ZERO) throw new Error(`@${h} hasn't joined yet`);
        await sendAndConfirm(account, { address: config.welcome, abi: welcomeAbi, functionName: "request", args: [payer, BigInt(Math.round(usdEach * 100)), note] });
      }
      seen.current.requests = -1;
    },
    [account],
  );

  const buy = useCallback(
    async (symbol: string, usdAmount: number) => {
      if (!account) throw new Error("Join first");
      const res = await fetch("/api/buy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account.address, symbol, usd: usdAmount }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Buy failed");
      setBalances(await balancesOf(account.address, tokens));
      return { units: body.units as number, hash: body.hash as string, ms: body.ms as number };
    },
    [account, tokens],
  );

  const saveProfile = useCallback(
    async (name: string, picture: string, country: string) => {
      if (!account) return;
      await sendAndConfirm(account, { address: config.welcome, abi: welcomeAbi, functionName: "setProfile", args: [encodeProfile(name, picture, country)] });
      setMembers(await loadMembers());
    },
    [account],
  );

  const signOut = useCallback(() => {
    forgetWallet();
    setAccount(null);
    setHandle("");
    setBalances({});
  }, []);

  const friends = useMemo(() => {
    if (!handle) return [];
    // Anyone you've paid or been paid by counts as a friend, plus the people you added.
    const set = new Set(local.friends[handle] ?? []);
    for (const p of feed) {
      if (p.from === handle) set.add(p.to);
      if (p.to === handle) set.add(p.from);
    }
    set.delete(handle);
    return [...set];
  }, [local, handle, feed]);
  const addFriend = useCallback((h: string) => saveLocal((l) => ({ ...l, friends: { ...l.friends, [handle]: [...new Set([...(l.friends[handle] ?? []), h])] } })), [handle, saveLocal]);
  const removeFriend = useCallback((h: string) => saveLocal((l) => ({ ...l, friends: { ...l.friends, [handle]: (l.friends[handle] ?? []).filter((x) => x !== h) } })), [handle, saveLocal]);
  const react = useCallback(
    (hash: string, emoji: string) =>
      saveLocal((l) => {
        const cur = l.reactions[hash]?.[emoji] ?? [];
        const who = cur.includes(handle) ? cur.filter((x) => x !== handle) : [...cur, handle];
        return { ...l, reactions: { ...l.reactions, [hash]: { ...l.reactions[hash], [emoji]: who } } };
      }),
    [handle, saveLocal],
  );
  const dismissArrival = useCallback((id: string) => setArrivals((a) => a.filter((p) => p.id !== id)), []);
  const toggleHideBalances = useCallback(() => saveLocal((l) => ({ ...l, hide: !l.hide })), [saveLocal]);

  const balancesFor = useCallback((address: `0x${string}`) => balancesOf(address, tokens), [tokens]);

  const { totalUsd, cashUsd } = useMemo(() => {
    let total = 0;
    let cash = 0;
    for (const [s, n] of Object.entries(balances)) {
      const v = n * (prices[s]?.price ?? 0);
      total += v;
      if (META[s]?.market === "cash") cash += v;
    }
    return { totalUsd: total, cashUsd: cash };
  }, [balances, prices]);

  const value: Store = {
    ready, account, me, tokens, balances, prices, people, feed, requests, block, totalUsd, cashUsd,
    personOf, canSee, spendable, join, pay, request, closeRequest, buy, saveProfile, signOut, balancesFor,
    friends, addFriend, removeFriend, reactions: local.reactions, react, hideBalances: local.hide, toggleHideBalances, arrivals, dismissArrival,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
