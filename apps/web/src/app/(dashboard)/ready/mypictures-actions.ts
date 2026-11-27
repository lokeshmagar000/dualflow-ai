"use server";
/**
 * Server actions for "My pictures" (your own photos / clips for one story) and the Remake button.
 * They run on the dashboard server, so the API's secret key never reaches the browser.
 * The picture itself does NOT pass through here: the browser sends it straight to R2.
 */
import { revalidatePath } from "next/cache";
import { api, problemText } from "@/lib/api";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Step 1: a safe file name and an upload address for one picture. */
export async function startMyPicture(storyId: string, file: { fileName: string; sizeBytes: number; contentType: string }): Promise<Result<{ key: string; uploadUrl: string | null }>> {
  try {
    const r = await api<{ key: string; uploadUrl: string | null }>(`/stories/${storyId}/my-pictures/start`, { method: "POST", body: JSON.stringify(file) });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: problemText(e) };
  }
}

/** Step 2: the picture has arrived; add it to the story's list. */
export async function addMyPicture(storyId: string, input: { key: string; credit: string; name: string }): Promise<Result> {
  try {
    await api(`/stories/${storyId}/my-pictures`, { method: "POST", body: JSON.stringify(input) });
    revalidatePath("/ready");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: problemText(e) };
  }
}

/** Take one picture off the list (its file is deleted too). */
export async function removeMyPicture(storyId: string, n: number): Promise<Result> {
  try {
    await api(`/stories/${storyId}/my-pictures/${n}`, { method: "DELETE", body: "{}" });
    revalidatePath("/ready");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: problemText(e) };
  }
}

/** Make the story's videos again: same script and voice, your pictures first. */
export async function remakeStory(storyId: string): Promise<Result<{ message: string }>> {
  try {
    const r = await api<{ message: string }>(`/stories/${storyId}/remake`, { method: "POST", body: "{}" });
    revalidatePath("/ready");
    return { ok: true, message: r.message };
  } catch (e) {
    return { ok: false, error: problemText(e) };
  }
}
