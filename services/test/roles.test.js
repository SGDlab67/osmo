// The roles as run.js starts them: this is the wiring the part tests cannot see.
import { ethers } from "ethers";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CFG } from "../lib.js";
import { sponsoredTokens, start } from "../roles.js";
import { WEEK, world } from "./chain.js";

const eth = ethers.parseEther;
const until = async (ok, ms = 8000) => {
  for (const t = Date.now(); Date.now() - t < ms; ) {
    if (await ok()) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("timed out waiting");
};
const boot = async (w, role, extra = {}) => {
  const hot = ethers.Wallet.createRandom();
  await (await w.deployer.sendTransaction({ to: hot.address, value: eth("10") })).wait();
  return start(role, {
    provider: w.provider,
    deployment: { explorer: "https://explorer.test", contracts: { Osmo: { address: w.osmo.target }, MockShare: { address: w.share.target } } },
    key: hot.privateKey,
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "osmo-role-")),
    cfg: { ...CFG, chainId: 31337, confirmations: 0 },
    pollMs: 50,
    port: 0,
    logger: () => {},
    ...extra,
  });
};

test("keeper role stays up, runs a due order, and stops cleanly", async t => {
  const w = await world();
  t.after(w.stop);
  const role = await boot(w, "keeper");
  await (await w.osmo.connect(w.alice).createOrder(w.share.target, "bobby", eth("1"), 0, WEEK, "rent")).wait();
  await until(async () => (await w.share.balanceOf(w.bob.address)) === eth("101"));
  await role.stop();
});

test("relayer role stays up after starting, serves a claim, and closes on stop", async t => {
  const w = await world();
  t.after(w.stop);
  const role = await boot(w, "relayer");
  const key = ethers.Wallet.createRandom();
  await (await w.osmo.connect(w.alice).createLink(w.share.target, eth("1"), key.address, "gift")).wait();
  const id = String((await w.osmo.linkCount()) - 1n);
  const sig = key.signingKey.sign(await w.osmo.claimDigest(id, w.bob.address)).serialized;
  await new Promise(r => setTimeout(r, 300)); // the old bug: the process exited right after listening
  const res = await fetch(`http://127.0.0.1:${role.port}/claim`, { method: "POST", body: JSON.stringify({ id, to: w.bob.address, sig }) });
  assert.equal(res.status, 200);
  assert.equal(await w.share.balanceOf(w.bob.address), eth("101"));
  await role.stop();
  await assert.rejects(fetch(`http://127.0.0.1:${role.port}/claim`, { method: "POST", body: "{}" }));
});

test("notifier role pushes a real payment to a push service over http", async t => {
  const w = await world();
  t.after(w.stop);
  const got = [];
  const sink = http.createServer((req, res) => {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => (got.push({ url: req.url, title: req.headers.title, body }), res.end("ok")));
  });
  await new Promise(r => sink.listen(0, "127.0.0.1", r));
  t.after(() => sink.close());
  const role = await boot(w, "notifier", { ntfyBase: `http://127.0.0.1:${sink.address().port}` });
  await new Promise(r => setTimeout(r, 300)); // let the first poll set its cursor
  await (await w.osmo.connect(w.alice).sendToken(w.share.target, "bobby", eth("2"), "dinner")).wait();
  await until(() => got.length === 1);
  assert.equal(got[0].title, "Payment received");
  assert.equal(got[0].body, "alice sent you 2.0 mSHARE: dinner");
  await role.stop();
});

test("a role refuses to start on the wrong chain", async t => {
  const w = await world();
  t.after(w.stop);
  await assert.rejects(boot(w, "keeper", { cfg: { ...CFG, chainId: 10143 } }), /expected 10143/);
});

test("the relayer allowlist reads both deployment file shapes", () => {
  const a = "0x" + "a".repeat(40), b = "0x" + "b".repeat(40), c = "0x" + "c".repeat(40);
  assert.deepEqual(sponsoredTokens({ contracts: { MockShare: { address: a } } }), [ethers.ZeroAddress, a]);
  assert.deepEqual(
    sponsoredTokens({ contracts: { Osmo: {} }, demoAccounts: { share: b }, assets: { NVDA: b, USDC: c } }),
    [ethers.ZeroAddress, b, b, c],
  );
  assert.deepEqual(sponsoredTokens({ contracts: {} }), [ethers.ZeroAddress]);
});
