"use server";
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";

/** Save the "AI for writing" choice (Claude or Gemini, and the Claude model). */
export async function saveAiSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const body: Record<string, string> = {};
  const provider = formData.get("provider");
  const claudeModel = formData.get("claudeModel");
  if (typeof provider === "string" && provider) body.provider = provider;
  if (typeof claudeModel === "string" && claudeModel) body.claudeModel = claudeModel;
  try {
    await api("/ai-settings", { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/settings");
  return { ok: true, message: "Saved. The next video run uses it." };
}
