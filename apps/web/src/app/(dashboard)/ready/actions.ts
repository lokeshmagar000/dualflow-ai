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
