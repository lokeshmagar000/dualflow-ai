"use server";
/**
 * Server actions for "My pictures" (your own photos / clips for one story or one waiting idea) and the Remake button.
 * They run on the dashboard server, so the API's secret key never reaches the browser.
 * The picture itself does NOT pass through here: the browser sends it straight to R2.
 */
import { revalidatePath } from "next/cache";
import { api, problemText } from "@/lib/api";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
/** "stories" = a finished story (Ready page), "topics" = a waiting idea (Ideas page). */
export type PictureTarget = "stories" | "topics";
const ID = /^[a-z0-9]{10,40}$/i;
const base = (target: PictureTarget, id: string) => {
  if ((target !== "stories" && target !== "topics") || !ID.test(id)) throw new Error("Bad id");
  return `/${target}/${id}/my-pictures`;
};
const refresh = (target: PictureTarget) => revalidatePath(target === "topics" ? "/ideas" : "/ready");

/** Step 1: a safe file name and an upload address for one picture. */
export async function startMyPicture(target: PictureTarget, id: string, file: { fileName: string; sizeBytes: number; contentType: string }): Promise<Result<{ key: string; uploadUrl: string | null }>> {
  try {
    const r = await api<{ key: string; uploadUrl: string | null }>(`${base(target, id)}/start`, { method: "POST", body: JSON.stringify(file) });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: problemText(e) };
  }
}

/** Step 2: the picture has arrived; add it to the list. */
export async function addMyPicture(target: PictureTarget, id: string, input: { key: string; credit: string; name: string }): Promise<Result> {
  try {
    await api(base(target, id), { method: "POST", body: JSON.stringify(input) });
    refresh(target);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: problemText(e) };
  }
}

/** Take one picture off the list (its file is deleted too). */
export async function removeMyPicture(target: PictureTarget, id: string, n: number): Promise<Result> {
  try {
    await api(`${base(target, id)}/${Number(n)}`, { method: "DELETE", body: "{}" });
    refresh(target);
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
