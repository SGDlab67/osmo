import type { Kv } from "./login";

/**
 * The store behind username + number login. Production needs Upstash Redis (Vercel Storage, Marketplace), which
 * sets KV_REST_API_URL and KV_REST_API_TOKEN. Plain fetch against its REST API: no client library to audit.
 * Without them, login is off in production; in development a per-process Map stands in so the flow can be tried.
 */
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(...args: (string | number)[]): Promise<unknown> {
  const r = await fetch(url!, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  const j = (await r.json()) as { result?: unknown; error?: string };
  if (!r.ok || j.error) throw new Error("store unavailable");
  return j.result;
}

// One round trip, atomic: count the hit, and start the expiry clock on the first one. A key can never be left
// without an expiry (which would lock a username for good), because both steps run inside one script.
const HIT = "local n=redis.call('INCR',KEYS[1]) if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return {n,redis.call('TTL',KEYS[1])}";

const redis: Kv = {
  hit: async (key, windowSec) => {
    const [n, ttl] = (await cmd("EVAL", HIT, 1, key, windowSec)) as [number, number];
    return [n, ttl > 0 ? ttl : windowSec];
  },
  get: async (key) => ((await cmd("GET", key)) as string | null) ?? null,
  set: async (key, value) => void (await cmd("SET", key, value)),
  del: async (key) => void (await cmd("DEL", key)),
};

const mem = () => {
  const data = new Map<string, string>();
  const counts = new Map<string, { n: number; until: number }>();
  const kv: Kv = {
    hit: async (key, windowSec) => {
      const now = Date.now();
      const c = counts.get(key);
      const cur = c && c.until > now ? c : { n: 0, until: now + windowSec * 1000 };
      cur.n++;
      counts.set(key, cur);
      return [cur.n, Math.ceil((cur.until - now) / 1000)];
    },
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    del: async (key) => void (data.delete(key), counts.delete(key)),
  };
  return kv;
};

/** The store, or null when login is not set up here. */
export const kv: Kv | null = url && token ? redis : process.env.NODE_ENV !== "production" ? mem() : null;
