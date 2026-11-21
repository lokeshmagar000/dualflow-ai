"use server";
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";

/** Save a new idea typed in the form. */
export async function addTopic(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const values = { title, notes: notes ?? "" };
  if (title.length < 3) return { message: "Write at least 3 letters.", values };
  try {
    await api("/topics", { method: "POST", body: JSON.stringify({ title, notes, source: "manual" }) });
  } catch (e) {
    return { message: problemText(e), values };
  }
  revalidatePath("/ideas");
  return { ok: true, message: "Idea saved." };
}

/** Turn an idea into a Story: this starts making BOTH language videos. */
export async function makeVideo(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const topicId = String(formData.get("topicId"));
  const format = String(formData.get("format") ?? "short");
  try {
    await api("/stories", { method: "POST", body: JSON.stringify({ topicId, format }) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/ideas");
  revalidatePath("/content");
  revalidatePath("/");
  return { ok: true, message: "Started. The videos are made with the next run." };
}
