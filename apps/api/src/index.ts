/**
 * DualFlow API server (its own program).
 * The routes live in src/app.ts, so the dashboard can also run them in its own process.
 */
import { buildApp } from "./app";

const app = await buildApp();

// API_PORT is used when the API runs inside the dashboard's server (scripts/start-dashboard.sh).
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
