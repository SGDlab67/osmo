import { createPublicClient, createWalletClient, defineChain, fallback, formatEther, http, type Account, type Hash } from "viem";
import { config, monadscan, rpcs } from "./config";

const onMonad = config.chainId === 10143 || config.chainId === 143;

export const chain = defineChain({
  id: config.chainId,
  name: config.chainId === 10143 ? "Monad testnet" : "Local chain",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [config.rpc] } },
  // Multicall3 sits at its usual address on Monad testnet and mainnet; a local anvil chain doesn't have it.
  ...(onMonad ? { contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as const } } } : {}),
  blockExplorers: { default: { name: "Explorer", url: config.explorer } },
});

// Reads made in the same moment travel as one JSON-RPC batch, and contract reads are folded into a single
// Multicall3 call, so a room full of phones on one Wi-Fi (one IP) stays under the public RPC's rate limit.
const transport = (batch: boolean) =>
  rpcs.length > 1
    ? fallback(
        rpcs.map((u) => http(u, { batch: batch ? { wait: 16 } : false, retryCount: 0, timeout: 8000 })),
        { retryCount: 2, retryDelay: 250 },
      )
    : http(rpcs[0], { batch: batch ? { wait: 16 } : false });

export const publicClient = createPublicClient({ chain, transport: transport(true), batch: onMonad ? { multicall: { wait: 16 } } : undefined });

export function walletFor(account: Account) {
  return createWalletClient({ account, chain, transport: transport(false) });
}

export const txUrl = (hash: string) => `${config.explorer}/tx/${hash}`;
export const scanTxUrl = (hash: string) => `${monadscan}/tx/${hash}`;
export const addressUrl = (a: string) => `${config.explorer}/address/${a}`;

export interface Sent {
  hash: Hash;
  block: bigint;
  ms: number;
  feeMon: number;
}

/**
 * Sign a contract call and get its receipt back in the same request with Monad's eth_sendRawTransactionSync,
 * so the app knows the payment settled, and how long it took from tap to final.
 */
/** Below this much MON a phone wallet asks the server for more gas before (and after) a transaction. */
const LOW_GAS = 60_000_000_000_000_000n; // 0.06 MON: refill well before it runs out, in the background
let topping: Promise<void> | null = null;

/** Top the wallet up from the app's gas fund when it runs low. Quiet on any failure: the send itself reports errors. */
export async function ensureGas(address: `0x${string}`) {
  if (typeof window === "undefined") return;
  const bal = await publicClient.getBalance({ address }).catch(() => null);
  if (bal === null || bal >= LOW_GAS) return;
  topping ??= fetch("/api/topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      topping = null;
    });
  await topping;
}

const lowFunds = (e: unknown) => /insufficient (balance|funds)|missing or invalid parameters/i.test(e instanceof Error ? e.message : String(e));

export async function sendAndConfirm(
  account: Account,
  call: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; value?: bigint },
): Promise<Sent> {
  await ensureGas(account.address);
  const started = performance.now();
  // Monad can refuse a send for a few seconds right after a wallet is topped up, so retry those briefly.
  let receipt;
  for (let i = 0; ; i++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      receipt = await walletFor(account).writeContractSync(call as any);
      break;
    } catch (e) {
      if (i >= 14 || !lowFunds(e)) throw e;
      if (i === 0) await ensureGas(account.address);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  // Refill in the background so the next payment doesn't wait.
  void ensureGas(account.address);
  const ms = Math.round(performance.now() - started);
  if (receipt.status !== "success") throw new Error("The transaction reverted");
  const feeMon = Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice));
  return { hash: receipt.transactionHash, block: receipt.blockNumber, ms, feeMon };
}
