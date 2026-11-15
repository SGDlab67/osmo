"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { registryAbi, osmoAbi, welcomeAbi } from "./abi";
import { META, MON_GAS_RESERVE, balancesOf, toRaw, unitsFor, type Token } from "./assets";
import { createWallet, forgetWallet, loadWallet, restoreWallet, saveName, savedKey, takeImportFromUrl } from "./burner";
import { publicClient, sendAndConfirm, type Sent } from "./chain";
import { config } from "./config";
import { PRIVATE_MARK, type Payment } from "./feed";
import { DEMO_PEOPLE, EVENT_PEOPLE, EVENT_TAG, defaultPicture, encodeProfile, type Person } from "./people";
import { fromWire, type MoneyRequest, type WireState } from "./state";
import type { Charity } from "./charities";

export interface Quote {
  price: number;
  change: number;
  spark?: number[];
}

export type { MoneyRequest } from "./state";

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

/** live: talking to Monad. offline: the last few checks failed. missing: no Welcome contract on this network yet. */
export type ChainStatus = "loading" | "live" | "offline" | "missing";

interface Store {
  ready: boolean;
  status: ChainStatus;
  account: PrivateKeyAccount | null;
  me: Person | null;
  tokens: Token[];
  balances: Record<string, number>;
  prices: Record<string, Quote>;
  /** Everyone who joined, plus the event's builders who haven't yet. */
  people: Person[];
  feed: Payment[];
  requests: MoneyRequest[];
  /** Verified nonprofits from Charities (empty when it isn't deployed). */
  charities: Charity[];
  charityOf: (handle: string) => Charity | undefined;
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
  /** Log in on this phone with a username and a number from 1 to 9999. Throws a readable message on failure. */
  signIn: (handle: string, password: string) => Promise<void>;
  /** Lock this phone's wallet behind a number, so the username and number work on any phone. */
  setPassword: (handle: string, password: string) => Promise<void>;
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
  const [charities, setCharities] = useState<Charity[]>([]);
  const [block, setBlock] = useState<bigint | null>(null);
  const [status, setStatus] = useState<ChainStatus>(config.welcome === ZERO ? "missing" : "loading");
  const fails = useRef(0);
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
    requestAnimationFrame(async () => {
      setLocal(readLocal());
      // An account moved here by link: look up its username on chain before showing the app.
      if (takeImportFromUrl()) {
        const acct = loadWallet()?.account;
        const name = acct ? await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [acct.address] }).catch(() => "") : "";
        if (name) saveName(name.toLowerCase());
      }
      const w = loadWallet();
      if (w && w.name) {
        setAccount(w.account);
        setHandle(w.name);
      }
      setReady(true);
    });
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


  // Every phone reads the room's shared state from /api/state (one CDN-cached copy for everyone), not the
  // chain itself. It only touches Monad for its own balances and its own transactions.
  const sync = useRef<(fresh?: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    if (config.welcome === ZERO) return;
    let alive = true;
    let lastSends = -1;
    let tokenList: Token[] = [];
    const tick = async (fresh = false) => {
      try {
        const res = await fetch(fresh ? `/api/state?fresh=${Date.now()}` : "/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const st = (await res.json()) as WireState;
        if (!alive) return;
        fails.current = 0;
        setStatus("live");
        setBlock(BigInt(st.block));
        if (st.tokens.length !== tokenList.length) {
          tokenList = st.tokens;
          setTokens(st.tokens);
        }
        setMembers(st.members);
        setRequests(st.requests);
        if (st.charities) setCharities((c) => (c.length === st.charities.length && c.every((x, i) => x.verified === st.charities[i].verified && x.detailsOk === st.charities[i].detailsOk) ? c : st.charities));
        const items = st.feed.map(fromWire);
        setFeed(items);
        if (st.sends !== lastSends || fresh) {
          lastSends = st.sends;
          if (account) balancesOf(account.address, st.tokens).then((b) => alive && setBalances(b)).catch(() => {});
          if (handle) {
            if (known.current?.who !== handle) known.current = { who: handle, ids: new Set(items.map((p) => p.id)) };
            else {
              const fresh2 = items.filter((p) => !known.current!.ids.has(p.id));
              fresh2.forEach((p) => known.current!.ids.add(p.id));
              const mine = fresh2.filter((p) => p.to === handle && p.from !== handle);
              if (mine.length) setArrivals((a) => [...a, ...mine.reverse()].slice(-5));
            }
          }
        }
      } catch {
        // One slow response is normal; three in a row means we've lost Monad.
        if (alive && ++fails.current >= 3) setStatus("offline");
      }
    };
    sync.current = tick;
    tick();
    // Check every second while the app is on screen; pause in the background and catch up on return.
    const t = setInterval(() => document.visibilityState === "visible" && tick(), 1000);
    const back = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", back);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [account, handle]);

  const people = useMemo(() => {
    const joined = new Set(members.map((m) => m.handle));
    const eventList: Person[] = EVENT_PEOPLE.filter(([h]) => !joined.has(h)).map(([h, name]) => ({ address: ZERO, handle: h, name, picture: defaultPicture(h), country: "", joined: false, tag: EVENT_TAG }));
    const tagged = members.map((m) => (EVENT_PEOPLE.some(([h]) => h === m.handle) ? { ...m, tag: EVENT_TAG } : m));
    return [...tagged, ...eventList];
  }, [members]);

  const charityOf = useCallback((h: string) => charities.find((c) => c.handle === h), [charities]);

  const personOf = useCallback(
    (h: string): Person => {
      const org = charities.find((c) => c.handle === h);
      if (org) return { address: org.wallet, handle: h, name: org.name, picture: `charity:${h}`, country: "US", joined: true };
      const found = people.find((p) => p.handle === h);
      if (found) return found;
      const demo = DEMO_PEOPLE.find((d) => d.handle === h);
      return { address: ZERO, handle: h, name: demo?.name ?? h, picture: demo?.picture ?? defaultPicture(h), country: demo?.country ?? "", joined: false };
    },
    [people, charities],
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
      // Monad can reject a brand-new wallet's first transaction for a moment after it is funded, so retry briefly.
      let claim: Sent | null = null;
      for (let tries = 0; !claim; tries++) {
        try {
          claim = await sendAndConfirm(acct, { address: config.registry, abi: registryAbi, functionName: "claim", args: [input.handle] });
        } catch (e) {
          const m = e instanceof Error ? e.message : "";
          if (/NameTaken|taken/i.test(m)) throw new Error(`@${input.handle} was just taken. Try another username.`);
          if (tries >= 8) throw e;
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      onStep(2, claim.ms, claim.hash);
    } else onStep(2, 0);
    saveName(input.handle);
    setAccount(acct);
    setHandle(input.handle);
  }, []);

  const closeRequest = useCallback(
    async (id: number, status: "paid" | "declined" | "cancelled") => {
      if (!account) return;
      await sendAndConfirm(account, { address: config.welcome, abi: welcomeAbi, functionName: "closeRequest", args: [BigInt(id), STATUS.indexOf(status)] });
      void sync.current(true);
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
      void sync.current(true);
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
      void sync.current(true);
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
      await sync.current(true);
    },
    [account],
  );

  const signIn = useCallback(async (user: string, password: string) => {
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: user.trim().replace(/^@/, ""), password }) });
    const body = (await res.json().catch(() => ({}))) as { key?: `0x${string}`; handle?: string; error?: string };
    if (!res.ok || !body.key || !body.handle) throw new Error(body.error ?? "Couldn't log in. Try again.");
    const acct = restoreWallet(body.key);
    saveName(body.handle);
    setAccount(acct);
    setHandle(body.handle);
  }, []);

  const setPassword = useCallback(async (user: string, password: string) => {
    const key = savedKey();
    if (!key) throw new Error("No wallet on this phone.");
    const res = await fetch("/api/auth/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: user, key, password }) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save the password.");
  }, []);

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
    // Charities you gave to aren't friends.
    for (const c of charities) set.delete(c.handle);
    return [...set];
  }, [local, handle, feed, charities]);
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
    ready, status, account, me, tokens, balances, prices, people, feed, requests, block, totalUsd, cashUsd,
    charities, charityOf, personOf, canSee, spendable, join, pay, request, closeRequest, buy, saveProfile, signOut, signIn, setPassword, balancesFor,
    friends, addFriend, removeFriend, reactions: local.reactions, react, hideBalances: local.hide, toggleHideBalances, arrivals, dismissArrival,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
