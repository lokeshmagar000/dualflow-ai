"use server";
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";

/** The "Mark as uploaded" / "Undo" button. */
export async function setUploaded(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const variantId = String(formData.get("variantId"));
  const uploaded = formData.get("uploaded") === "true";
  try {
    await api(`/variants/${variantId}/uploaded`, { method: "POST", body: JSON.stringify({ uploaded }) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/ready");
  revalidatePath("/library");
  return { ok: true };
}

/** "Upload to my channels": send this video to the channels of its language, now. */
export async function uploadVideo(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const variantId = String(formData.get("variantId"));
  try {
    const r = await api<{ message: string }>(`/variants/${variantId}/upload-now`, { method: "POST", body: "{}" });
    revalidatePath("/ready");
    revalidatePath("/calendar");
    return { ok: true, message: r.message };
  } catch (e) {
    return { message: problemText(e) };
  }
}

/** "Upload all": every waiting video, each to the channels of its language. */
export async function uploadAll(_prev: ActionResult): Promise<ActionResult> {
  try {
    const r = await api<{ message: string }>("/ready/upload-all", { method: "POST", body: "{}" });
    revalidatePath("/ready");
    revalidatePath("/calendar");
    return { ok: true, message: r.message };
  } catch (e) {
    return { message: problemText(e) };
  }
}
