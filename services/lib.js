// Shared plumbing for the keeper, the relayer and the notifier.
//
// Rules the three services share, each from a first-principles reason:
//  - The chain is the source of truth. Nothing here trusts a local clock or a
//    cached order; state is re-read, and every action is safe to repeat.
//  - Every send is simulated first. Monad charges the gas LIMIT, so a
//    reverted transaction still costs money and a simulation is free.
//  - Every spend is capped (gas limit, gas price, daily budget), because the
//    RPC is not trusted to quote a sane fee and the callers are strangers.
//  - No secret reaches a log. The RPC URL carries an access token, so it is
//    registered as a secret and scrubbed from everything printed.
import { ethers } from "ethers";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const deployment = () =>
  JSON.parse(fs.readFileSync(path.join(here, "..", "deployments", "monad-testnet.json"), "utf8"));

export const CFG = {
  chainId: 10143,
  publicRpc: "https://testnet-rpc.monad.xyz",
  maxGas: 250_000n, // claimLink and runOrder use about 130k
  maxGasPrice: 1_000n * 10n ** 9n, // 1000 gwei; the testnet runs near 100
  dailyBudgetWei: ethers.parseEther("0.5"),
  waitMs: 30_000,
  confirmations: 3, // blocks of 0.3s: a send is final well inside a second
  logChunk: 100, // public Monad RPCs refuse more than 100 blocks per eth_getLogs
};

export const ABI = [
  "function orderCount() view returns (uint256)",
  "function orders(uint256) view returns (address from, uint48 nextAt, uint48 every, address token, address to, uint256 value, string name, string memo)",
  "function runOrder(uint256 id) returns (address)",
  "function links(uint256) view returns (address from, address key, address token, uint256 value, string memo)",
  "function claimDigest(uint256 id, address to) view returns (bytes32)",
  "function claimLink(uint256 id, address to, bytes sig)",
  "function usernames() view returns (address)",
  "event Sent(address indexed token, address indexed from, address indexed to, string name, uint256 value, string memo, bool byAgent)",
  "error NotDue(uint256 nextAt)",
  "error NoSuchOrder()",
  "error NoSuchLink()",
  "error BadClaimSignature()",
];
export const ERC20 = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
export const REGISTRY = ["function nameOf(address) view returns (string)"];

// --- secrets and logs ---

/// Read one Keychain item. Credentials never come from files, argv or env.
export const keychain = name => {
  try {
    return execFileSync("security", ["find-generic-password", "-w", "-s", name], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
};

const secrets = new Set();
export const addSecret = s => s && secrets.add(s);
const scrub = s => [...secrets].reduce((out, x) => out.split(x).join("<redacted>"), String(s));
export const log = (event, fields = {}) =>
  console.log(scrub(JSON.stringify({ t: new Date().toISOString(), event, ...fields })));
/// A short, safe reason for a failure: the contract's error name if there is one.
export const why = e => scrub(e?.revert?.name ?? e?.code ?? e?.shortMessage ?? "error");

export class Refused extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// --- small state helpers ---

export function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/// Sliding-window limiter: true if `key` may act now.
export const limiter = (limit, windowMs, clock = Date.now) => {
  const hits = new Map();
  return key => {
    const t = clock();
    const recent = (hits.get(key) ?? []).filter(x => t - x < windowMs);
    const ok = recent.length < limit;
    if (ok) recent.push(t);
    hits.set(key, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.length || t - v.at(-1) >= windowMs) hits.delete(k);
    return ok;
  };
};

/// A per-UTC-day spending cap that survives restarts.
export const ledger = (file, capWei, clock = () => new Date()) => {
  const day = () => clock().toISOString().slice(0, 10);
  const spent = () => {
    try {
      const s = JSON.parse(fs.readFileSync(file, "utf8"));
      return s.day === day() ? BigInt(s.wei) : 0n;
    } catch {
      return 0n;
    }
  };
  return {
    spent,
    canSpend: wei => spent() + wei <= capWei,
    add: wei => writeAtomic(file, { day: day(), wei: (spent() + wei).toString() }),
  };
};

// --- chain ---

/// Fail closed: refuse to run against the wrong chain or a missing contract.
export async function preflight(provider, address) {
  const id = BigInt(await provider.send("eth_chainId", []));
  if (id !== BigInt(CFG.chainId)) throw new Error(`rpc is on chain ${id}, expected ${CFG.chainId}`);
  if ((await provider.getCode(address)) === "0x") throw new Error("no contract at the Osmo address");
}

/// Sends one kind of transaction at a time, safely. Returns `send(method, args)`.
/// Simulate, size the gas tightly, check the price and the budget, then send.
export function makeSender({ contract, provider, cfg = CFG, ledger: led }) {
  let tail = Promise.resolve(); // one transaction at a time: no nonce races
  const go = async (method, args) => {
    const fn = contract.getFunction(method);
    await fn.staticCall(...args); // a revert here costs nothing
    const gasLimit = ((await fn.estimateGas(...args)) * 12n) / 10n;
    if (gasLimit > cfg.maxGas) throw new Refused("gas_too_high");
    const fee = await provider.getFeeData();
    const price = fee.maxFeePerGas ?? fee.gasPrice;
    if (!price || price > cfg.maxGasPrice) throw new Refused("gas_price_too_high");
    const worst = gasLimit * price;
    if (!led.canSpend(worst)) throw new Refused("budget");
    const tx = await fn(...args, { gasLimit });
    try {
      const r = await tx.wait(1, cfg.waitMs);
      if (r.status !== 1) throw new Refused("reverted");
      led.add(gasLimit * (r.gasPrice ?? price)); // Monad bills the limit
      return r.hash;
    } catch (e) {
      led.add(worst); // unknown outcome: assume the worst was paid
      throw e;
    }
  };
  return (method, args) => {
    const run = tail.then(() => go(method, args));
    tail = run.catch(() => {});
    return run;
  };
}
