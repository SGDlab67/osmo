// The relayer: pays the gas for claim links, so a newcomer with an empty
// wallet can receive their first payment.
//
// It is a one-function machine. It can only ever call claimLink on the Osmo
// contract, and the contract itself binds the recipient to the link holder's
// signature, so the relayer cannot redirect, steal or invent a claim. What it
// CAN lose is gas, so everything here exists to bound that loss:
//   shape checks -> rate limits -> token allowlist -> signature check off
//   chain -> simulation -> tight gas -> price cap -> daily budget.
// Every check before the last two costs nothing.
import { ethers } from "ethers";
import http from "node:http";
import { limiter, why } from "./lib.js";

const isId = s => typeof s === "string" && /^\d{1,18}$/.test(s);
const isSig = s => typeof s === "string" && /^0x[0-9a-fA-F]{130}$/.test(s);
const isAddr = s => typeof s === "string" && ethers.isAddress(s) && s !== ethers.ZeroAddress;

export function makeRelayer({ osmo, send, cfg, log, clock }) {
  const perIp = limiter(cfg.perIpPerMin, 60_000, clock);
  const global = limiter(cfg.globalPerMin, 60_000, clock);
  const allowed = new Set(cfg.allowedTokens.map(a => a.toLowerCase()));
  const inflight = new Set();

  return async function claim({ id, to, sig, ip }) {
    if (!isId(id) || !isAddr(to) || !isSig(sig)) return { code: "bad_request" };
    if (!perIp(ip) || !global("all")) return { code: "rate_limited" };
    if (inflight.has(id)) return { code: "busy" };
    inflight.add(id);
    try {
      let link;
      try {
        link = await osmo.links(id);
      } catch (e) {
        // An id past the end of the array reverts; anything else is the RPC.
        return { code: e.code === "CALL_EXCEPTION" ? "no_such_link" : "failed" };
      }
      if (link.from === ethers.ZeroAddress) return { code: "no_such_link" };
      if (!allowed.has(link.token.toLowerCase())) return { code: "not_sponsored" };
      // Check the signature ourselves so a forged claim never reaches the chain.
      let signer;
      try {
        signer = ethers.recoverAddress(await osmo.claimDigest(id, to), sig);
      } catch {
        return { code: "bad_signature" };
      }
      if (signer.toLowerCase() !== link.key.toLowerCase()) return { code: "bad_signature" };
      const tx = await send("claimLink", [id, to, sig]);
      log("sponsored", { id, tx });
      return { code: "ok", tx };
    } catch (e) {
      log("refused", { id, reason: why(e) });
      return { code: e.code === "budget" ? "budget" : "failed" };
    } finally {
      inflight.delete(id);
    }
  };
}

const STATUS = {
  ok: 200,
  bad_request: 400,
  bad_signature: 403,
  not_sponsored: 403,
  no_such_link: 404,
  rate_limited: 429,
  busy: 429,
  budget: 503,
  failed: 502,
};

/// POST /claim {id, to, sig}. Loopback by default; tiny bodies; short timeouts.
export function serve({ claim, cfg }) {
  const server = http.createServer(async (req, res) => {
    const origin = cfg.origins.includes(req.headers.origin) ? req.headers.origin : undefined;
    const reply = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        Vary: "Origin",
        ...(origin && { "Access-Control-Allow-Origin": origin }),
      });
      res.end(JSON.stringify(body));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...(origin && { "Access-Control-Allow-Origin": origin }),
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }
    if (req.method !== "POST" || req.url !== "/claim") return reply(404, { error: "not_found" });
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 1024) {
        reply(413, { error: "too_large" });
        res.once("finish", () => req.destroy()); // stop reading the rest
        return;
      }
      chunks.push(c);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply(400, { error: "bad_request" });
    }
    // ponytail: the limiter keys on the socket address. Behind a proxy or a
    // tunnel every caller shares one bucket; trust X-Forwarded-For only once
    // the proxy is ours.
    const out = await claim({ ...body, ip: req.socket.remoteAddress });
    reply(STATUS[out.code] ?? 500, out.code === "ok" ? { ok: true, tx: out.tx } : { error: out.code });
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  return server;
}
