"use server";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

/** The "Mark as uploaded" / "Undo" button. */
export async function setUploaded(formData: FormData) {
  const variantId = String(formData.get("variantId"));
  const uploaded = formData.get("uploaded") === "true";
  await api(`/variants/${variantId}/uploaded`, { method: "POST", body: JSON.stringify({ uploaded }) });
  revalidatePath("/ready");
}
