import { config } from "@/lib/config";
import { getState } from "@/lib/state-server";

/**
 * Every phone polls this instead of the chain. The CDN serves one cached copy per second to the whole room,
 * so a room on one Wi-Fi costs Monad's public RPC a few calls a second, not a few hundred.
 */
export async function GET(req: Request) {
  if (config.welcome === "0x0000000000000000000000000000000000000000") return Response.json({ error: "not deployed" }, { status: 503 });
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const state = await getState(fresh);
    return Response.json(state, { headers: { "Cache-Control": fresh ? "no-store" : "public, max-age=0, s-maxage=1, stale-while-revalidate=4" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.split("\n")[0] : "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
