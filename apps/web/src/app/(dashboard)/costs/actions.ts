"use server";
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";

/** "Run now": ask GitHub Actions to make the waiting videos right away. */
export async function runNow(_prev: ActionResult): Promise<ActionResult> {
  try {
    const r = await api<{ message: string }>("/pipeline/run-now", { method: "POST", body: "{}" });
    revalidatePath("/costs");
    return { ok: true, message: r.message };
  } catch (e) {
    // The API answers 409 with a reason when Run now is not set up.
    return { message: problemText(e) };
  }
}

/** The kill switch: pause or resume all automation. */
export async function setPaused(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const paused = formData.get("paused") === "true";
  try {
    await api("/automation/pause", { method: "POST", body: JSON.stringify({ paused }) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/costs");
  revalidatePath("/ideas");
  revalidatePath("/");
  return { ok: true, message: paused ? "All automation is paused." : "Automation is running again." };
}
