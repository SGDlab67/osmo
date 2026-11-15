// node services/run.js <keeper|relayer|notifier>
// One role per process, so a compromised or buggy role cannot touch another
// role's key. Keys come from the Keychain; the RPC URL may too, because a
// QuickNode URL carries an access token.
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ABI, CFG, addSecret, deployment, keychain, ledger, log, makeSender, preflight, writeAtomic, why } from "./lib.js";
import { tick } from "./keeper.js";
import { makeRelayer, serve } from "./relayer.js";
import { makeNotifier, ntfy } from "./notifier.js";

const role = process.argv[2];
if (!["keeper", "relayer", "notifier"].includes(role)) {
  console.error("usage: node services/run.js <keeper|relayer|notifier>");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const stateDir = path.join(here, ".state");
const d = deployment();
const rpc = keychain("quicknode-monad-testnet-url") ?? CFG.publicRpc;
addSecret(rpc); // never print it
const provider = new ethers.JsonRpcProvider(rpc, CFG.chainId, {
  staticNetwork: ethers.Network.from(CFG.chainId),
  cacheTimeout: -1, // the chain is the source of truth: never serve a read from ethers' 250ms cache
});
const address = d.contracts.Osmo.address;
await preflight(provider, address);
const readOnly = new ethers.Contract(address, ABI, provider);

let stop = false;
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => (stop = true));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function signer() {
  const key = keychain(`osmo-${role}-key`);
  if (!key) {
    console.error(`missing Keychain item osmo-${role}-key`);
    process.exit(1);
  }
  addSecret(key);
  return new ethers.Wallet(key, provider);
}
async function sender(wallet) {
  const balance = await provider.getBalance(wallet.address);
  log("start", { role, address: wallet.address, balanceMON: ethers.formatEther(balance) });
  const led = ledger(path.join(stateDir, `${role}-ledger.json`), CFG.dailyBudgetWei);
  return makeSender({ contract: readOnly.connect(wallet), provider, ledger: led });
}

if (role === "keeper") {
  const send = await sender(signer());
  const memo = { dead: new Set(), seen: new Map() };
  while (!stop) {
    try {
      await tick({ osmo: readOnly, provider, send, log, ...memo });
    } catch (e) {
      log("tick_failed", { reason: why(e) });
    }
    await sleep(2_000);
  }
} else if (role === "relayer") {
  const send = await sender(signer());
  const cfg = {
    perIpPerMin: 6,
    globalPerMin: 30,
    // Native links and the demo share only: a hostile token can make a claim
    // revert or burn gas, so sponsoring is opt-in per token.
    allowedTokens: [ethers.ZeroAddress, d.contracts.MockShare.address],
    origins: ["http://localhost:8000", "http://127.0.0.1:8000"],
  };
  const port = Number(process.env.OSMO_RELAYER_PORT ?? 8787);
  const server = serve({ claim: makeRelayer({ osmo: readOnly, send, cfg, log }), cfg });
  server.listen(port, "127.0.0.1", () => log("listening", { host: "127.0.0.1", port }));
  while (!stop) await sleep(500);
  server.close();
} else {
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
    osmo: readOnly,
    provider,
    registry: await readOnly.usernames(),
    state,
    publish: ntfy(process.env.OSMO_NTFY ?? "https://ntfy.sh"),
    cfg: CFG,
    explorer: d.explorer,
    log,
  });
  log("start", { role });
  while (!stop) {
    try {
      await poll();
    } catch (e) {
      log("poll_failed", { reason: why(e) });
    }
    await sleep(1_000);
  }
}
log("stopped", { role });
process.exit(0);
