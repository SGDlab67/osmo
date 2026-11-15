// Lists the nonprofits in src/data/charities.json on chain: each gets a stand-in wallet with its username, and the
// curator lists that wallet in Charities pinned to the hash of its record. Safe to run twice.
//
//   cd web && CURATOR_KEY=0x... npm run seed:charities                 # Monad testnet
//   NETWORK=local CURATOR_KEY=0x... npm run seed:charities             # a local anvil deploy
//
// CURATOR_KEY is the wallet that deployed Charities (its owner). Pass it for the one command; never write it to a file.
//
// The organizations are real; their wallets here are not theirs. On testnet each charity's wallet key is derived from
// the public string "osmo-charity:<handle>", so it only ever holds test tokens and anyone can see that it is a stand-in.
// A real launch would list a wallet each organization (or its custodian) controls.
//
// metaHash is keccak256 of JSON.stringify(record), the exact bytes the app hashes to show "Verified".
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const env = process.env;
const dep = JSON.parse(readFileSync(new URL(`../../deployments/${env.NETWORK ?? "monad-testnet"}.json`, import.meta.url), "utf8"));
const records = JSON.parse(readFileSync(new URL("../src/data/charities.json", import.meta.url), "utf8"));
const pick = (v, d) => (v && v.trim() ? v.trim() : d);
const chain = defineChain({
  id: Number(pick(env.NEXT_PUBLIC_CHAIN_ID, dep.chainId)),
  name: "chain",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [pick(env.NEXT_PUBLIC_RPC?.split(",")[0], dep.rpc)] } },
});
const pub = createPublicClient({ chain, transport: http() });
const wallet = (account) => createWalletClient({ account, chain, transport: http() });
const REGISTRY = pick(env.NEXT_PUBLIC_REGISTRY, dep.contracts.UsernameRegistry?.address);
const CHARITIES = pick(env.NEXT_PUBLIC_CHARITIES, dep.contracts.Charities?.address);
if (!REGISTRY || !CHARITIES) throw new Error("No Charities in the deployments file yet: run script/DeployCharities.s.sol first");
if (!env.CURATOR_KEY) throw new Error("Set CURATOR_KEY (the wallet that deployed Charities) for this command");
const curator = privateKeyToAccount(env.CURATOR_KEY);

const registryAbi = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ type: "string" }], outputs: [] },
  { type: "function", name: "nameOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "string" }] },
  { type: "function", name: "resolve", stateMutability: "view", inputs: [{ type: "string" }], outputs: [{ type: "address" }] },
];
const charitiesAbi = [
  { type: "function", name: "addMany", stateMutability: "nonpayable", inputs: [{ type: "address[]" }, { type: "bytes32[]" }], outputs: [] },
  { type: "function", name: "metaHashOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "count", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

/**
 * Monad keeps a reserve balance: an account holding less than it can't send transactions back to back, and the RPC
 * answers "Signer had insufficient balance" until a few blocks have passed. Retry those with a pause.
 */
async function retrying(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 20 || !String(e).includes("insufficient balance")) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
async function sendSync(account, req) {
  return retrying(async () => {
    const hash = await wallet(account).sendTransaction(req);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`transaction ${hash} reverted`);
    return r;
  });
}
async function write(account, call) {
  return retrying(async () => {
    const hash = await wallet(account).writeContract(call);
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${call.functionName} reverted`);
    return r;
  });
}

/** Send a charity wallet's unspent gas money back to the curator (its key comes from a public string, see above). */
async function sweep(acct) {
  const bal = await pub.getBalance({ address: acct.address });
  const maxFeePerGas = ((await pub.getGasPrice()) * 130n) / 100n;
  const fee = 21000n * maxFeePerGas;
  if (bal <= 2n * fee) return;
  await sendSync(acct, { to: curator.address, value: bal - fee, gas: 21000n, maxFeePerGas, maxPriorityFeePerGas: 2_000_000_000n }).catch((e) =>
    console.log(`sweep from ${acct.address} skipped: ${String(e).split("\n")[0]}`),
  );
}

const owner = await pub.readContract({ address: CHARITIES, abi: charitiesAbi, functionName: "owner" });
if (owner.toLowerCase() !== curator.address.toLowerCase()) throw new Error(`CURATOR_KEY is ${curator.address}, but Charities is owned by ${owner}`);

const toList = [];
const toClaim = [];
for (const rec of records) {
  const acct = privateKeyToAccount(keccak256(toBytes(`osmo-charity:${rec.handle}`)));
  const metaHash = keccak256(toBytes(JSON.stringify(rec)));
  const holder = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "resolve", args: [rec.handle] });
  if (holder !== "0x0000000000000000000000000000000000000000" && holder.toLowerCase() !== acct.address.toLowerCase()) {
    console.log(`@${rec.handle} is already taken by ${holder}; skipping`);
    continue;
  }
  if (!(await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "nameOf", args: [acct.address] }))) {
    // Monad charges the full gas limit, so keep the limit tight. Fund twice the fee (the RPC checks against a cautious
    // ceiling); the unspent half is swept back after the claim.
    const gas = ((await pub.estimateContractGas({ address: REGISTRY, abi: registryAbi, functionName: "claim", args: [rec.handle], account: acct.address })) * 110n) / 100n;
    const gasPrice = ((await pub.getGasPrice()) * 110n) / 100n;
    const need = 2n * gas * gasPrice - (await pub.getBalance({ address: acct.address }));
    if (need > 0n) await sendSync(curator, { to: acct.address, value: need });
    toClaim.push({ rec, acct, gas });
  }
  const listed = await pub.readContract({ address: CHARITIES, abi: charitiesAbi, functionName: "metaHashOf", args: [acct.address] });
  if (listed === "0x0000000000000000000000000000000000000000000000000000000000000000") toList.push([acct.address, metaHash, rec.handle]);
  else if (listed !== metaHash) console.log(`@${rec.handle} is listed with an older record hash; the app will show "details changed"`);
}

// A freshly funded wallet can't send for a while on Monad testnet (about 20 seconds here), so fund all, then claim all.
if (toClaim.length) {
  console.log(`Funded ${toClaim.length} charity wallets; waiting for Monad to accept their first transaction…`);
  await new Promise((r) => setTimeout(r, 20_000));
}
for (const { rec, acct, gas } of toClaim) {
  await write(acct, { address: REGISTRY, abi: registryAbi, functionName: "claim", args: [rec.handle], gas });
  console.log(`@${rec.handle} claimed by ${acct.address}`);
}
for (const { acct } of toClaim) await sweep(acct);

if (toList.length) {
  await write(curator, { address: CHARITIES, abi: charitiesAbi, functionName: "addMany", args: [toList.map((x) => x[0]), toList.map((x) => x[1])] });
  console.log(`Listed ${toList.length}: ${toList.map((x) => x[2]).join(", ")}`);
} else console.log("already seeded");
console.log(`Charities.count() = ${await pub.readContract({ address: CHARITIES, abi: charitiesAbi, functionName: "count" })}`);
