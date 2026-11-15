/**
 * A cap on how often the app's relayer routes may spend gas, per route. One bucket for everyone, on purpose:
 * a per-IP limit would key on X-Forwarded-For, which any caller can set when no trusted proxy overwrites it.
 * The memory is per server instance, so on serverless the real ceiling is Welcome.maxMembers on chain.
 */
const hits = new Map<string, number[]>();

export function allow(route: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(route) ?? []).filter((t) => now - t < windowMs);
  const ok = recent.length < limit;
  if (ok) recent.push(now);
  hits.set(route, recent);
  return ok;
}

export const tooMany = () => Response.json({ error: "Lots of people joining at once. Try again in a few seconds." }, { status: 429 });
