import { formatUnits } from "viem";
import { erc20Abi, welcomeAbi } from "./abi";
import { config } from "./config";
import { publicClient } from "./chain";

export type Market = "stocks" | "crypto" | "metals" | "treasuries" | "cash";

export const MARKETS: { id: Market; label: string }[] = [
  { id: "stocks", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
  { id: "metals", label: "Gold & silver" },
  { id: "treasuries", label: "Treasuries" },
  { id: "cash", label: "Stablecoins" },
];

export interface AssetInfo {
  name: string;
  cg: string;
  market: Market;
  logo: string;
  about: string;
}

/** Every asset the app shows, with its real logo. MON is Monad's own coin; the rest are test tokens on Monad testnet. */
export const META: Record<string, AssetInfo> = {
  NVDA: { name: "NVIDIA", cg: "nvidia-xstock", market: "stocks", logo: "/logos/NVDA.svg", about: "Designs the chips behind most AI training and gaming graphics." },
  TSLA: { name: "Tesla", cg: "tesla-xstock", market: "stocks", logo: "/logos/TSLA.png", about: "Electric vehicles, batteries and energy storage." },
  AAPL: { name: "Apple", cg: "apple-xstock", market: "stocks", logo: "/logos/AAPL.png", about: "iPhone, Mac and services." },
  GOOGL: { name: "Google", cg: "alphabet-xstock", market: "stocks", logo: "/logos/GOOGL.png", about: "Alphabet: search, YouTube, Android and Google Cloud." },
  AMZN: { name: "Amazon", cg: "amazon-xstock", market: "stocks", logo: "/logos/AMZN.png", about: "Online shopping, Prime and Amazon Web Services." },
  META: { name: "Meta", cg: "meta-xstock", market: "stocks", logo: "/logos/META.png", about: "Facebook, Instagram, WhatsApp and Quest headsets." },
  MSFT: { name: "Microsoft", cg: "microsoft-xstock", market: "stocks", logo: "/logos/MSFT.png", about: "Windows, Office, Xbox and Azure cloud." },
  NFLX: { name: "Netflix", cg: "netflix-xstock", market: "stocks", logo: "/logos/NFLX.png", about: "Streaming films and series." },
  COIN: { name: "Coinbase", cg: "coinbase-xstock", market: "stocks", logo: "/logos/COIN.png", about: "A US crypto exchange and custodian." },
  CRCL: { name: "Circle", cg: "circle-xstock", market: "stocks", logo: "/logos/CRCL.png", about: "Issuer of the USDC and EURC stablecoins." },
  PAXG: { name: "Gold", cg: "pax-gold", market: "metals", logo: "/logos/PAXG.png", about: "PAX Gold. Each token is one troy ounce of gold in a London vault." },
  XAUT: { name: "Tether Gold", cg: "tether-gold", market: "metals", logo: "/logos/XAUT.png", about: "Each token is one troy ounce of gold in a Swiss vault." },
  KAG: { name: "Silver", cg: "kinesis-silver", market: "metals", logo: "/logos/KAG.png", about: "Kinesis Silver. Each token is one troy ounce of vaulted silver." },
  USDY: { name: "US Treasuries", cg: "ondo-us-dollar-yield", market: "treasuries", logo: "/logos/USDY.png", about: "Ondo US Dollar Yield, backed by short-term US Treasuries. The price rises slowly as interest builds up." },
  BUIDL: { name: "BlackRock Treasury Fund", cg: "blackrock-usd-institutional-digital-liquidity-fund", market: "treasuries", logo: "/logos/BUIDL.png", about: "BlackRock's tokenized fund of cash and US Treasury bills. Stays near $1." },
  BTC: { name: "Bitcoin", cg: "bitcoin", market: "crypto", logo: "/logos/BTC.png", about: "The first and largest cryptocurrency." },
  ETH: { name: "Ethereum", cg: "ethereum", market: "crypto", logo: "/logos/ETH.png", about: "The network most on-chain apps are built on." },
  SOL: { name: "Solana", cg: "solana", market: "crypto", logo: "/logos/SOL.png", about: "A fast, low-fee network." },
  MON: { name: "Monad", cg: "monad", market: "crypto", logo: "/logos/MON.png", about: "Monad's own coin. It also pays the network fee for every payment here." },
  USDC: { name: "USD Coin", cg: "usd-coin", market: "cash", logo: "/logos/USDC.png", about: "The digital dollar issued by Circle. Always worth $1." },
  USDT: { name: "Tether USD", cg: "tether", market: "cash", logo: "/logos/USDT.png", about: "The most used dollar stablecoin. Tracks $1." },
  PYUSD: { name: "PayPal USD", cg: "paypal-usd", market: "cash", logo: "/logos/PYUSD.png", about: "PayPal's dollar stablecoin, issued by Paxos. Tracks $1." },
  DAI: { name: "Dai", cg: "dai", market: "cash", logo: "/logos/DAI.png", about: "A dollar stablecoin run on-chain by the Sky protocol." },
  EURC: { name: "Euro Coin", cg: "euro-coin", market: "cash", logo: "/logos/EURC.png", about: "The digital euro issued by Circle. Always worth one euro." },
};

/** Dollar coins sit at $1. EURC follows the euro. */
export const DOLLAR_COINS = ["USDC", "USDT", "PYUSD", "DAI"];

export interface Token {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  native?: boolean;
}

export const MON_TOKEN: Token = { address: "0x0000000000000000000000000000000000000000", symbol: "MON", decimals: 18, native: true };

let cache: Promise<Token[]> | null = null;

/** The demo assets, read from the Welcome contract once per page load, plus MON. */
export function loadTokens(): Promise<Token[]> {
  if (!cache) {
    cache = (async () => {
      const n = Number(await publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "assetCount" }));
      const addrs = await Promise.all(
        Array.from({ length: n }, (_, i) => publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "assets", args: [BigInt(i)] })),
      );
      const list = await Promise.all(
        addrs.map(async (address) => {
          const [symbol, decimals] = await Promise.all([
            publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
            publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
          ]);
          return { address, symbol, decimals: Number(decimals) };
        }),
      );
      return [...list, MON_TOKEN];
    })().catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

export async function balancesOf(owner: `0x${string}`, tokens: Token[]) {
  const raw = await Promise.all(
    tokens.map((t) => (t.native ? publicClient.getBalance({ address: owner }) : publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }))),
  );
  const out: Record<string, number> = {};
  tokens.forEach((t, i) => (out[t.symbol] = Number(formatUnits(raw[i], t.decimals))));
  return out;
}

/** Dollars to token units, rounded down so a payment never asks for more than the holder has. */
export function unitsFor(usd: number, price: number, decimals: number): bigint {
  return toRaw(usd / price, decimals);
}

export function toRaw(units: number, decimals: number): bigint {
  const scale = Math.min(decimals, 12);
  return BigInt(Math.floor(units * 10 ** scale)) * BigInt(10) ** BigInt(decimals - scale);
}

export function usd(n: number, cents = true) {
  const whole = !cents && Number.isInteger(n);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: n !== 0 && Math.abs(n) < 0.01 ? 4 : 2 })}`;
}

export function unitsLabel(n: number, symbol: string) {
  const digits = n >= 100 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 5 : 7;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${symbol}`;
}

/** MON pays gas, so keep a little back when paying with it. */
export const MON_GAS_RESERVE = 0.03;
