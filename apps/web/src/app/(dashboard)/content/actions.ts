"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";

/** Run the pipeline again for a failed story. */
export async function retryStory(formData: FormData) {
  const storyId = String(formData.get("storyId"));
  await api(`/stories/${storyId}/retry`, { method: "POST", body: "{}" });
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/content");
}

/**
 * The "Delete" button: removes a story with both languages and its files.
 * (The button asks "Are you sure?" first, see components/DeleteStoryButton.tsx.)
 */
export async function deleteStory(formData: FormData) {
  const storyId = String(formData.get("storyId"));
  const goTo = String(formData.get("goTo") || "");
  await api(`/stories/${storyId}`, { method: "DELETE", body: "{}" });
  revalidatePath("/ready");
  revalidatePath("/content");
  revalidatePath("/");
  // From the story's own page we go back to the list, because the page is gone now.
  if (goTo.startsWith("/")) redirect(goTo);
}
