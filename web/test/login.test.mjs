import assert from "node:assert/strict";
import { test } from "node:test";
import { IP_MAX, MAX_TRIES, attemptLogin, canonicalSecret, masterOf, open, parsePassword, parsePin, savePassword, savePin, seal } from "../src/lib/login.ts";

const KEY = "0x" + "ab".repeat(32);
const ADDR = "0x1111111111111111111111111111111111111111";
const master = masterOf("test-relayer-key");

const memKv = () => {
  const data = new Map();
  const n = new Map();
  const kv = {
    hit: async (k) => (n.set(k, (n.get(k) ?? 0) + 1), [n.get(k), 900]),
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    del: async (k) => void (data.delete(k), n.delete(k)),
  };
  return { kv, data };
};

const save = (kv, handle = "riley", pin = 5823, owner = ADDR) =>
  savePin({ kv, master, handle, key: KEY, pin, ownerOf: async () => owner, addressOf: () => ADDR });
const login = (kv, pin, handle = "riley", ip = "9.9.9.9") => attemptLogin({ kv, master, handle, pin, ip });

test("the number is an integer from 1 to 9999 and nothing else", () => {
  for (const ok of [1, 9999, "42", " 7 ", "0042", 1234]) assert.ok(parsePin(ok) !== null, String(ok));
  for (const bad of [0, 10000, -5, 1.5, "", "abc", "12345", "1e3", null, undefined, {}, "0"]) assert.equal(parsePin(bad), null, String(bad));
  assert.equal(parsePin("0042"), 42);
});

test("a sealed key opens only with the same number, name and server secret", async () => {
  const s = await seal(master, "riley", 5823, KEY, ADDR);
  assert.equal(await open(master, "riley", 5823, s), KEY);
  assert.equal(await open(master, "riley", 4322, s), null);
  assert.equal(await open(master, "sam", 5823, s), null, "bound to the username");
  assert.equal(await open(masterOf("another-secret"), "riley", 5823, s), null);
  assert.doesNotMatch(JSON.stringify(s), new RegExp(KEY.slice(2, 20)), "the stored blob never holds the key in the clear");
});

test("login works with the right number and wrong ones are refused", async () => {
  const { kv } = memKv();
  assert.deepEqual(await save(kv), { ok: true });
  const ok = await login(kv, "5823");
  assert.ok(ok.ok && ok.key === KEY && ok.address === ADDR && ok.handle === "riley");
  const bad = await login(kv, 1);
  assert.ok(!bad.ok && bad.status === 401);
  assert.ok((await login(kv, "riley-is-cool")).ok === false);
});

test("five wrong tries lock the name, even for the right number", async () => {
  const { kv } = memKv();
  await save(kv);
  for (let i = 0; i < MAX_TRIES; i++) assert.equal((await login(kv, 1000 + i)).status, 401);
  const locked = await login(kv, 5823);
  assert.ok(!locked.ok && locked.status === 429 && (locked.retryAfter ?? 0) > 0, "the correct number is refused while locked");
});

test("parallel guesses cannot get past the limit", async () => {
  const { kv } = memKv();
  await save(kv);
  const all = await Promise.all(Array.from({ length: 200 }, (_, i) => login(kv, i + 1)));
  const checked = all.filter((r) => r.ok || r.status === 401);
  assert.equal(checked.length, MAX_TRIES, "only the first few attempts were even checked");
  assert.ok(all.filter((r) => !r.ok && r.status === 429).length >= 195);
});

test("a good login clears the count", async () => {
  const { kv } = memKv();
  await save(kv);
  for (let i = 0; i < MAX_TRIES - 1; i++) await login(kv, 1000 + i);
  assert.ok((await login(kv, 5823)).ok);
  for (let i = 0; i < MAX_TRIES - 1; i++) assert.equal((await login(kv, 2000 + i)).status, 401);
});

test("one network cannot sweep many usernames", async () => {
  const { kv } = memKv();
  const last = [];
  for (let i = 0; i <= IP_MAX; i++) last.push(await login(kv, 1, `user_${i}`, "1.2.3.4"));
  const end = last.at(-1);
  assert.ok(!end.ok && end.status === 429);
  assert.ok((await login(kv, 1, "user_x", "5.6.7.8")).ok === false, "another network is not blocked by the first");
  assert.equal((await login(kv, 1, "user_x", "5.6.7.8")).status, 401);
});

test("unknown names and wrong numbers look the same", async () => {
  const { kv } = memKv();
  await save(kv);
  const a = await login(kv, 1, "nobody_here");
  const b = await login(kv, 1, "riley");
  assert.ok(!a.ok && !b.ok && a.status === b.status && a.error.split(".")[0] === b.error.split(".")[0]);
});

test("only the wallet that owns the name can set its number", async () => {
  const { kv, data } = memKv();
  const stranger = await save(kv, "riley", 5823, "0x2222222222222222222222222222222222222222");
  assert.ok(!stranger.ok && stranger.status === 403);
  assert.equal(data.size, 0);
  for (const pin of [0, 10000, "x"]) assert.ok(!(await save(kv, "riley", pin)).ok);
  assert.ok(!(await savePin({ kv, master, handle: "riley", key: "nope", pin: 5, ownerOf: async () => ADDR, addressOf: () => ADDR })).ok);
  assert.ok(!(await save(kv, "BAD NAME!")).ok);
});

test("changing the number replaces the old one", async () => {
  const { kv } = memKv();
  await save(kv, "riley", 111);
  await save(kv, "riley", 222);
  assert.ok(!(await login(kv, 111)).ok);
  assert.ok((await login(kv, 222)).ok);
});

test("a password is 4 to 64 characters after NFKC, with no control characters", () => {
  for (const ok of ["abcd", "purple horse battery", "pässwörd", "🐎🐎🐎🐎", "x".repeat(64), "p@ss w0rd!"]) assert.ok(parsePassword(ok) !== null, ok);
  for (const bad of ["abc", "x".repeat(65), "tab\there", "new\nline", 1234, null, undefined, {}]) assert.equal(parsePassword(bad), null, String(bad));
  assert.equal(parsePassword("ｆｕｌｌｗｉｄｔｈ"), "fullwidth");
});

test("old numbers stay numbers; everything else is a password", () => {
  assert.equal(canonicalSecret("0042"), "42");
  assert.equal(canonicalSecret(42), "42");
  assert.equal(canonicalSecret("purple horse"), "purple horse");
  assert.equal(canonicalSecret("12345"), "12345");
  assert.equal(canonicalSecret("ab"), null);
});

test("an account saved with an old number still logs in with it", async () => {
  const { kv } = memKv();
  assert.ok((await save(kv, "riley", 5823)).ok);
  const r = await attemptLogin({ kv, master, handle: "riley", password: "5823", ip: "1.1.1.1" });
  assert.ok(r.ok && r.key === KEY);
});

test("a password seals, opens, and wrong ones count toward the lock", async () => {
  const { kv } = memKv();
  const saved = await savePassword({ kv, master, handle: "riley", key: KEY, password: "purple horse battery", ownerOf: async () => ADDR, addressOf: () => ADDR });
  assert.ok(saved.ok);
  assert.equal((await attemptLogin({ kv, master, handle: "riley", password: "purple horse", ip: "2.2.2.2" })).ok, false);
  const ok = await attemptLogin({ kv, master, handle: "Riley", password: "purple horse battery", ip: "2.2.2.2" });
  assert.ok(ok.ok && ok.key === KEY);
  // Old clients send the password as `pin`.
  assert.ok((await attemptLogin({ kv, master, handle: "riley", pin: "purple horse battery", ip: "2.2.2.2" })).ok);
});

test("easy passwords are refused", async () => {
  const { kv } = memKv();
  for (const bad of ["password", "1234", "riley", "yelir", "QWERTY"]) {
    const r = await savePassword({ kv, master, handle: "riley", key: KEY, password: bad, ownerOf: async () => ADDR, addressOf: () => ADDR });
    assert.equal(r.ok, false, bad);
  }
});
