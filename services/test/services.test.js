import { ethers } from "ethers";
import assert from "node:assert/strict";
import { test } from "node:test";
import { CFG, limiter } from "../lib.js";
import { tick } from "../keeper.js";
import { makeRelayer, serve } from "../relayer.js";
import { PRIVATE_MARK, makeNotifier, topicFor } from "../notifier.js";
import { WEEK, actor, world } from "./chain.js";

const quiet = () => {};
const eth = ethers.parseEther;

// --- keeper ---

test("keeper pays a due order once per period and never twice, skips what it cannot pay", async t => {
  const w = await world();
  t.after(w.stop);
  const k = await actor(w);
  const memo = { dead: new Set(), seen: new Map() };
  const run = () => tick({ osmo: w.read, provider: w.provider, send: k.send, log: quiet, ...memo });
  await (await w.osmo.connect(w.alice).createOrder(w.share.target, "bobby", eth("1"), 0, WEEK, "rent")).wait();

  assert.equal(await run(), 1, "due at once");
  assert.equal(await run(), 0, "same period: the chain says not due, so no gas is spent");
  await w.travel(3 * WEEK + 10); // three periods nobody ran
  assert.equal(await run(), 1);
  assert.equal(await w.share.balanceOf(w.bob.address), eth("102"), "two payments of 1, not four");

  await (await w.osmo.connect(w.alice).cancelOrder(0)).wait();
  await w.travel(WEEK + 10);
  assert.equal(await run(), 0);
  assert.ok(memo.dead.has(0n), "a cancelled order is remembered as dead");

  // Allowance revoked: the simulation fails, so the keeper pays nothing.
  await (await w.osmo.connect(w.alice).createOrder(w.share.target, "bobby", eth("1"), 0, WEEK, "again")).wait();
  await (await w.share.connect(w.alice).approve(w.osmo.target, 0)).wait();
  const before = await w.provider.getBalance(k.wallet.address);
  assert.equal(await run(), 0);
  assert.equal(await w.provider.getBalance(k.wallet.address), before, "a doomed run costs zero gas");
});

// --- relayer ---

const newLink = async (w, token = w.share.target, value = eth("1")) => {
  const key = ethers.Wallet.createRandom();
  const native = token === ethers.ZeroAddress;
  await (await w.osmo.connect(w.alice).createLink(token, value, key.address, "gift", { value: native ? value : 0 })).wait();
  return { id: String((await w.osmo.linkCount()) - 1n), key };
};
const sign = async (w, key, id, to) => key.signingKey.sign(await w.osmo.claimDigest(id, to)).serialized;
const relayerCfg = w => ({ perIpPerMin: 50, globalPerMin: 50, allowedTokens: [ethers.ZeroAddress, w.share.target], origins: ["http://ok.test"] });

test("relayer sponsors a real claim for a wallet with no gas, once", async t => {
  const w = await world();
  t.after(w.stop);
  const r = await actor(w);
  const claim = makeRelayer({ osmo: w.read, send: r.send, cfg: relayerCfg(w), log: quiet });
  const newcomer = ethers.Wallet.createRandom().address; // empty wallet
  const { id, key } = await newLink(w);

  const out = await claim({ id, to: newcomer, sig: await sign(w, key, id, newcomer), ip: "1.1.1.1" });
  assert.equal(out.code, "ok");
  assert.equal(await w.share.balanceOf(newcomer), eth("1"));
  assert.equal(await w.provider.getBalance(newcomer), 0n, "the newcomer never needed gas");
  assert.equal((await claim({ id, to: newcomer, sig: await sign(w, key, id, newcomer), ip: "1.1.1.1" })).code, "no_such_link");
});

test("relayer refuses forged, redirected and malformed claims without spending gas", async t => {
  const w = await world();
  t.after(w.stop);
  const r = await actor(w);
  const claim = makeRelayer({ osmo: w.read, send: r.send, cfg: relayerCfg(w), log: quiet });
  const { id, key } = await newLink(w);
  const nonce = () => w.provider.getTransactionCount(r.wallet.address);
  const n0 = await nonce();
  const ip = "2.2.2.2";

  const forged = await sign(w, ethers.Wallet.createRandom(), id, w.bob.address);
  assert.equal((await claim({ id, to: w.bob.address, sig: forged, ip })).code, "bad_signature");
  const forBob = await sign(w, key, id, w.bob.address);
  assert.equal((await claim({ id, to: w.mallory.address, sig: forBob, ip })).code, "bad_signature", "a copied claim cannot be redirected");
  assert.equal((await claim({ id: "abc", to: w.bob.address, sig: forBob, ip })).code, "bad_request");
  assert.equal((await claim({ id, to: ethers.ZeroAddress, sig: forBob, ip })).code, "bad_request");
  assert.equal((await claim({ id, to: w.bob.address, sig: "0x1234", ip })).code, "bad_request");
  assert.equal((await claim({ id: "9999", to: w.bob.address, sig: forBob, ip })).code, "no_such_link");
  assert.equal(await nonce(), n0, "nothing reached the chain");
});

test("relayer sponsors only allowed tokens, within rate, price and budget limits", async t => {
  const w = await world();
  t.after(w.stop);
  const hostile = await newLink(w, w.other.target); // a token that is not on the list
  const r = await actor(w);
  const claim = makeRelayer({ osmo: w.read, send: r.send, cfg: relayerCfg(w), log: quiet });
  const sig = await sign(w, hostile.key, hostile.id, w.bob.address);
  assert.equal((await claim({ id: hostile.id, to: w.bob.address, sig, ip: "3.3.3.3" })).code, "not_sponsored");

  const good = await newLink(w);
  const gsig = await sign(w, good.key, good.id, w.bob.address);
  const broke = await actor(w, { capWei: 1n }); // a budget of one wei
  const noBudget = makeRelayer({ osmo: w.read, send: broke.send, cfg: relayerCfg(w), log: quiet });
  assert.equal((await noBudget({ id: good.id, to: w.bob.address, sig: gsig, ip: "4.4.4.4" })).code, "budget");

  const pricey = await actor(w, { cfg: { ...CFG, maxGasPrice: 1n } }); // the RPC quotes more than we allow
  const tooDear = makeRelayer({ osmo: w.read, send: pricey.send, cfg: relayerCfg(w), log: quiet });
  assert.equal((await tooDear({ id: good.id, to: w.bob.address, sig: gsig, ip: "5.5.5.5" })).code, "failed");
  assert.equal(await w.share.balanceOf(w.bob.address), eth("100"), "neither refusal moved anything");

  const limited = makeRelayer({ osmo: w.read, send: r.send, cfg: { ...relayerCfg(w), perIpPerMin: 2 }, log: quiet });
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await limited({ id: "9999", to: w.bob.address, sig: gsig, ip: "6.6.6.6" })).code);
  assert.deepEqual(codes, ["no_such_link", "no_such_link", "rate_limited"]);
});

test("relayer http: loopback JSON only, tiny bodies, CORS only for listed origins", async t => {
  const w = await world();
  t.after(w.stop);
  const r = await actor(w);
  const cfg = relayerCfg(w);
  const server = serve({ claim: makeRelayer({ osmo: w.read, send: r.send, cfg, log: quiet }), cfg });
  await new Promise(res => server.listen(0, "127.0.0.1", res));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/claim`, { method: "POST", body, headers });

  const { id, key } = await newLink(w);
  const sig = await sign(w, key, id, w.bob.address);
  const ok = await post(JSON.stringify({ id, to: w.bob.address, sig }), { Origin: "http://ok.test" });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "http://ok.test");
  assert.equal((await post("{", {})).status, 400);
  assert.equal((await post("x".repeat(4000))).status, 413);
  assert.equal((await fetch(`${base}/claim`)).status, 404);
  const evil = await post("{}", { Origin: "http://evil.test" });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
});

// --- notifier ---

test("notifier pushes once per payment, cleans the memo, and never replays history", async t => {
  const w = await world();
  t.after(w.stop);
  const pushes = [];
  const state = { next: undefined, recent: [], save: quiet };
  const poll = makeNotifier({
    osmo: w.read, provider: w.provider, registry: w.registry.target, state,
    publish: async (topic, m) => pushes.push({ topic, ...m }),
    cfg: { ...CFG, confirmations: 0 }, explorer: "https://explorer.test", log: quiet,
  });
  await w.osmo.connect(w.alice).sendToken(w.share.target, "bobby", eth("1"), "before the notifier started");
  await poll(); // first run starts now
  assert.equal(pushes.length, 0, "history is not replayed");

  const tx = await (await w.osmo.connect(w.alice).sendToken(w.share.target, "bobby", eth("0.25"), "pizza\nline2 \u0007")).wait();
  await poll();
  await poll();
  assert.equal(pushes.length, 1, "no duplicate on the next poll");
  assert.equal(pushes[0].topic, topicFor(w.bob.address));
  assert.equal(pushes[0].title, "Payment received");
  assert.equal(pushes[0].body, "alice sent you 0.25 mSHARE: pizza line2");
  assert.equal(pushes[0].click, `https://explorer.test/tx/${tx.hash}`);
  assert.match(pushes[0].title + pushes[0].click, /^[\x20-\x7e]*$/, "headers stay ASCII");

  // A crash replays the chunk: the de-dupe memory stops a second push.
  state.next = undefined;
  state.next = tx.blockNumber;
  await poll();
  assert.equal(pushes.length, 1);

  // A dead push channel drops the message but never wedges the cursor.
  const dead = makeNotifier({
    osmo: w.read, provider: w.provider, registry: w.registry.target,
    state: { next: undefined, recent: [], save: quiet },
    publish: async () => { throw new Error("down"); },
    cfg: { ...CFG, confirmations: 0 }, explorer: "https://explorer.test", log: quiet,
  });
  await dead();
  await w.osmo.connect(w.alice).sendToken(w.share.target, "bobby", eth("1"), "x");
  await dead();
});

test("notifier never sends the note of a private payment to the push service", async t => {
  const w = await world();
  t.after(w.stop);
  const pushes = [];
  const poll = makeNotifier({
    osmo: w.read, provider: w.provider, registry: w.registry.target,
    state: { next: undefined, recent: [], save: quiet },
    publish: async (topic, m) => pushes.push(m),
    cfg: { ...CFG, confirmations: 0 }, explorer: "https://explorer.test", log: quiet,
  });
  await poll();
  await (await w.osmo.connect(w.alice).sendToken(w.share.target, "bobby", eth("1"), PRIVATE_MARK + "secret rent")).wait();
  await poll();
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].body, "alice sent you 1.0 mSHARE (private)");
  assert.doesNotMatch(JSON.stringify(pushes), /secret/);
});

test("the limiter forgets old hits and counts keys separately", () => {
  let now = 0;
  const ok = limiter(2, 1000, () => now);
  assert.deepEqual([ok("a"), ok("a"), ok("a"), ok("b")], [true, true, false, true]);
  now = 1001;
  assert.equal(ok("a"), true);
});
