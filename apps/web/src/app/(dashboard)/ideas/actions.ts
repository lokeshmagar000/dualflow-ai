"use server";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

/** Save a new idea typed in the form. */
export async function addTopic(formData: FormData) {
  const title = String(formData.get("title") ?? "");
  const notes = String(formData.get("notes") ?? "") || undefined;
  await api("/topics", { method: "POST", body: JSON.stringify({ title, notes, source: "manual" }) });
  revalidatePath("/ideas");
}

/** Turn an idea into a Story: this starts making BOTH language videos. */
export async function makeVideo(formData: FormData) {
  const topicId = String(formData.get("topicId"));
  const format = String(formData.get("format") ?? "short");
  await api("/stories", { method: "POST", body: JSON.stringify({ topicId, format }) });
  revalidatePath("/ideas");
  revalidatePath("/content");
}
