"use server";
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";

/** Save the Nepal News & Politics settings (switch, ticked series, videos per day). */
export async function savePolitics(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const body: Record<string, unknown> = {};
  if (formData.has("enabled")) body.enabled = formData.get("enabled") === "true";
  if (formData.has("seriesForm")) body.series = formData.getAll("series").map(String);
  if (formData.has("perDay")) body.perDay = Number(formData.get("perDay"));
  try {
    await api("/politics", { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/ideas");
  return { ok: true, message: "Saved." };
}

/** "Make a news / politics video now". */
export async function generatePoliticsNow(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const r = await api<{ message: string }>("/politics/generate-now", { method: "POST", body: JSON.stringify({ series: String(formData.get("series") || "auto") }) });
    return { ok: true, message: r.message };
  } catch (e) {
    return { message: problemText(e) };
  }
}
