"use server";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

/** Approval mode: approve this story's videos (they get the next free upload times). */
export async function approveStory(formData: FormData) {
  const storyId = String(formData.get("storyId"));
  await api(`/stories/${storyId}/approve`, { method: "POST", body: "{}" });
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/calendar");
}

/** Upload this story's videos to every channel now. */
export async function uploadNow(formData: FormData) {
  const storyId = String(formData.get("storyId"));
  await api(`/stories/${storyId}/upload-now`, { method: "POST", body: "{}" });
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/calendar");
}

/** Try a failed upload again. */
export async function retryUpload(formData: FormData) {
  const id = String(formData.get("publicationId"));
  await api(`/publications/${id}/retry`, { method: "POST", body: "{}" });
  revalidatePath("/calendar");
  revalidatePath("/bulk-upload");
  const storyId = formData.get("storyId");
  if (storyId) revalidatePath(`/content/${storyId}`);
}
