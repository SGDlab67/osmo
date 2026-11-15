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
};

export const isLocal = config.chainId === 31337;
