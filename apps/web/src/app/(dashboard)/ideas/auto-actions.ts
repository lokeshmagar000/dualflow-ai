"use server";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

export type AutoState = { message?: string; ok?: boolean };

/** Read the error the API sent back ({"message": "..."}) as a plain sentence. */
function cleanError(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  const json = text.match(/\{.*\}$/s)?.[0];
  try {
    const msg = json ? (JSON.parse(json) as { message?: string }).message : undefined;
    if (msg) return msg;
  } catch {
    /* not JSON */
  }
  return "Could not reach the server. Wait a minute and try again.";
}

/** The Auto mode switch. */
export async function setAutoMode(_prev: AutoState, formData: FormData): Promise<AutoState> {
  const enabled = formData.get("enabled") === "true";
  try {
    await api("/auto", { method: "POST", body: JSON.stringify({ enabled }) });
  } catch (e) {
    return { message: cleanError(e) };
  }
  revalidatePath("/ideas");
  return { ok: true, message: enabled ? "Auto mode is ON." : "Auto mode is OFF. No new videos at 2 AM / 4 AM." };
}

/** The "Generate now" button. */
export async function generateNow(_prev: AutoState): Promise<AutoState> {
  try {
    const r = await api<{ message: string }>("/auto/generate-now", { method: "POST", body: "{}" });
    return { ok: true, message: r.message };
  } catch (e) {
    return { message: cleanError(e) };
  }
}
