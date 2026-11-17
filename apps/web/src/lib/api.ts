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
  createdAt: string;
  topic: Topic;
  variants: Variant[];
}
export interface CostSummary {
  todayUsd: number;
  monthUsd: number;
  paused: boolean;
  budgets: { period: string; capUsd: number }[];
}
