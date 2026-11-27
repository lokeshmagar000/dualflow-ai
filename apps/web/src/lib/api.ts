/**
 * Calls the DualFlow API from the server side of the dashboard.
 * The secret key stays on the server; the browser never sees it.
 */
import "server-only";
import { insideApiBaseUrl, insideApiStatus, startInsideApi } from "./inside-api";

/**
 * The API address. People often type it without "https://" or with a "/" at
 * the end, so we fix both here instead of failing.
 */
async function apiBaseUrl() {
  // One server mode: the API runs on this same machine (lib/inside-api.ts).
  if (process.env.DATABASE_URL) return insideApiBaseUrl();
  let url = (process.env.API_URL ?? "").trim() || "http://localhost:4000";
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

/** Where the dashboard runs, for messages: "Vercel" or "Render". */
export function hostName() {
  return process.env.VERCEL === "1" ? "Vercel" : "Render";
}

/** Where you add a setting (environment variable) for the dashboard, in plain words. */
export function envPlace() {
  return process.env.VERCEL === "1" ? "Vercel (your project, Settings, Environment Variables)" : "Render (dualflow-web, Environment)";
}

/** True when the API runs inside this same server (one server mode: DATABASE_URL is set here). */
export function oneServerMode() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Where videos are kept, as seen from THIS server (same rules as packages/storage).
 * Only meaningful in one server mode, where the API runs here with the same settings.
 * `missing` lists the R2 settings that are not on Render yet.
 */
export function storageSetup(): { driver: "r2" | "local"; missing: string[] } {
  const e = process.env;
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((k) => !e[k]?.trim());
  if (missing[0] === "R2_ACCOUNT_ID" && e.R2_ENDPOINT) missing.shift();
  const choice = (e.STORAGE?.trim() || (missing.length === 0 ? "r2" : "local")).toLowerCase();
  return { driver: choice === "r2" ? "r2" : "local", missing };
}

/** True while the inside API is still getting ready (the database update or the first start). */
function insideApiBusy() {
  const s = insideApiStatus().state;
  return oneServerMode() && (s === "off" || s === "updating-database" || s === "starting" || s === "restarting");
}

/** What kind of problem happened, so the page can explain it in plain words. */
export type ApiProblemKind = "blocked" | "waking" | "unauthorized" | "old" | "server" | "offline";

/**
 * The error thrown when the API does not answer well.
 * "message" is short and readable: we never copy a whole web page (like Render's
 * "Just a moment..." page) into it, which used to fill the screen with red code.
 */
export class ApiProblem extends Error {
  constructor(public kind: ApiProblemKind, public status: number | null, message: string, public detail = "") {
    super(message);
    this.name = "ApiProblem";
  }
}

/** Turns an answer body into one short line (HTML pages become a short note). */
function shortBody(text: string) {
  const t = text.trim();
  if (t.startsWith("<")) {
    return /just a moment|cf-chl|challenge/i.test(t) ? "Render's protection page (\"Just a moment...\")" : "a web page instead of data";
  }
  try {
    const j = JSON.parse(t) as { error?: unknown; message?: unknown };
    const m = typeof j.message === "string" && j.message ? j.message : j.error; // Fastify puts the useful text in "message"
    if (typeof m === "string") return m.slice(0, 200);
  } catch { /* not JSON */ }
  return t.slice(0, 200);
}

function problemFor(status: number, body: string, path: string): ApiProblem {
  const isChallenge = body.trimStart().startsWith("<") && /just a moment|cf-chl|challenge/i.test(body);
  const short = shortBody(body);
  const msg = `${path} answered ${status}: ${short}`;
  if (status === 429 || isChallenge) return new ApiProblem("blocked", status, msg, short);
  if (status === 502 || status === 503 || status === 504) return new ApiProblem("waking", status, msg, short);
  if (status === 401 || status === 403) return new ApiProblem("unauthorized", status, msg, short);
  // 404 "Route GET /x not found" = the API does not know this address yet (older version).
  // Other 404s (like "Story not found") are normal answers.
  if (status === 404 && /^Route /.test(short)) return new ApiProblem("old", status, msg, short);
  return new ApiProblem("server", status, msg, short);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch(), but it tries again when the API is still starting (could not connect,
 * or a 502/503/504 "waking up" answer) or said "too many requests" (429).
 * Buttons (POST/DELETE) are never repeated by themselves, so nothing happens twice.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  if (oneServerMode()) startInsideApi(); // normally already started by instrumentation.ts; this is a safety net
  const safeToRepeat = !init.method || init.method === "GET";
  const started = Date.now();
  const waits = [1000, 2000, 4000, 8000]; // up to 15 seconds in total
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Only "could not connect" errors land here.
      // In one server mode the API may still be starting (up to about a minute on the free plan): keep waiting.
      if (insideApiBusy() && Date.now() - started < 75_000) {
        await wait(2000);
        attempt--; // does not count as a try
        continue;
      }
      if (attempt >= waits.length || !safeToRepeat) {
        throw new ApiProblem("offline", null, `Could not connect to ${url.replace(/\?.*/, "")} (${err instanceof Error ? err.message : String(err)})`);
      }
      await wait(waits[attempt] ?? 1000);
      continue;
    }
    const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    // A "too many requests" answer gets only 2 more tries, so we do not make it worse.
    const maxTries = res.status === 429 ? 2 : waits.length;
    if (retryable && safeToRepeat && attempt < maxTries) {
      await res.text().catch(() => ""); // read and drop this answer (cancel() can hang inside Next.js)
      await wait((waits[attempt] ?? 1000) + 500);
      continue;
    }
    return res;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(`${await apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-key": process.env.INTERNAL_API_KEY ?? "",
      ...init?.headers,
    },
    cache: "no-store", // always show fresh data
  });
  const text = await res.text();
  if (!res.ok) throw problemFor(res.status, text, path);
  try {
    return JSON.parse(text) as T;
  } catch {
    // A 200 answer that is not data (for example a protection page) counts as blocked.
    throw problemFor(text.trimStart().startsWith("<") ? 429 : 500, text, path);
  }
}

/** Like api(), but returns the raw response (for files such as audio). */
export async function apiRaw(path: string): Promise<Response> {
  return fetchWithRetry(`${await apiBaseUrl()}${path}`, {
    headers: { "x-internal-key": process.env.INTERNAL_API_KEY ?? "" },
    cache: "no-store",
  });
}

/** What a button shows after it ran: a green note (ok) or a red one. */
export type ActionResult = { ok?: boolean; message?: string; values?: Record<string, string> }; // values: what you typed, kept after an error

/** A short, readable error text for buttons (server actions). */
export function problemText(e: unknown): string {
  if (e instanceof ApiProblem) {
    switch (e.kind) {
      case "blocked": return "Render blocked the request to the API server (too many requests). Wait a minute and try again. The lasting fix is one server mode (see Settings).";
      case "waking": return "The API server is waking up. Try again in about a minute.";
      case "offline": return "Could not connect to the API server. Try again in a minute.";
      case "unauthorized": return "The dashboard and the API have different INTERNAL_API_KEY values on Render.";
      case "old": return "The API server runs an older version. Redeploy it on Render (see Settings).";
      default: return e.detail || e.message;
    }
  }
  return e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
}

/* Types for the data the API returns (simplified). */
export interface Topic {
  id: string;
  title: string;
  notes: string | null;
  source: string;
  status: string;
  createdAt: string;
}
export interface Variant {
  id: string;
  language: "ne" | "en";
  status: string;
}
export interface Story {
  id: string;
  format: string;
  status: string;
  lastError: string | null;
  createdAt: string;
  topic: Topic;
  variants: Variant[];
}
export interface Scene {
  id: string;
  order: number;
  purpose: string | null;
  text: string;
  startMs: number | null;
  endMs: number | null;
}
export interface VoiceInfo {
  provider: string; // "azure" or "mock" (practice voice)
  voice: string;
  cues: { startMs: number; endMs: number; text: string }[];
}
export interface StoryDetail extends Omit<Story, "topic" | "variants"> {
  costUsd: number;
  research: { summary: string } | null;
  topic: Topic & { researchNotes: { id: string; claim: string; sourceUrl: string | null }[] };
  variants: (Variant & {
    title: string | null;
    description: string | null;
    hashtags: string[];
    thumbnailHeadline: string | null;
    lastError: string | null;
    durationSec: number | null;
    scenes: Scene[];
    voice: VoiceInfo | null;
    publications: (Publication & { channel: { name: string; platform: string } })[];
  })[];
}
/** One upload of one video to one channel. */
export interface Publication {
  id: string;
  status: string; // READY = waiting for approval, SCHEDULED, GENERATING = uploading, PUBLISHED, FAILED
  scheduledAt: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  attempts: number;
  error: string | null;
}
export interface QueueItem extends Publication {
  channel: { name: string; platform: string; language: "ne" | "en" };
  variant: { id: string; title: string | null; language: "ne" | "en"; story: { id: string; topic: { title: string } } };
}
export interface ChannelInfo {
  id: string;
  platform: string;
  language: "ne" | "en";
  name: string;
  mode: "AUTO" | "APPROVAL" | "MANUAL";
  updatedAt: string;
  counts: Record<string, number>;
}
export interface CostSummary {
  todayUsd: number;
  monthUsd: number;
  paused: boolean;
  budgets: { period: string; capUsd: number }[];
}
export interface PipelineStatus {
  queue: { readyNow: number; later: number; running: number; nextJobAt: string | null };
  runNowAvailable: boolean;
  quotas: { name: string; used: number; limit: number | null }[];
}

/* ---------- Bulk upload page ---------- */
export interface BulkChannel {
  id: string;
  platform: "YOUTUBE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK";
  language: "ne" | "en";
  name: string;
}
export interface BulkSetup {
  channels: BulkChannel[];
  storage: "r2" | "local";
  uploadRunReady: boolean;
}
export interface BulkUploadItem {
  id: string;
  format: "SHORT" | "LONG";
  createdAt: string;
  variants: {
    id: string;
    language: "ne" | "en";
    title: string | null;
    durationSec: number | null;
    publications: (Pick<Publication, "id" | "status" | "postUrl" | "error" | "attempts" | "publishedAt" | "scheduledAt"> & {
      channel: { name: string; platform: string };
    })[];
  }[];
}

/* ---------- Ready to upload page ---------- */
export interface ReadyVariant {
  id: string;
  language: "ne" | "en";
  title: string | null;
  description: string | null;
  hashtags: string[];
  durationSec: number | null;
  outputKey: string | null; // null = the video file was deleted (cleanup)
  manualUploadedAt: string | null;
  thumbnails: { id: string }[];
  thumbnailUrl: string | null; // direct address of the preview picture (fast), or null
  thumbnailSizes?: string[]; // extra sizes: "shorts" | "youtube" | "feed"
  subtitles: { id: string }[];
  /** Full video: the shorts cut from it (download: /download/<id>/clip?n=<n>). */
  clips?: { n: number; title: string; durationSec: number }[];
  /** Where this video was sent (Upload buttons or Auto upload). */
  publications?: { status: string; postUrl: string | null; error: string | null; scheduledAt: string | null; channel: { name: string; platform: string } }[];
}
export interface ReadyStory {
  id: string;
  status: string;
  /** SHORT = vertical short; LONG = full 4-5 minute video (wide 16:9). */
  format?: "SHORT" | "LONG";
  createdAt: string;
  topic: { title: string; source: string };
  /** Nepal News & Politics video: series name + sources to check (null for other videos). */
  politics?: { series: string; sources: { name: string; url: string }[] } | null;
  variants: ReadyVariant[];
}
export interface ReadyPage {
  stories: ReadyStory[];
  total: number; // stories on this tab, all pages together
  page: number;
  pageSize: number;
  videoCount: number; // video files "Download all" puts in the zip
}

/* ---------- Nepal News & Politics (Ideas page) ---------- */
export interface PoliticsStatus {
  enabled: boolean;
  series: string[]; // the ticked series ids
  perDay: number; // 0, 1 or 2 of the day's automatic videos
  allSeries: { id: string; nameEn: string; nameNe: string; about: string; needsNews: boolean }[];
  generateNowAvailable: boolean;
  recent: { id: string; title: string; series: string | null; createdAt: string; storyId: string | null; storyStatus: string | null }[];
}

/* ---------- Automatic videos (Ideas page) ---------- */
/** GET /storage/check: can the server really reach Cloudflare R2? */
export interface StorageCheck {
  driver: "r2" | "local";
  where: string;
  ok: boolean;
  problem: string | null;
}

export interface AutoStatus {
  enabled: boolean; // the Auto mode switch
  paused: boolean; // kill switch on the Costs page
  perDay: number;
  nextRuns: string[]; // next scheduled run times (ISO)
  generateNowAvailable: boolean; // false = GITHUB_DISPATCH_TOKEN not set on Render
  waitingIdeas: number;
  aiTopics: { id: string; title: string; createdAt: string; storyId: string | null; storyStatus: string | null }[];
}

/* ---------- AI for writing (Settings page) ---------- */
/** GET /ai-settings: Claude or Gemini for topics, research, scripts and picture checks. */
export interface AiSettings {
  provider: "claude" | "gemini";
  claudeModel: string;
  saved: boolean; // false = never saved on the dashboard (GitHub's AI_PROVIDER decides, default Claude)
  claudeModels: { id: string; label: string; about: string }[];
  claudeSpend: { today: { usd: number; calls: number }; month: { usd: number; calls: number }; lastUsedAt: string | null };
}
