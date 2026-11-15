import { privateKeyToAccount } from "viem/accounts";
import { registryAbi } from "@/lib/abi";
import { publicClient } from "@/lib/chain";
import { config } from "@/lib/config";
import { allow, tooMany } from "@/lib/guard";
import { kv } from "@/lib/kv";
import { HANDLE, masterOf, savePin } from "@/lib/login";

const off = () => Response.json({ error: "Login by number isn't set up on this server yet." }, { status: 503, headers: { "cache-control": "no-store" } });

/** `?handle=` says whether that username has a number saved. Without it, whether login is available at all. */
export async function GET(req: Request) {
  const handle = new URL(req.url).searchParams.get("handle")?.toLowerCase();
  const body = { ready: Boolean(kv && process.env.RELAYER_KEY), set: kv && handle && HANDLE.test(handle) ? (await kv.get(`acct:${handle}`)) !== null : false };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

/** Save or change the number for a username. The caller proves it owns the name by sending its wallet key. */
export async function POST(req: Request) {
  const relayer = process.env.RELAYER_KEY;
  if (!kv || !relayer) return off();
  if (!allow("pin-save", 60)) return tooMany();
  const b = (await req.json().catch(() => ({}))) as { handle?: unknown; key?: unknown; pin?: unknown };
  const out = await savePin({
    kv,
    master: masterOf(relayer),
    handle: b.handle,
    key: b.key,
    pin: b.pin,
    ownerOf: (handle) => publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "resolve", args: [handle] }),
    addressOf: (key) => privateKeyToAccount(key as `0x${string}`).address,
  }).catch(() => ({ ok: false as const, status: 503, error: "Couldn't save the number just now. Try again." }));
  return out.ok ? Response.json({ ok: true }, { headers: { "cache-control": "no-store" } }) : Response.json({ error: out.error }, { status: out.status, headers: { "cache-control": "no-store" } });
}
