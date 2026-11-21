/**
 * /healthz  = a tiny "are you awake?" page for a free uptime checker (docs/faster-dashboard.md).
 *
 * Free Render servers fall asleep after 15 minutes without visits, and waking up takes
 * about a minute. A checker that opens this address every 10 minutes keeps the
 * dashboard awake, so it opens fast. It also wakes the API behind it.
 * It shows no private data, so it works without logging in (see middleware.ts).
 */
import { apiRaw } from "@/lib/api";

export const dynamic = "force-dynamic"; // never cached: it must really reach the server

export async function GET() {
  const api = await apiRaw("/health").then((r) => r.ok).catch(() => false);
  return Response.json({ ok: true, api }, { headers: { "cache-control": "no-store" } });
}
