"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiProblem, api, problemText, type ActionResult } from "@/lib/api";

/** Run the pipeline again for a failed story. */
export async function retryStory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const storyId = String(formData.get("storyId"));
  try {
    await api(`/stories/${storyId}/retry`, { method: "POST", body: "{}" });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/content");
  return { ok: true, message: "Started again. It takes about 15 minutes." };
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
    // 404 "Story not found" = it is already gone (for example you pressed twice). That is fine.
    const alreadyGone = e instanceof ApiProblem && e.status === 404 && e.kind !== "old";
    if (!alreadyGone) return { error: problemText(e) };
  }
  revalidatePath("/ready");
  revalidatePath("/content");
  revalidatePath("/library");
  revalidatePath("/");
  // From the story's own page we go back to the list, because the page is gone now.
  if (goTo.startsWith("/")) redirect(goTo);
  return {};
}
