/**
 * Builds the DualFlow API (all its routes), without starting a server.
 * - src/index.ts starts it as its own server (Render dualflow-api, or your computer).
 * - The dashboard can also run it inside its own process (Vercel, see apps/web/src/lib/inside-api.ts).
 * Only the dashboard calls it, using a shared secret (INTERNAL_API_KEY).
 */
import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { topicRoutes } from "./routes/topics";
import { storyRoutes } from "./routes/stories";
import { costRoutes } from "./routes/costs";
import { pipelineRoutes } from "./routes/pipeline";
import { publishingRoutes } from "./routes/publishing";
import { bulkRoutes } from "./routes/bulk";
import { readyRoutes } from "./routes/ready";
import { autoRoutes } from "./routes/auto";
import { connectRoutes } from "./routes/connect";

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? true });
  await app.register(helmet); // safe HTTP headers
  // At most 200 requests a minute from one address. The dashboard on the same machine
  // (one server mode, 127.0.0.1) is never limited: it is the only real user.
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute", allowList: ["127.0.0.1", "::1", "::ffff:127.0.0.1"] });

  // Health check for the hosting platform. No secret needed.
  app.get("/health", async () => ({ ok: true }));

  // Every other route needs the internal key.
  const apiKey = process.env.INTERNAL_API_KEY ?? "";
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const given = String(req.headers["x-internal-key"] ?? "");
    // timingSafeEqual compares without leaking how many characters matched.
    const ok =
      apiKey.length > 0 &&
      given.length === apiKey.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(apiKey));
    if (!ok) return reply.code(401).send({ error: "Unauthorized" });
  });

  await app.register(topicRoutes);
  await app.register(storyRoutes);
  await app.register(costRoutes);
  await app.register(pipelineRoutes);
  await app.register(publishingRoutes);
  await app.register(bulkRoutes);
  await app.register(readyRoutes);
  await app.register(autoRoutes);
  await app.register(connectRoutes);

  return app;
}
