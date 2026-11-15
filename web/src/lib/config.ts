/**
 * Where the app points. Defaults are the Monad testnet deployment; override any of them with env vars
 * (see .env.example). NEXT_PUBLIC_ values are read in the browser, the rest only on the server.
 */
export const config = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143),
  rpc: process.env.NEXT_PUBLIC_RPC ?? "https://testnet-rpc.monad.xyz",
  explorer: process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet.monadvision.com",
  /** Taihl's contracts, deployed at the Blitz (deployments/monad-testnet.json). */
  osmo: (process.env.NEXT_PUBLIC_OSMO ?? "0xC2f251c89Fac09830dadAb1Fc67Da885F01Bb45e") as `0x${string}`,
  registry: (process.env.NEXT_PUBLIC_REGISTRY ?? "0xC90654Fe34e37dd30F54f980407F1973F7959EE3") as `0x${string}`,
  /** The app's layer: starter kits, gas and the demo assets. */
  welcome: (process.env.NEXT_PUBLIC_WELCOME ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

export const isLocal = config.chainId === 31337;
