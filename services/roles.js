// Starts one role against an injected provider and key. run.js is the thin shell that reads the Keychain;
// everything that can break lives here so the tests can run it, not just its parts.
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { ABI, CFG, ledger, log, makeSender, preflight, writeAtomic } from "./lib.js";
import { tick } from "./keeper.js";
import { makeRelayer, serve } from "./relayer.js";
import { makeNotifier, ntfy } from "./notifier.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/// Tokens the relayer will sponsor a claim for: the native currency and our own demo tokens. Reads both
/// deployment file shapes: the first one (a MockShare entry) and the phone app's (assets by symbol and
/// demoAccounts.share).
export const sponsoredTokens = d =>
  [ethers.ZeroAddress, d.contracts?.MockShare?.address, d.demoAccounts?.share, ...Object.values(d.assets ?? {})].filter(Boolean);

/// Returns { stop(), port? }. Throws before doing anything if the chain or contract is wrong.
export async function start(role, { provider, deployment, key, stateDir, ntfyBase = "https://ntfy.sh", port = 8787, pollMs, cfg = CFG, origins = ["http://localhost:8000", "http://127.0.0.1:8000"], logger = log }) {
  const address = deployment.contracts.Osmo.address;
  await preflight(provider, address, cfg.chainId);
  const read = new ethers.Contract(address, ABI, provider);
  let stopped = false;
  const loop = (every, step) =>
    (async () => {
      while (!stopped) {
        try {
          await step();
        } catch (e) {
          logger(`${role}_failed`, { reason: e?.code ?? e?.shortMessage ?? "error" });
        }
        await sleep(every);
      }
    })();

  const sender = async () => {
    const wallet = new ethers.Wallet(key, provider);
    logger("start", { role, address: wallet.address, balanceMON: ethers.formatEther(await provider.getBalance(wallet.address)) });
    const led = ledger(path.join(stateDir, `${role}-ledger.json`), cfg.dailyBudgetWei ?? CFG.dailyBudgetWei);
    return makeSender({ contract: read.connect(wallet), provider, cfg, ledger: led });
  };

  if (role === "keeper") {
    const send = await sender();
    const memo = { dead: new Set(), seen: new Map() };
    const done = loop(pollMs ?? 2_000, () => tick({ osmo: read, provider, send, log: logger, ...memo }));
    return { stop: async () => ((stopped = true), done) };
  }

  if (role === "relayer") {
    const send = await sender();
    const relayerCfg = {
      perIpPerMin: 6,
      globalPerMin: 30,
      // Native links and the demo share only: a hostile token can make a claim revert or burn gas,
      // so sponsoring is opt-in per token.
      allowedTokens: sponsoredTokens(deployment),
      origins,
    };
    const server = serve({ claim: makeRelayer({ osmo: read, send, cfg: relayerCfg, log: logger }), cfg: relayerCfg });
    await new Promise((res, rej) => (server.once("error", rej), server.listen(port, "127.0.0.1", res)));
    logger("listening", { host: "127.0.0.1", port: server.address().port });
    return { port: server.address().port, stop: () => new Promise(res => server.close(res)) };
  }

  if (role === "notifier") {
    const file = path.join(stateDir, "notifier.json");
    const loaded = (() => {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return {};
      }
    })();
    const state = { next: loaded.next, recent: loaded.recent ?? [], save: () => writeAtomic(file, { next: state.next, recent: state.recent }) };
    const poll = makeNotifier({
      osmo: read, provider, registry: await read.usernames(), state,
      publish: ntfy(ntfyBase), cfg, explorer: deployment.explorer ?? "https://testnet.monadvision.com", log: logger,
    });
    logger("start", { role });
    const done = loop(pollMs ?? 1_000, poll);
    return { stop: async () => ((stopped = true), done) };
  }

  throw new Error(`unknown role ${role}`);
}
