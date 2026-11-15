import { charitiesAbi, osmoAbi, registryAbi, welcomeAbi } from "./abi";
import { CHARITY_RECORDS, recordHash, type Charity } from "./charities";
import { loadTokens, type Token } from "./assets";
import { publicClient } from "./chain";
import { config } from "./config";
import { readFeed } from "./feed";
import { loadMembers, type Person } from "./people";
import type { MoneyRequest, WireState } from "./state";

const STATUS = ["open", "paid", "declined", "cancelled"] as const;

let tokens: Token[] | null = null;
let members: Person[] = [];
let memberCount = -1;
let membersAt = 0;
let charities: Charity[] = [];
let charityCount = -1;
let charitiesAt = 0;
let state: WireState | null = null;
let builtAt = 0;
let inflight: Promise<WireState> | null = null;

async function loadRequests(count: number): Promise<MoneyRequest[]> {
  const idx = Array.from({ length: Math.min(count, 60) }, (_, i) => count - 1 - i);
  const rows = await Promise.all(idx.map((i) => publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "requests", args: [BigInt(i)] })));
  const addrs = [...new Set(rows.flatMap(([from, payer]) => [from.toLowerCase(), payer.toLowerCase()]))] as `0x${string}`[];
  const names = await Promise.all(addrs.map((a) => publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [a] })));
  const nameOf = new Map<string, string>(addrs.map((a, i) => [a, names[i].toLowerCase()]));
  return rows.map(([from, payer, cents, status, note], k) => ({
    id: idx[k],
    from: nameOf.get(from.toLowerCase()) ?? "",
    payer: nameOf.get(payer.toLowerCase()) ?? "",
    usd: Number(cents) / 100,
    note,
    status: STATUS[Number(status)] ?? "open",
  }));
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Every listed wallet, its username and on-chain status, matched to the record the app ships. O(n), n a few dozen. */
async function loadCharities(count: number): Promise<Charity[]> {
  const idx = Array.from({ length: count }, (_, i) => BigInt(i));
  const wallets = await Promise.all(idx.map((i) => publicClient.readContract({ address: config.charities, abi: charitiesAbi, functionName: "list", args: [i] })));
  const rows = await Promise.all(
    wallets.map((w) =>
      Promise.all([
        publicClient.readContract({ address: config.charities, abi: charitiesAbi, functionName: "isVerified", args: [w] }),
        publicClient.readContract({ address: config.charities, abi: charitiesAbi, functionName: "metaHashOf", args: [w] }),
        publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [w] }),
      ]),
    ),
  );
  const out: Charity[] = [];
  rows.forEach(([verified, metaHash, name], i) => {
    const rec = CHARITY_RECORDS.find((r) => r.handle === name.toLowerCase());
    if (!rec) return;
    out.push({ ...rec, wallet: wallets[i], verified, detailsOk: recordHash(rec) === metaHash });
  });
  return out;
}

async function build(): Promise<WireState> {
  if (!tokens) tokens = await loadTokens();
  // One Multicall3 round trip for the four numbers that say whether anything changed.
  const [block, sends, mc, rc] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.readContract({ address: config.osmo, abi: osmoAbi, functionName: "sentBlockCount" }).then(Number),
    publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "memberCount" }).then(Number),
    publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "requestCount" }).then(Number),
  ]);
  // Charities change rarely: re-read the list when its length moves, or once a minute for revokes.
  if (config.charities !== ZERO) {
    const cc = Number(await publicClient.readContract({ address: config.charities, abi: charitiesAbi, functionName: "count" }));
    if (cc !== charityCount || Date.now() - charitiesAt > 60_000) {
      charities = await loadCharities(cc);
      charityCount = cc;
      charitiesAt = Date.now();
    }
  }
  // Profiles can change without the member count moving, so refresh them every 15 seconds too.
  const membersJob = mc !== memberCount || Date.now() - membersAt > 15_000 ? loadMembers() : Promise.resolve(members);
  const [feed, mem, requests] = await Promise.all([readFeed(tokens, sends), membersJob, loadRequests(rc)]);
  if (mem !== members) {
    members = mem;
    memberCount = mc;
    membersAt = Date.now();
  }
  return {
    block: block.toString(),
    sends,
    tokens,
    feed: feed.map((p) => ({ ...p, block: p.block.toString() })),
    members,
    requests,
    charities,
    at: Date.now(),
  };
}

/**
 * The room's shared view of Monad, rebuilt at most about once a second however many phones ask.
 * `fresh` (after someone acts) rebuilds sooner. If Monad is briefly unreachable, the last good view is served.
 */
export async function getState(fresh = false): Promise<WireState> {
  const age = Date.now() - builtAt;
  if (state && age < (fresh ? 250 : 900)) return state;
  if (!inflight) {
    inflight = build()
      .then((s) => {
        state = s;
        builtAt = Date.now();
        return s;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch (e) {
    if (state) return state;
    throw e;
  }
}
