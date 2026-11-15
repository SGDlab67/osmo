import { kv } from "@/lib/kv";
import { attemptLogin, masterOf } from "@/lib/login";

/** Username + number. Guesses are counted in the shared store before they are checked. */
export async function POST(req: Request) {
  const relayer = process.env.RELAYER_KEY;
  if (!kv || !relayer) return Response.json({ error: "Login by number isn't set up on this server yet." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { handle?: unknown; pin?: unknown };
  // On Vercel the platform sets this header; it is not something a caller can choose.
  const ip = (req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const out = await attemptLogin({ kv, master: masterOf(relayer), handle: b.handle, pin: b.pin, ip }).catch(() => ({ ok: false as const, status: 503, error: "Couldn't check just now. Try again.", retryAfter: undefined }));
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (!out.ok) {
    if (out.retryAfter) headers["retry-after"] = String(out.retryAfter);
    return Response.json({ error: out.error }, { status: out.status, headers });
  }
  return Response.json({ key: out.key, address: out.address, handle: out.handle }, { headers });
}
