"use server";
/** Buttons on the Channels page. Each one asks the API and refreshes the page. */
import { revalidatePath } from "next/cache";
import { api, problemText, type ActionResult } from "@/lib/api";
import { isConnectPlatform } from "@/lib/connect";

const NICE: Record<string, string> = { youtube: "Google", meta: "Meta", tiktok: "TikTok", instagram: "Instagram" };

/** Step 1 of each box: save your app's id and secret (the server locks them). */
export async function saveAppKeys(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const platform = String(form.get("platform") ?? "");
  if (!isConnectPlatform(platform)) return { message: "Unknown platform." };
  const id = String(form.get("id") ?? "").trim();
  const secret = String(form.get("secret") ?? "").trim();
  const configId = String(form.get("configId") ?? "").trim();
  if (id.length < 3) return { message: "Paste the id first.", values: { id } };
  try {
    await api(`/connect/${platform}/keys`, { method: "POST", body: JSON.stringify({ id, secret: secret || undefined, configId: configId || undefined }) });
  } catch (e) {
    return { message: problemText(e), values: { id } };
  }
  revalidatePath("/channels");
  return { ok: true, message: `Saved your ${NICE[platform]} app keys. Now press Connect.` };
}

export async function disconnect(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const platform = String(form.get("platform") ?? "");
  if (!isConnectPlatform(platform)) return { message: "Unknown platform." };
  const language = String(form.get("language") ?? "");
  try {
    await api(`/connect/${platform}/disconnect`, { method: "POST", body: JSON.stringify(language ? { language } : {}) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/channels");
  return { ok: true, message: "Removed." };
}

export async function swapMetaLanguages(_prev: ActionResult): Promise<ActionResult> {
  try {
    await api("/connect/meta/swap", { method: "POST", body: "{}" });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/channels");
  return { ok: true, message: "Swapped." };
}

const SWITCH_TEXT: Record<string, string> = {
  off: "Auto upload is OFF. Videos wait on Ready to upload; press Upload there to send one.",
  practice: "PRACTICE mode: the next runs only write what they WOULD upload. Nothing is posted.",
  approval: "ASK ME FIRST: each new video waits for your Approve button, then uploads at the next upload time.",
  auto: "FULLY AUTOMATIC: every new video uploads by itself at the next upload time.",
};

export async function setUploadSwitch(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const mode = String(form.get("mode") ?? "");
  try {
    await api("/connect/switch", { method: "POST", body: JSON.stringify({ mode }) });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/channels");
  return { ok: true, message: SWITCH_TEXT[mode] ?? "Saved." };
}

export type TestResult = ActionResult & { results?: { platform: string; language: string; ok: boolean; message: string }[] };

export async function testChannels(_prev: TestResult): Promise<TestResult> {
  try {
    const r = await api<{ results: NonNullable<TestResult["results"]>; problems: string[] }>("/connect/test", { method: "POST", body: "{}" });
    if (r.results.length === 0) return { message: r.problems[0] ?? "Nothing is connected yet. Press a Connect button first." };
    const bad = r.results.filter((x) => !x.ok).length;
    return { ok: bad === 0, message: bad === 0 ? "Every connected channel works." : `${bad} channel(s) have a problem (see below).`, results: r.results };
  } catch (e) {
    return { message: problemText(e) };
  }
}

/* ---------- Upload-Post: one service for every platform ---------- */

export async function saveUploadPost(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const apiKey = String(form.get("apiKey") ?? "").trim();
  const userNe = String(form.get("userNe") ?? "").trim();
  const userEn = String(form.get("userEn") ?? "").trim();
  try {
    const r = await api<{ message: string }>("/connect/uploadpost/save", {
      method: "POST",
      body: JSON.stringify({ apiKey: apiKey || undefined, userNe: userNe || undefined, userEn: userEn || undefined }),
    });
    revalidatePath("/channels");
    return { ok: true, message: r.message };
  } catch (e) {
    return { message: problemText(e), values: { userNe, userEn } };
  }
}

export async function refreshUploadPost(_prev: ActionResult): Promise<ActionResult> {
  try {
    const r = await api<{ message: string }>("/connect/uploadpost/refresh", { method: "POST", body: "{}" });
    revalidatePath("/channels");
    return { ok: true, message: r.message };
  } catch (e) {
    return { message: problemText(e) };
  }
}

export async function removeUploadPost(_prev: ActionResult): Promise<ActionResult> {
  try {
    await api("/connect/uploadpost/remove", { method: "POST", body: "{}" });
  } catch (e) {
    return { message: problemText(e) };
  }
  revalidatePath("/channels");
  return { ok: true, message: "Removed. The direct Connect buttons below are used again." };
}
