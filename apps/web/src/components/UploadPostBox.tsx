"use client";
/**
 * The Upload-Post box on the Channels page: ONE service that posts to YouTube, Instagram,
 * TikTok and Facebook. No developer apps: you connect your accounts on Upload-Post's page.
 *
 *  Step A: paste the API key (and, if you like, your own profile names) and press Save.
 *          The server checks the key and makes the two profiles (English + Nepali) for you.
 *  Step B: press "Connect accounts" for each language, sign in on Upload-Post's page.
 *  Step C: back here, the page looks again what is connected (or press Refresh).
 */
import { useActionState } from "react";
import { refreshUploadPost, removeUploadPost, saveUploadPost } from "@/app/(dashboard)/channels/actions";
import type { ActionResult } from "@/lib/api";
import { LangBadge } from "./ui";

export interface UploadPostInfo {
  saved: boolean;
  keyHint: string | null;
  users: { ne: string; en: string };
  platforms: { ne: string[]; en: string[] };
  accounts: { ne: Record<string, string>; en: Record<string, string> };
  checkedAt: string | null;
  problem: string | null;
}

const ALL = ["youtube", "instagram", "tiktok", "facebook"] as const;
const NICE: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

export function UploadPostBox({ info, refreshed }: { info: UploadPostInfo; refreshed?: ActionResult | null }) {
  const [saveState, save, saving] = useActionState<ActionResult, FormData>(saveUploadPost, {});
  const [refreshState, refresh, refreshing] = useActionState<ActionResult>(refreshUploadPost, refreshed ?? {});
  const [removeState, remove, removing] = useActionState<ActionResult>(removeUploadPost, {});

  return (
    <div className="space-y-4">
      <details open={!info.saved} className="group">
        <summary className="cursor-pointer list-none font-semibold">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>
          Step A: your Upload-Post API key{" "}
          {info.saved ? <span className="badge ml-1 bg-ok-tint text-ok">saved {info.keyHint}</span> : <span className="badge ml-1 bg-subtle2 text-fg2">not yet</span>}
        </summary>
        <form action={save} className="mt-3 space-y-3">
          <p className="text-sm text-fg2">
            On <b>app.upload-post.com</b> → <b>API Keys</b> → create a key and copy it.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">API key</span>
            <input name="apiKey" type="password" required={!info.saved} maxLength={2000} autoComplete="off" spellCheck={false}
              placeholder={info.saved ? "Saved (hidden). Leave empty to keep it." : "Paste it here"} className="field font-mono text-sm" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Nepali profile name</span>
              <input name="userNe" maxLength={60} autoComplete="off" spellCheck={false} defaultValue={saveState.values?.userNe ?? info.users.ne}
                placeholder="namaste-facts-ne" className="field font-mono text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">English profile name</span>
              <input name="userEn" maxLength={60} autoComplete="off" spellCheck={false} defaultValue={saveState.values?.userEn ?? info.users.en}
                placeholder="namaste-facts-en" className="field font-mono text-sm" />
            </label>
          </div>
          <p className="text-xs text-fg3">Leave the names empty and we make <code>namaste-facts-ne</code> and <code>namaste-facts-en</code> for you.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={saving} className="btn btn-primary">{saving ? "Checking…" : info.saved ? "Save again" : "Save and check"}</button>
            {saveState.message && <span role="status" className={`text-sm ${saveState.ok ? "text-ok" : "text-bad"}`}>{saveState.message}</span>}
          </div>
          <p className="text-xs text-fg3">The key is locked (encrypted) on the server and never shown again.</p>
          {info.problem && <p className="text-xs text-bad">{info.problem}</p>}
        </form>
      </details>

      <div>
        <p className="mb-2 font-semibold">Step B: connect your accounts</p>
        <ul className="space-y-2">
          {(["ne", "en"] as const).map((l) => (
            <li key={l} className="rounded-md border border-stroke p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <LangBadge lang={l} />
                  {info.users[l] && <span className="ml-2 text-xs text-fg3">profile <code>{info.users[l]}</code></span>}
                </div>
                <a href={info.saved ? `/connect/uploadpost/start?lang=${l}` : undefined} aria-disabled={!info.saved}
                  className={`btn btn-sm ${info.platforms[l].length ? "" : "btn-primary"}`}>
                  {info.platforms[l].length ? "Add or change accounts" : "Connect accounts"}
                </a>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {ALL.map((p) => {
                  const name = info.accounts[l]?.[p];
                  const on = info.platforms[l].includes(p);
                  return (
                    <li key={p} className={`badge ${on ? "bg-ok-tint text-ok" : "bg-subtle2 text-fg3"}`}>
                      {on ? "✓" : "–"} {NICE[p]}{on && name && name !== "connected" ? `: ${name}` : ""}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {!info.saved && <p className="mt-2 text-xs text-fg3">Save the API key first (step A).</p>}
      </div>

      {info.saved && (
        <div className="flex flex-wrap items-start gap-3">
          <form action={refresh} className="flex flex-col gap-1">
            <button disabled={refreshing} className="btn btn-sm">{refreshing ? "Looking…" : "Refresh"}</button>
            {refreshState.message && <span role="status" className={`max-w-md text-xs ${refreshState.ok ? "text-ok" : "text-bad"}`}>{refreshState.message}</span>}
          </form>
          <form action={remove} className="flex flex-col gap-1">
            <button disabled={removing} className="btn btn-sm btn-subtle">{removing ? "Removing…" : "Stop using Upload-Post"}</button>
            {removeState.message && <span role="status" className={`max-w-md text-xs ${removeState.ok ? "text-ok" : "text-bad"}`}>{removeState.message}</span>}
          </form>
        </div>
      )}
      {info.checkedAt && <p className="text-xs text-fg3">Last looked: {new Date(info.checkedAt).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", dateStyle: "medium", timeStyle: "short" })} (Nepal time)</p>}
    </div>
  );
}
