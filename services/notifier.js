// The notifier: tells a recipient they were paid.
//
// It reads the public Sent event and publishes one push per payment. It holds
// no key and writes nothing on chain, so the worst it can do is send a wrong
// or missing notification. A push is a hint: it carries a link to the
// explorer, which is the source of truth.
//
// Delivery is at-least-once with a de-dupe: the cursor moves only after a
// chunk is handled, and recent (tx, log) pairs are remembered, so a crash
// replays at most a chunk and never double-notifies.
import { ethers } from "ethers";
import { createHash } from "node:crypto";
import { ERC20, REGISTRY, why } from "./lib.js";

/// ntfy topics have no access control: the name is the password. This one is
/// derived from the public address, so it hides nothing the chain does not
/// already show. It does stop a stranger guessing a topic from a username.
// ponytail: anyone who computes a topic can publish a fake push to it. Safe
// because the push links to the explorer; for real use, self-host ntfy with
// access tokens and publish to authenticated topics.
export const topicFor = address =>
  "t-" + createHash("sha256").update("v1:" + address.toLowerCase()).digest("hex").slice(0, 32);

/// Strip control characters and cap the length: a memo is untrusted text.
const clean = (s, max) => String(s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const short = a => `${a.slice(0, 6)}...${a.slice(-4)}`;

export const ntfy = base => async (topic, { title, body, click }) => {
  const r = await fetch(`${base}/${topic}`, {
    method: "POST",
    body,
    // Headers must be ASCII; only the body carries the memo.
    headers: { Title: title, Click: click, Tags: "money_with_wings" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) throw new Error(`push ${r.status}`);
};

export function makeNotifier({ osmo, provider, registry, state, publish, cfg, explorer, log }) {
  const meta = new Map();
  const tokenMeta = async addr => {
    if (addr === ethers.ZeroAddress) return { symbol: "MON", decimals: 18 };
    if (!meta.has(addr)) {
      // The token is chosen by the sender, so treat its answers as hostile.
      const t = new ethers.Contract(addr, ERC20, provider);
      let m = { symbol: "tokens", decimals: 18 };
      try {
        const [s, d] = await Promise.all([t.symbol(), t.decimals()]);
        const dec = Number(d);
        if (Number.isInteger(dec) && dec >= 0 && dec <= 36) m = { symbol: clean(s, 12) || "tokens", decimals: dec };
      } catch {
        /* keep the default */
      }
      meta.set(addr, m);
    }
    return meta.get(addr);
  };
  const nameOf = async addr => {
    try {
      return clean(await new ethers.Contract(registry, REGISTRY, provider).nameOf(addr), 20);
    } catch {
      return "";
    }
  };

  async function push(l) {
    const key = `${l.transactionHash}:${l.index}`;
    if (state.recent.includes(key)) return;
    const { token, from, to, value, memo } = l.args;
    const m = await tokenMeta(token);
    const who = (await nameOf(from)) || short(from);
    const amount = ethers.formatUnits(value, m.decimals);
    const body = `${who} sent you ${amount} ${m.symbol}${memo ? ": " + clean(memo, 140) : ""}`;
    for (let attempt = 1; ; attempt++) {
      try {
        await publish(topicFor(to), { title: "Payment received", body, click: `${explorer}/tx/${l.transactionHash}` });
        break;
      } catch (e) {
        if (attempt === 3) return log("push_dropped", { tx: l.transactionHash, reason: why(e) });
        await new Promise(r => setTimeout(r, 250 * attempt));
      }
    }
    state.recent = [...state.recent, key].slice(-200);
    log("pushed", { tx: l.transactionHash });
  }

  /// One pass: everything final since the cursor.
  return async function poll() {
    const safe = (await provider.getBlockNumber()) - cfg.confirmations;
    let from = state.next ?? safe + 1; // first run starts now: no replay of history
    while (from <= safe) {
      const to = Math.min(from + cfg.logChunk - 1, safe);
      for (const l of await osmo.queryFilter(osmo.filters.Sent(), from, to)) await push(l);
      state.next = to + 1;
      state.save();
      from = to + 1;
    }
    if (state.next === undefined) {
      state.next = safe + 1;
      state.save();
    }
  };
}
