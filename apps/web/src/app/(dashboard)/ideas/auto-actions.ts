"use server";
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";

export type AutoState = ActionResult;

/** The Auto mode switch. */
export async function setAutoMode(_prev: AutoState, formData: FormData): Promise<AutoState> {
  const enabled = formData.get("enabled") === "true";
  try {
    await api("/auto", { method: "POST", body: JSON.stringify({ enabled }) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/ideas");
  revalidatePath("/");
  return { ok: true, message: enabled ? "Auto mode is ON." : "Auto mode is OFF. No new videos at 2 AM / 4 AM." };
}

/** The "Generate now" button. */
export async function generateNow(_prev: AutoState): Promise<AutoState> {
  try {
    const r = await api<{ message: string }>("/auto/generate-now", { method: "POST", body: "{}" });
    return { ok: true, message: r.message };
  } catch (e) {
    return { message: problemText(e) };
  }
}
