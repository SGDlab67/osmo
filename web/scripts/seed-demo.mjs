// Creates the app's sample people on-chain, each with their own wallet, profile and username, and a few
// payments between them, so the feed has life before the room joins.
//
//   cd web && node --env-file=.env.local scripts/seed-demo.mjs
//
// Needs NEXT_PUBLIC_RPC, NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_WELCOME, NEXT_PUBLIC_REGISTRY, NEXT_PUBLIC_OSMO and
// RELAYER_KEY (an operator of Welcome). The sample wallets' keys are derived from a public string on purpose:
// they only ever hold test tokens.
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = process.env;
const chain = defineChain({
  id: Number(env.NEXT_PUBLIC_CHAIN_ID ?? 10143),
  name: "chain",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [env.NEXT_PUBLIC_RPC ?? "https://testnet-rpc.monad.xyz"] } },
});
const pub = createPublicClient({ chain, transport: http() });
const wallet = (account) => createWalletClient({ account, chain, transport: http() });
const WELCOME = env.NEXT_PUBLIC_WELCOME;
const REGISTRY = env.NEXT_PUBLIC_REGISTRY;
const GRAM = env.NEXT_PUBLIC_OSMO;
if (!WELCOME || !REGISTRY || !GRAM || !env.RELAYER_KEY) throw new Error("Set the contract addresses and RELAYER_KEY");
const relayer = privateKeyToAccount(env.RELAYER_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const welcomeAbi = [
  { type: "function", name: "welcome", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "string" }], outputs: [] },
  { type: "function", name: "welcomed", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "assetBySymbol", stateMutability: "view", inputs: [{ type: "string" }], outputs: [{ type: "address" }] },
  { type: "function", name: "grant", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [] },
];
const registryAbi = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ type: "string" }], outputs: [] },
  { type: "function", name: "nameOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "string" }] },
];
const gramAbi = [
  { type: "function", name: "sendToken", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "string" }, { type: "uint256" }, { type: "string" }], outputs: [{ type: "address" }] },
  { type: "function", name: "sentBlockCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const PEOPLE = [
  ["ana", "Ana Rivera", "MX"],
  ["wes", "Wes Kim", "US"],
  ["sabina", "Sabina Okafor", "NG"],
  ["maya", "Maya Tran", "CA"],
  ["jordan", "Jordan Park", "GB"],
  ["dev", "Dev Mehta", "IN"],
  ["priya", "Priya Nair", "SG"],
  ["zoe", "Zoe Castillo", "AR"],
];
const PAYMENTS = [
  ["sabina", "wes", 34, "BTC", "🍕 pizza and burgers"],
  ["maya", "jordan", 18, "NVDA", "🎟️ Ducks tickets"],
  ["ana", "dev", 6, "USDC", "☕ coffee run"],
  ["zoe", "priya", 12, "TSLA", "🚕 ride home"],
  ["dev", "ana", 9, "USDC", "🌮 tacos"],
  ["priya", "maya", 15, "NVDA", "happy birthday 🎂"],
];
const PRICES = { USDC: 1, NVDA: 160.2, TSLA: 386.2, BTC: 64600 };
const DECIMALS = { USDC: 6, NVDA: 18, TSLA: 18, BTC: 18 };

const keyOf = (h) => keccak256(toBytes(`osmo-demo:${h}`));
const raw = (units, d) => {
  const s = Math.min(d, 12);
  return BigInt(Math.floor(units * 10 ** s)) * 10n ** BigInt(d - s);
};

async function send(account, call) {
  const r = await wallet(account).writeContractSync(call);
  if (r.status !== "success") throw new Error(`${call.functionName} reverted`);
  return r;
}

for (const [handle, name, country] of PEOPLE) {
  const acct = privateKeyToAccount(keyOf(handle));
  if (!(await pub.readContract({ address: WELCOME, abi: welcomeAbi, functionName: "welcomed", args: [acct.address] }))) {
    await send(relayer, { address: WELCOME, abi: welcomeAbi, functionName: "welcome", args: [acct.address, `${name}|person:${handle}|${country}`] });
    await sleep(1500); // Monad: a freshly funded wallet waits a moment before its first transaction
  }
  if (!(await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "nameOf", args: [acct.address] }))) {
    await send(acct, { address: REGISTRY, abi: registryAbi, functionName: "claim", args: [handle] });
  }
  console.log(`@${handle}`, acct.address);
}

if (Number(await pub.readContract({ address: GRAM, abi: gramAbi, functionName: "sentBlockCount" })) > 0 && !process.argv.includes("--force")) {
  console.log("The feed already has payments; skipping sample payments (pass --force to add them anyway).");
} else {
  for (const [from, to, usd, symbol, note] of PAYMENTS) {
    const acct = privateKeyToAccount(keyOf(from));
    const token = await pub.readContract({ address: WELCOME, abi: welcomeAbi, functionName: "assetBySymbol", args: [symbol] });
    const units = usd / PRICES[symbol];
    await send(relayer, { address: WELCOME, abi: welcomeAbi, functionName: "grant", args: [acct.address, token, raw(units, DECIMALS[symbol])] });
    const r = await send(acct, { address: GRAM, abi: gramAbi, functionName: "sendToken", args: [token, to, raw(units, DECIMALS[symbol]), note] });
    console.log(`@${from} paid @${to} $${usd} of ${symbol}`, r.transactionHash);
  }
}
console.log("Done.");
