"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

/** "Run now": ask GitHub Actions to make the waiting videos right away. */
export async function runNow() {
  let message: string;
  try {
    message = (await api<{ message: string }>("/pipeline/run-now", { method: "POST", body: "{}" })).message;
  } catch (e) {
    // The API answers 409 with a reason when Run now is not set up.
    const text = e instanceof Error ? e.message : String(e);
    message = text.match(/"message":"([^"]+)"/)?.[1] ?? "Could not start the run.";
  }
  redirect(`/costs?msg=${encodeURIComponent(message)}`);
}

/** The kill switch: pause or resume all automation. */
export async function setPaused(formData: FormData) {
  const paused = formData.get("paused") === "true";
  await api("/automation/pause", { method: "POST", body: JSON.stringify({ paused }) });
  revalidatePath("/costs");
  revalidatePath("/");
}
