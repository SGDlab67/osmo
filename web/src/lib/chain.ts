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
export async function sendAndConfirm(
  account: Account,
  call: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; value?: bigint },
): Promise<Sent> {
  const started = performance.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receipt = await walletFor(account).writeContractSync(call as any);
  const ms = Math.round(performance.now() - started);
  if (receipt.status !== "success") throw new Error("The transaction reverted");
  const feeMon = Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice));
  return { hash: receipt.transactionHash, block: receipt.blockNumber, ms, feeMon };
}
