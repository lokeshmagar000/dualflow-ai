/**
 * DualFlow API server.
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

const app = Fastify({ logger: true });

await app.register(helmet); // safe HTTP headers
await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

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

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
