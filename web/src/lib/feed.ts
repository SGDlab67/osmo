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
/** Decoded payments per block. A block's payments never change, so each block is fetched once. */
const blockCache = new Map<bigint, Payment[]>();
/** sentBlocks is append-only, so each index is read once. */
const sentBlockAt = new Map<bigint, bigint>();

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
export async function readFeed(tokens: Token[], count: number, lastN = 40): Promise<Payment[]> {
  if (count === 0) return [];
  const idx = Array.from({ length: Math.min(lastN, count) }, (_, i) => BigInt(count - 1 - i));
  const unknown = idx.filter((i) => !sentBlockAt.has(i));
  const read = await Promise.all(unknown.map((i) => publicClient.readContract({ address: config.osmo, abi: osmoAbi, functionName: "sentBlocks", args: [i] })));
  unknown.forEach((i, k) => sentBlockAt.set(i, BigInt(read[k])));
  const blocks = [...new Set(idx.map((i) => sentBlockAt.get(i)!))];
  const bySymbol = new Map(tokens.map((t) => [t.address.toLowerCase(), t]));
  const fresh = blocks.filter((b) => !blockCache.has(b));
  await Promise.all(
    fresh.map(async (b) => {
      const [logs, time] = await Promise.all([
        publicClient.getLogs({ address: config.osmo, fromBlock: b, toBlock: b }),
        publicClient.getBlock({ blockNumber: b }).then((x) => Number(x.timestamp) * 1000).catch(() => Date.now()),
      ]);
      const out: Payment[] = [];
      for (const log of logs) {
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
            time,
          });
        } catch {}
      }
      blockCache.set(b, out);
    }),
  );
  return blocks.flatMap((b) => blockCache.get(b) ?? []).sort((a, b) => Number(b.block - a.block));
}
