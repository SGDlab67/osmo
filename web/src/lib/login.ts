// Username + number login. Server side only (node:crypto).
//
// The number is 1 to 9999, so there are only 10,000 of them. Anything an attacker can test offline falls in
// milliseconds, so the number is only ever checked by this server, which counts guesses in a shared store:
//   - the wallet key is sealed with AES-256-GCM under a key made from (server secret, username, number) by scrypt;
//     a wrong number fails the GCM check, so there is no separate "pin hash" to attack;
//   - the sealed blob alone is useless without the server secret;
//   - every login attempt first takes a ticket (an atomic counter), and only the first MAX_TRIES per window
//     are even checked, so parallel guesses cannot get past the limit.
// This is a convenience lock for a testnet demo, not account security: an attacker who knows a username can
// lock that user out for a window, and anyone holding both the server secret and the stored blob can try all
// 10,000 numbers. The server secret comes from RELAYER_KEY, so rotating that key invalidates every saved number.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt } from "node:crypto";

export const HANDLE = /^[a-z0-9_]{3,20}$/;
const KEY = /^0x[0-9a-fA-F]{64}$/;
export const MAX_TRIES = 5;
export const WINDOW_SEC = 900;
export const IP_MAX = 40;

/** What the login code needs from a store with atomic counters. Redis in production, a Map in tests. */
export interface Kv {
  /** Add one to a counter that expires `windowSec` after its first hit. Returns [count, secondsLeft]. */
  hit(key: string, windowSec: number): Promise<[number, number]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

/** An integer 1 to 9999, from a number or a string of 1 to 4 digits. Anything else is null. */
export function parsePin(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 9999 ? n : null;
}

/** The server secret, derived so no second secret has to be stored. */
export const masterOf = (relayerKey: string) => createHmac("sha256", relayerKey).update("osmo/pin-wrap/v1").digest();

interface Sealed {
  address: string;
  salt: string;
  iv: string;
  tag: string;
  ct: string;
}

const kek = (master: Buffer, handle: string, pin: number, salt: Buffer) =>
  new Promise<Buffer>((res, rej) =>
    scrypt(Buffer.concat([master, Buffer.from(`${handle}:${pin}`)]), salt, 32, { N: 2 ** 14, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))),
  );

export async function seal(master: Buffer, handle: string, pin: number, key: string, address: string): Promise<Sealed> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", await kek(master, handle, pin, salt), iv);
  c.setAAD(Buffer.from(handle));
  const ct = Buffer.concat([c.update(key, "utf8"), c.final()]);
  return { address, salt: salt.toString("hex"), iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), ct: ct.toString("hex") };
}

/** The wallet key, or null when the number is wrong. */
export async function open(master: Buffer, handle: string, pin: number, s: Sealed): Promise<string | null> {
  try {
    const d = createDecipheriv("aes-256-gcm", await kek(master, handle, pin, Buffer.from(s.salt, "hex")), Buffer.from(s.iv, "hex"));
    d.setAAD(Buffer.from(handle));
    d.setAuthTag(Buffer.from(s.tag, "hex"));
    return Buffer.concat([d.update(Buffer.from(s.ct, "hex")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export type Out<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; retryAfter?: number };
const fail = (status: number, error: string, retryAfter?: number): { ok: false; status: number; error: string; retryAfter?: number } => ({ ok: false, status, error, retryAfter });
const mins = (s: number) => Math.max(1, Math.ceil(s / 60));

/** Save (or change) the number for a username. Proof of ownership is holding the wallet that owns the name. */
export async function savePin(a: {
  kv: Kv;
  master: Buffer;
  handle: unknown;
  key: unknown;
  pin: unknown;
  /** The address that owns this username on chain, and the address a key belongs to. */
  ownerOf: (handle: string) => Promise<string>;
  addressOf: (key: string) => string;
}): Promise<Out<object>> {
  const handle = typeof a.handle === "string" ? a.handle.toLowerCase() : "";
  const pin = parsePin(a.pin);
  if (!HANDLE.test(handle)) return fail(400, "Pick a username of 3 to 20 letters, numbers or underscores.");
  if (pin === null) return fail(400, "The number must be between 1 and 9999.");
  if (typeof a.key !== "string" || !KEY.test(a.key)) return fail(400, "No wallet to protect on this phone.");
  const address = a.addressOf(a.key);
  if ((await a.ownerOf(handle)).toLowerCase() !== address.toLowerCase()) return fail(403, `This wallet does not own @${handle}.`);
  await a.kv.set(`acct:${handle}`, JSON.stringify(await seal(a.master, handle, pin, a.key, address)));
  return { ok: true };
}

/** Check a username and number. Every attempt counts before it is checked. */
export async function attemptLogin(a: { kv: Kv; master: Buffer; handle: unknown; pin: unknown; ip: string }): Promise<Out<{ key: string; address: string; handle: string }>> {
  const handle = typeof a.handle === "string" ? a.handle.toLowerCase() : "";
  const pin = parsePin(a.pin);
  if (!HANDLE.test(handle) || pin === null) return fail(400, "Enter your username and a number from 1 to 9999.");

  const [fromIp, ipLeft] = await a.kv.hit(`ip:${a.ip}`, WINDOW_SEC);
  if (fromIp > IP_MAX) return fail(429, `Too many tries from this network. Try again in ${mins(ipLeft)} min.`, ipLeft);
  const [tries, left] = await a.kv.hit(`tries:${handle}`, WINDOW_SEC);
  if (tries > MAX_TRIES) return fail(429, `Too many tries for @${handle}. Try again in ${mins(left)} min.`, left);

  const raw = await a.kv.get(`acct:${handle}`);
  const key = raw ? await open(a.master, handle, pin, JSON.parse(raw) as Sealed) : null;
  if (!key) return fail(401, `Wrong username or number. ${MAX_TRIES - tries} ${MAX_TRIES - tries === 1 ? "try" : "tries"} left.`);

  await a.kv.del(`tries:${handle}`);
  return { ok: true, key, address: (JSON.parse(raw!) as Sealed).address, handle };
}
