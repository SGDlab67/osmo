import assert from "node:assert/strict";
import { test } from "node:test";
import { IP_MAX, MAX_TRIES, attemptLogin, masterOf, open, parsePin, savePin, seal } from "../src/lib/login.ts";

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

const save = (kv, handle = "riley", pin = 4321, owner = ADDR) =>
  savePin({ kv, master, handle, key: KEY, pin, ownerOf: async () => owner, addressOf: () => ADDR });
const login = (kv, pin, handle = "riley", ip = "9.9.9.9") => attemptLogin({ kv, master, handle, pin, ip });

test("the number is an integer from 1 to 9999 and nothing else", () => {
  for (const ok of [1, 9999, "42", " 7 ", "0042", 1234]) assert.ok(parsePin(ok) !== null, String(ok));
  for (const bad of [0, 10000, -5, 1.5, "", "abc", "12345", "1e3", null, undefined, {}, "0"]) assert.equal(parsePin(bad), null, String(bad));
  assert.equal(parsePin("0042"), 42);
});

test("a sealed key opens only with the same number, name and server secret", async () => {
  const s = await seal(master, "riley", 4321, KEY, ADDR);
  assert.equal(await open(master, "riley", 4321, s), KEY);
  assert.equal(await open(master, "riley", 4322, s), null);
  assert.equal(await open(master, "sam", 4321, s), null, "bound to the username");
  assert.equal(await open(masterOf("another-secret"), "riley", 4321, s), null);
  assert.doesNotMatch(JSON.stringify(s), new RegExp(KEY.slice(2, 20)), "the stored blob never holds the key in the clear");
});

test("login works with the right number and wrong ones are refused", async () => {
  const { kv } = memKv();
  assert.deepEqual(await save(kv), { ok: true });
  const ok = await login(kv, "4321");
  assert.ok(ok.ok && ok.key === KEY && ok.address === ADDR && ok.handle === "riley");
  const bad = await login(kv, 1);
  assert.ok(!bad.ok && bad.status === 401);
  assert.ok((await login(kv, "riley-is-cool")).ok === false);
});

test("five wrong tries lock the name, even for the right number", async () => {
  const { kv } = memKv();
  await save(kv);
  for (let i = 0; i < MAX_TRIES; i++) assert.equal((await login(kv, 1000 + i)).status, 401);
  const locked = await login(kv, 4321);
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
  assert.ok((await login(kv, 4321)).ok);
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
  const stranger = await save(kv, "riley", 4321, "0x2222222222222222222222222222222222222222");
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
