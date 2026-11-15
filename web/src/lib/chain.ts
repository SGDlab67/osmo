import { createPublicClient, createWalletClient, defineChain, formatEther, http, type Account, type Hash } from "viem";
import { config } from "./config";

export const chain = defineChain({
  id: config.chainId,
  name: config.chainId === 10143 ? "Monad testnet" : "Local chain",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [config.rpc] } },
  blockExplorers: { default: { name: "Explorer", url: config.explorer } },
});

export const publicClient = createPublicClient({ chain, transport: http(config.rpc) });

export function walletFor(account: Account) {
  return createWalletClient({ account, chain, transport: http(config.rpc) });
}

export const txUrl = (hash: string) => `${config.explorer}/tx/${hash}`;
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
