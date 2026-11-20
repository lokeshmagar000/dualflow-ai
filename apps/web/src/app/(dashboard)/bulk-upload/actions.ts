"use server";
/**
 * Server actions for the bulk upload page. They run on the dashboard server,
 * so the API's secret key never reaches the browser.
 * (The video itself does NOT pass through here: it goes straight to R2.)
 */
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Turn "API /x failed: 400 {"error":"..."}" into just the "..." part, for a friendly message. */
function friendly(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  const match = text.match(/\{.*\}$/);
  if (match) {
    try {
      const json = JSON.parse(match[0]);
      if (typeof json.error === "string") return json.error;
    } catch {
      /* not JSON: use the whole text */
    }
  }
  return text;
}

/** Step 1: ask for a file name and an upload address. */
export async function startBulkUpload(file: { fileName: string; sizeBytes: number; contentType: string }): Promise<Result<{ key: string; uploadUrl: string | null }>> {
  try {
    const r = await api<{ key: string; uploadUrl: string | null }>("/bulk-uploads/start", { method: "POST", body: JSON.stringify(file) });
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export interface CreateBulkInput {
  key: string;
  language: "ne" | "en";
  title: string;
  caption: string;
  hashtags: string[];
  durationSec: number | null;
  width: number | null;
  height: number | null;
  channelIds: string[];
}

/** Step 3: the video has arrived; make the uploads and start the upload run. */
export async function createBulkUpload(input: CreateBulkInput): Promise<Result<{ storyId: string; message: string }>> {
  try {
    const r = await api<{ storyId: string; message: string }>("/bulk-uploads", { method: "POST", body: JSON.stringify(input) });
    revalidatePath("/bulk-upload");
    revalidatePath("/calendar");
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

/** "Upload now" button: start the small upload run again. */
export async function runUploadNow() {
  await api("/bulk-uploads/run", { method: "POST", body: "{}" });
  revalidatePath("/bulk-upload");
}
