// The keeper: presses Run on standing orders that have fallen due.
//
// It needs no trust and no state. runOrder is open to anyone and pays exactly
// what the order's writer wrote, so the worst a buggy keeper can do is spend
// its own gas. The chain decides what is due; running twice is a no-op.
import { ethers } from "ethers";
import { why } from "./lib.js";

/// One pass over every order. Returns how many it ran.
export async function tick({ osmo, provider, send, log, dead = new Set(), seen = new Map() }) {
  const [count, head] = await Promise.all([osmo.orderCount(), provider.getBlock("latest")]);
  const now = BigInt(head.timestamp); // the contract's clock, not ours
  let ran = 0;
  // ponytail: reads every order each tick. Fine for a demo's tens of orders;
  // at scale follow OrderCreated and keep a queue sorted by nextAt instead.
  for (let id = 0n; id < count; id++) {
    if (dead.has(id)) continue;
    const o = await osmo.orders(id);
    if (o.from === ethers.ZeroAddress) {
      dead.add(id); // cancelled orders are zeroed in place and never return
      continue;
    }
    if (now < o.nextAt) continue;
    try {
      log("ran", { id: String(id), tx: await send("runOrder", [id]) });
      ran++;
    } catch (e) {
      // Allowance revoked, balance short, or someone else ran it first: not
      // our problem and not worth gas. Say so once per cause, not every tick.
      const key = `${o.nextAt}:${why(e)}`;
      if (seen.get(id) !== key) {
        seen.set(id, key);
        log("skipped", { id: String(id), reason: why(e) });
      }
    }
  }
  return ran;
}
