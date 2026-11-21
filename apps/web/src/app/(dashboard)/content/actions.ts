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

/** What the Delete button shows after trying. */
export type DeleteState = { error?: string };

/**
 * The "Delete" button: removes a story with both languages and its files.
 * (The button asks "Are you sure?" first, see components/DeleteStoryButton.tsx.)
 * Problems come back as a short message under the button, never as a crashed page.
 */
export async function deleteStory(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const storyId = String(formData.get("storyId"));
  const goTo = String(formData.get("goTo") || "");
  try {
    await api(`/stories/${storyId}`, { method: "DELETE", body: "{}" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 404 "Story not found" = it is already gone (for example you pressed twice). That is fine.
    if (!msg.includes("Story not found")) {
      return {
        error: msg.includes("Route DELETE")
          ? "The API server has not updated yet. On Render open dualflow-api → Manual Deploy → Deploy latest commit, then try again."
          : "Could not delete it right now. Wait a minute and try again.",
      };
    }
  }
  revalidatePath("/ready");
  revalidatePath("/content");
  revalidatePath("/");
  // From the story's own page we go back to the list, because the page is gone now.
  if (goTo.startsWith("/")) redirect(goTo);
  return {};
}
