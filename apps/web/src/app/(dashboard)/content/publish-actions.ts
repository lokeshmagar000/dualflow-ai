"use server";
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";

/** Approval mode: approve this story's videos (they get the next free upload times). */
export async function approveStory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const storyId = String(formData.get("storyId"));
  try {
    await api(`/stories/${storyId}/approve`, { method: "POST", body: "{}" });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/calendar");
  return { ok: true, message: "Approved." };
}

/** Upload this story's videos to every channel now. */
export async function uploadNow(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const storyId = String(formData.get("storyId"));
  try {
    await api(`/stories/${storyId}/upload-now`, { method: "POST", body: "{}" });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/calendar");
  return { ok: true, message: "Added to the upload queue." };
}

/** Try a failed upload again. */
export async function retryUpload(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("publicationId"));
  try {
    await api(`/publications/${id}/retry`, { method: "POST", body: "{}" });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/calendar");
  revalidatePath("/bulk-upload");
  const storyId = formData.get("storyId");
  if (storyId) revalidatePath(`/content/${storyId}`);
  return { ok: true, message: "Trying again." };
}
