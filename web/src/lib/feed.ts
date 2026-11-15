import { decodeEventLog, formatUnits, type Hash } from "viem";
import { registryAbi, osmoAbi } from "./abi";
import { config } from "./config";
import { publicClient } from "./chain";
import type { Token } from "./assets";

/** A note that starts with this mark was sent as Private: the app shows it only to the two people. The chain itself is public. */
export const PRIVATE_MARK = "\u{1F512}\u200B";

export interface Payment {
  id: string;
  hash: Hash;
  block: bigint;
  from: string;
  to: string;
  symbol: string;
  units: number;
  note: string;
  isPrivate: boolean;
  time: number;
}

const handles = new Map<string, string>();

async function handleOf(a: `0x${string}`) {
  const k = a.toLowerCase();
  if (!handles.has(k)) {
    const n = await publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [a] }).catch(() => "");
    handles.set(k, (n || `${a.slice(0, 6)}…${a.slice(-4)}`).toLowerCase());
  }
  return handles.get(k)!;
}

export async function sentBlockCount() {
  return Number(await publicClient.readContract({ address: config.osmo, abi: osmoAbi, functionName: "sentBlockCount" }));
}

/**
 * Recent payments, newest first. Monad's public RPC answers eth_getLogs for 100 blocks at a time, so Osmo
 * keeps a list of the blocks that hold a send (`sentBlocks`) and the app asks for exactly those blocks.
 */
export async function readFeed(tokens: Token[], count: number, lastN = 30): Promise<Payment[]> {
  if (count === 0) return [];
  const idx = Array.from({ length: Math.min(lastN, count) }, (_, i) => BigInt(count - 1 - i));
  const blocks = [...new Set(await Promise.all(idx.map((i) => publicClient.readContract({ address: config.osmo, abi: osmoAbi, functionName: "sentBlocks", args: [i] }))))];
  const bySymbol = new Map(tokens.map((t) => [t.address.toLowerCase(), t]));
  const [logsPerBlock, times] = await Promise.all([
    Promise.all(blocks.map((b) => publicClient.getLogs({ address: config.osmo, fromBlock: BigInt(b), toBlock: BigInt(b) }))),
    Promise.all(blocks.map((b) => publicClient.getBlock({ blockNumber: BigInt(b) }).then((x) => Number(x.timestamp) * 1000).catch(() => Date.now()))),
  ]);
  const out: Payment[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (const log of logsPerBlock[i]) {
      try {
        const ev = decodeEventLog({ abi: osmoAbi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Sent") continue;
        const t = bySymbol.get(ev.args.token.toLowerCase());
        if (!t) continue;
        const isPrivate = ev.args.memo.startsWith(PRIVATE_MARK);
        out.push({
          id: `${log.transactionHash}-${log.logIndex}`,
          hash: log.transactionHash!,
          block: log.blockNumber!,
          from: await handleOf(ev.args.from),
          to: ev.args.name.toLowerCase(),
          symbol: t.symbol,
          units: Number(formatUnits(ev.args.value, t.decimals)),
          note: isPrivate ? ev.args.memo.slice(PRIVATE_MARK.length) : ev.args.memo,
          isPrivate,
          time: times[i],
        });
      } catch {}
    }
  }
  return out.sort((a, b) => Number(b.block - a.block));
}
