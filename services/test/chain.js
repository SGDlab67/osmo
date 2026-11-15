// A throwaway local chain with the real contracts deployed, for the tests.
// Needs `forge build` (the artifacts in ../out) and `anvil` on the PATH.
import { ethers } from "ethers";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ABI, CFG, ledger, makeSender } from "../lib.js";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "out");
const artifact = name => JSON.parse(fs.readFileSync(path.join(out, `${name}.sol`, `${name}.json`), "utf8"));
const deploy = async (signer, name, ...args) => {
  const a = artifact(name);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode.object, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
};
const wait = async tx => (await tx).wait();

export const WEEK = 7 * 24 * 3600;

export async function world() {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const proc = spawn("anvil", ["--port", String(port), "--silent"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' });
      break;
    } catch {
      if (i > 100) throw new Error("anvil did not start");
      await new Promise(r => setTimeout(r, 100));
    }
  }
  const provider = new ethers.JsonRpcProvider(url, 31337, {
    staticNetwork: ethers.Network.from(31337),
    pollingInterval: 50,
    batchMaxCount: 1,
    cacheTimeout: -1, // never answer from a 250ms cache: the tests re-read state right away
  });
  const [deployer, alice, bob, mallory] = await Promise.all([0, 1, 2, 3].map(i => provider.getSigner(i)));
  const share = await deploy(deployer, "MockShare", "Mock Share", "mSHARE");
  const other = await deploy(deployer, "MockShare", "Other Share", "oSHARE");
  const registry = await deploy(deployer, "UsernameRegistry");
  const osmo = await deploy(deployer, "Osmo", registry.target);
  for (const [who, name] of [[alice, "alice"], [bob, "bobby"]]) {
    await wait(registry.connect(who).claim(name));
    await wait(share.mint(who.address, ethers.parseEther("100")));
  }
  await wait(other.mint(alice.address, ethers.parseEther("100")));
  for (const t of [share, other]) await wait(t.connect(alice).approve(osmo.target, ethers.MaxUint256));
  return {
    provider, deployer, alice, bob, mallory, share, other, registry, osmo,
    read: new ethers.Contract(osmo.target, ABI, provider), // what the services see
    travel: async s => { await provider.send("evm_increaseTime", [s]); await provider.send("evm_mine", []); },
    stop: () => { provider.destroy(); proc.kill(); },
  };
}

/// A funded hot wallet with its own sender and ledger, like a real service.
export async function actor(w, { cfg = CFG, capWei = ethers.parseEther("1") } = {}) {
  const wallet = ethers.Wallet.createRandom().connect(w.provider);
  await wait(w.deployer.sendTransaction({ to: wallet.address, value: ethers.parseEther("10") }));
  const led = ledger(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "osmo-")), "ledger.json"), capWei);
  return { wallet, led, send: makeSender({ contract: w.read.connect(wallet), provider: w.provider, cfg, ledger: led }) };
}
