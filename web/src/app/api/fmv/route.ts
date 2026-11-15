import { META } from "@/lib/assets";
import { fmvAt } from "@/lib/fmv";
import { allow, tooMany } from "@/lib/guard";

/** GET /api/fmv?symbol=NVDA&t=<unix seconds>: the USD value of one unit at that moment, for donation receipts. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const symbol = u.searchParams.get("symbol") ?? "";
  const t = Number(u.searchParams.get("t"));
  const now = Date.now() / 1000;
  if (!META[symbol]) return Response.json({ error: "unknown asset" }, { status: 400 });
  if (!Number.isInteger(t) || t > now + 120 || t < now - 400 * 86_400) return Response.json({ error: "t must be a unix time in the last 400 days" }, { status: 400 });
  if (!allow("fmv", 120)) return tooMany();
  const body = await fmvAt(symbol, t);
  return Response.json(body, { headers: { "Cache-Control": "usdPerUnit" in body && now - t > 3600 ? "public, s-maxage=86400" : "no-store" } });
}
