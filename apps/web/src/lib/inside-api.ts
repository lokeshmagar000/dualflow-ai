/**
 * ONE SERVER MODE: runs the API inside the dashboard server.
 *
 * When the dashboard server has DATABASE_URL, it starts the API itself (a small
 * helper program on http://127.0.0.1:4001) as soon as the server starts
 * (see src/instrumentation.ts). Then dualflow-api on Render is not needed.
 *
 * Before, this was done by scripts/start-dashboard.sh, but that only ran when the
 * Render "Start Command" had been updated. Now it works with any start command.
 *
 * Steps:
 *   1. Bring the database up to date (prisma migrate deploy), so new columns exist
 *      even if dualflow-api was never redeployed.
 *   2. Start the API. If it stops, start it again after 3 seconds.
 * The current state is kept in `insideApiStatus()` so the Settings page and the
 * error box can show what is happening.
 *
 * SAME PROCESS (Vercel): Vercel cannot start a second program, so there the API's
 * routes run inside this very process instead (on a random port on 127.0.0.1).
 * The database update runs during the Vercel build instead (see apps/web/vercel.json).
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

export const INSIDE_API_PORT = 4001;

/** True on Vercel (or when DUALFLOW_SAME_PROCESS=1): the API runs in this process, not as a helper program. */
export function sameProcessMode() {
  return Boolean(process.env.DATABASE_URL) && (process.env.VERCEL === "1" || process.env.DUALFLOW_SAME_PROCESS === "1");
}

export type InsideApiState = "off" | "updating-database" | "starting" | "running" | "restarting";
interface Status {
  state: InsideApiState;
  since: number;
  restarts: number;
  lastError: string; // last lines the API printed before it stopped (shown on Settings)
  migrate: "not run" | "ok" | "failed" | "done when Vercel built the dashboard";
}

// Kept on globalThis so every part of the server sees the same value.
const g = globalThis as unknown as { __dfInsideApi?: Status; __dfSameProcess?: Promise<string> };
export function insideApiStatus(): Status {
  return g.__dfInsideApi ?? { state: "off", since: Date.now(), restarts: 0, lastError: "", migrate: "not run" };
}
function set(patch: Partial<Status>) {
  g.__dfInsideApi = { ...insideApiStatus(), ...patch };
}

/** Finds the folder with the API code (apps/api), whatever folder the server started in. */
function findApiDir() {
  const tries = [path.resolve(process.cwd(), "../api"), path.resolve(process.cwd(), "apps/api"), path.resolve(process.cwd(), "../../apps/api")];
  return tries.find((d) => existsSync(path.join(d, "src", "index.ts")));
}

/** Keeps the last ~1500 characters a program printed, for error messages. */
function tail(prev: string, chunk: Buffer) {
  return (prev + chunk.toString()).slice(-1500);
}

/**
 * The address of the API inside this server.
 * Same process mode: starts the API's routes here the first time (takes about a second).
 */
export async function insideApiBaseUrl(): Promise<string> {
  if (!sameProcessMode()) return `http://127.0.0.1:${INSIDE_API_PORT}`;
  g.__dfSameProcess ??= startSameProcess().catch((err) => {
    g.__dfSameProcess = undefined; // try again on the next page
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    set({ state: "restarting", restarts: insideApiStatus().restarts + 1, lastError: message.slice(-1500) });
    throw err;
  });
  return g.__dfSameProcess;
}

async function startSameProcess(): Promise<string> {
  if (!process.env.INTERNAL_API_KEY) process.env.INTERNAL_API_KEY = randomBytes(24).toString("hex");
  process.env.DUALFLOW_ONE_SERVER = "1";
  set({ state: "starting", since: Date.now(), migrate: "done when Vercel built the dashboard" });
  const { buildApp } = await import("@dualflow/api/app");
  const app = await buildApp({ logger: false });
  // Port 0 = "any free port". Only this process can reach 127.0.0.1.
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  process.env.API_URL = address;
  set({ state: "running", since: Date.now() });
  console.log(`Same process mode: the API runs inside this server at ${address}`);
  return address;
}

export function startInsideApi() {
  if (!process.env.DATABASE_URL) return; // two-server mode: use API_URL as before
  if (sameProcessMode()) {
    void insideApiBaseUrl().catch((err) => console.error("[same process mode] The API could not start:", err));
    return;
  }
  if (g.__dfInsideApi && g.__dfInsideApi.state !== "off") return; // already started
  const apiDir = findApiDir();
  if (!apiDir) {
    set({ state: "off", lastError: `Could not find the API code next to ${process.cwd()}` });
    console.error("[one server mode] Could not find apps/api, so the API was not started.");
    return;
  }

  // The dashboard and the API must share one secret key. If Render has none, make one now.
  if (!process.env.INTERNAL_API_KEY) process.env.INTERNAL_API_KEY = randomBytes(24).toString("hex");
  process.env.API_URL = `http://127.0.0.1:${INSIDE_API_PORT}`;
  process.env.DUALFLOW_ONE_SERVER = "1";
  console.log("One server mode: starting the API inside the dashboard server.");

  const env = { ...process.env, API_PORT: String(INSIDE_API_PORT), PORT: String(INSIDE_API_PORT) };
  const dbDir = path.resolve(apiDir, "../../packages/db");
  const prismaBin = path.join(dbDir, "node_modules", ".bin", "prisma");

  // When Render stops or restarts the dashboard, stop the API too. Otherwise an old API
  // can keep port 4001 busy, and the new one cannot start ("address already in use").
  let current: ReturnType<typeof spawn> | null = null;
  let stopping = false;
  const stopChild = () => {
    stopping = true;
    if (current && current.exitCode === null) current.kill("SIGTERM");
  };
  process.once("exit", stopChild);
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      stopChild();
      process.exit(0);
    });
  }

  const runApi = () => {
    if (stopping) return;
    set({ state: insideApiStatus().restarts === 0 ? "starting" : "restarting", since: Date.now() });
    // "--import tsx" runs the TypeScript directly; max-old-space-size keeps memory small (free plan: 512 MB).
    const child = spawn(process.execPath, ["--import", "tsx", "--max-old-space-size=160", "src/index.ts"], { cwd: apiDir, env, stdio: ["ignore", "pipe", "pipe"] });
    current = child;
    let printed = "";
    child.stdout.on("data", (c: Buffer) => {
      printed = tail(printed, c);
      process.stdout.write(c);
      if (insideApiStatus().state !== "running" && /Server listening|listening at/i.test(c.toString())) set({ state: "running", since: Date.now() });
    });
    child.stderr.on("data", (c: Buffer) => {
      printed = tail(printed, c);
      process.stderr.write(c);
    });
    child.on("exit", (code) => {
      if (stopping) return; // the dashboard is shutting down: do not start it again
      console.error(`[one server mode] The API stopped (code ${code}). Starting it again in 3 seconds...`);
      set({ state: "restarting", restarts: insideApiStatus().restarts + 1, lastError: printed.trim() || `stopped with code ${code}` });
      setTimeout(runApi, 3000);
    });
  };

  // Step 1: database update (safe to run every start: it only adds what is missing).
  if (existsSync(prismaBin)) {
    set({ state: "updating-database", since: Date.now() });
    const m = spawn(prismaBin, ["migrate", "deploy"], { cwd: dbDir, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    m.stdout.on("data", (c: Buffer) => { out = tail(out, c); process.stdout.write(c); });
    m.stderr.on("data", (c: Buffer) => { out = tail(out, c); process.stderr.write(c); });
    m.on("error", () => { set({ migrate: "failed" }); runApi(); });
    m.on("exit", (code) => {
      set({ migrate: code === 0 ? "ok" : "failed", ...(code === 0 ? {} : { lastError: `Database update failed: ${out.trim()}` }) });
      runApi(); // start the API either way: most pages work even if the update failed
    });
  } else {
    runApi();
  }
}
