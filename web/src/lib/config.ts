import { deployment } from "./contracts";

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/**
 * Where the app points. Defaults come from deployments/monad-testnet.json via `npm run contracts`;
 * any NEXT_PUBLIC_ env var overrides them (for a local anvil chain, say). NEXT_PUBLIC_ values are
 * read in the browser, the rest only on the server.
 */
export const config = {
  chainId: Number(env(process.env.NEXT_PUBLIC_CHAIN_ID) ?? deployment.chainId),
  rpc: env(process.env.NEXT_PUBLIC_RPC) ?? deployment.rpc,
  explorer: env(process.env.NEXT_PUBLIC_EXPLORER) ?? deployment.explorer,
  osmo: (env(process.env.NEXT_PUBLIC_OSMO) ?? deployment.osmo) as `0x${string}`,
  registry: (env(process.env.NEXT_PUBLIC_REGISTRY) ?? deployment.registry) as `0x${string}`,
  welcome: (env(process.env.NEXT_PUBLIC_WELCOME) ?? deployment.welcome) as `0x${string}`,
  /** The curated nonprofit registry. Zero address when it isn't deployed, and Give hides itself. */
  charities: (env(process.env.NEXT_PUBLIC_CHARITIES) ?? deployment.charities) as `0x${string}`,
};

/** MonadScan (Etherscan's explorer for Monad), where "View on MonadScan" links go. */
export const monadscan =
  env(process.env.NEXT_PUBLIC_MONADSCAN) ?? (config.chainId === 143 ? "https://monadscan.com" : "https://testnet.monadscan.com");

export const isLocal = config.chainId === 31337;

/**
 * Every RPC the app may use, in order. Monad's public endpoints rate-limit per IP, so on Monad testnet the app
 * spreads over several and falls through to the next on a 429. NEXT_PUBLIC_RPC (comma-separated) replaces the list.
 */
export const rpcs: string[] = env(process.env.NEXT_PUBLIC_RPC)
  ? env(process.env.NEXT_PUBLIC_RPC)!.split(",").map((u) => u.trim()).filter(Boolean)
  : config.chainId === 10143
    ? [config.rpc, "https://rpc-testnet.monadinfra.com", "https://monad-testnet.drpc.org", "https://rpc.ankr.com/monad_testnet", "https://10143.rpc.thirdweb.com"]
    : [config.rpc];
