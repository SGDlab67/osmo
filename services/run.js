// node services/run.js <keeper|relayer|notifier>
// One role per process, so a compromised or buggy role cannot touch another role's key. Keys come from the
// Keychain; the RPC URL may too, because a QuickNode URL carries an access token. The logic is in roles.js.
import { ethers } from "ethers";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CFG, addSecret, deployment, keychain, log } from "./lib.js";
import { start } from "./roles.js";

const role = process.argv[2];
if (!["keeper", "relayer", "notifier"].includes(role)) {
  console.error("usage: node services/run.js <keeper|relayer|notifier>");
  process.exit(2);
}
const rpc = keychain("quicknode-monad-testnet-url") ?? CFG.publicRpc;
addSecret(rpc); // never print it
let key;
if (role !== "notifier") {
  key = keychain(`osmo-${role}-key`);
  if (!key) {
    console.error(`missing Keychain item osmo-${role}-key`);
    process.exit(1);
  }
  addSecret(key);
}
const provider = new ethers.JsonRpcProvider(rpc, CFG.chainId, {
  staticNetwork: ethers.Network.from(CFG.chainId),
  cacheTimeout: -1, // the chain is the source of truth: never serve a read from ethers' 250ms cache
});
const handle = await start(role, {
  provider,
  deployment: deployment(),
  key,
  stateDir: path.join(path.dirname(fileURLToPath(import.meta.url)), ".state"),
  ntfyBase: process.env.OSMO_NTFY ?? "https://ntfy.sh",
  port: Number(process.env.OSMO_RELAYER_PORT ?? 8787),
});
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, async () => {
    await handle.stop();
    log("stopped", { role });
    process.exit(0);
  });
