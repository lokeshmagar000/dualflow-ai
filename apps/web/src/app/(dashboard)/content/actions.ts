"use server";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

/** Run the pipeline again for a failed story. */
export async function retryStory(formData: FormData) {
  const storyId = String(formData.get("storyId"));
  await api(`/stories/${storyId}/retry`, { method: "POST", body: "{}" });
  revalidatePath(`/content/${storyId}`);
  revalidatePath("/content");
}
