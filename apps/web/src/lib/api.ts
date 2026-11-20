/**
 * Calls the DualFlow API from the server side of the dashboard.
 * The secret key stays on the server; the browser never sees it.
 */
import "server-only";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-key": process.env.INTERNAL_API_KEY ?? "",
      ...init?.headers,
    },
    cache: "no-store", // always show fresh data
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Like api(), but returns the raw response (for files such as audio). */
export async function apiRaw(path: string): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    headers: { "x-internal-key": process.env.INTERNAL_API_KEY ?? "" },
    cache: "no-store",
  });
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
