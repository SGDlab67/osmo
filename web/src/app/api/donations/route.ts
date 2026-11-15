import { osmoAbi } from "@/lib/abi";
import { loadTokens, type Token } from "@/lib/assets";
import { publicClient } from "@/lib/chain";
import { config } from "@/lib/config";
import { readFeed } from "@/lib/feed";
import { getState } from "@/lib/state-server";

let tokens: Token[] | null = null;
/** How far back the summary looks, in payments. Each block is read once and cached, so this is cheap after the first call. */
const WINDOW = 500;

/**
 * GET /api/donations?from=<handle>: every gift `from` made to a listed charity, newest first, for the year-end summary.
 * Reads the whole payment history up to WINDOW payments (the shared feed only carries the latest 40).
 */
export async function GET(req: Request) {
  const from = (new URL(req.url).searchParams.get("from") ?? "").toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(from)) return Response.json({ error: "from must be a username" }, { status: 400 });
  try {
    const state = await getState();
    const handles = new Set(state.charities.map((c) => c.handle));
    if (!tokens) tokens = await loadTokens();
    const count = Number(await publicClient.readContract({ address: config.osmo, abi: osmoAbi, functionName: "sentBlockCount" }));
    const all = await readFeed(tokens, count, WINDOW);
    const gifts = all.filter((p) => p.from === from && handles.has(p.to)).map((p) => ({ ...p, block: p.block.toString() }));
    return Response.json({ donations: gifts, complete: count <= WINDOW }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.split("\n")[0] : "unavailable" }, { status: 503 });
  }
}
