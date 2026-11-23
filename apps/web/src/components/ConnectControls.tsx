"use client";
/**
 * The interactive parts of the Channels page:
 *  - UploadSwitch: Off / Practice / Ask me first / Fully automatic
 *  - AppKeysForm:  paste your app's id + secret once (step 1 of each box)
 *  - TestButton:   "Test now" asks every connected channel who it is (uploads nothing)
 */
import { useActionState } from "react";
import { saveAppKeys, setUploadSwitch, testChannels, type TestResult } from "@/app/(dashboard)/channels/actions";
import type { ActionResult } from "@/lib/api";

const SWITCHES = [
  { mode: "off", name: "Off", text: "Nothing uploads by itself. Upload buttons still work." },
  { mode: "practice", name: "Practice", text: "Shows what would upload. Posts nothing." },
  { mode: "approval", name: "Ask me first", text: "Each video waits for your Approve." },
  { mode: "auto", name: "Fully automatic", text: "Every new video uploads by itself." },
] as const;

export function UploadSwitch({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(setUploadSwitch, {});
  return (
    <form action={action}>
      <div role="radiogroup" aria-label="Auto upload" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SWITCHES.map((s) => {
          const on = current === s.mode;
          return (
            <button
              key={s.mode}
              name="mode"
              value={s.mode}
              role="radio"
              aria-checked={on}
              disabled={pending}
              className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                on ? "border-brand bg-brand-tint" : "border-stroke hover:bg-subtle"
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <span aria-hidden className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 ${on ? "border-brand bg-brand" : "border-fg3"}`} />
                {s.name}
              </span>
              <span className="mt-1 block text-xs text-fg3">{s.text}</span>
            </button>
          );
        })}
      </div>
      {pending && <p className="mt-2 text-xs text-fg3">Saving…</p>}
      {state.message && <p role="status" className={`mt-2 text-sm ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</p>}
    </form>
  );
}

export function AppKeysForm({
  platform,
  saved,
  idLabel,
  secretLabel,
  withConfigId = false,
  configId,
}: {
  platform: string;
  saved: boolean;
  idLabel: string;
  secretLabel: string;
  withConfigId?: boolean;
  configId?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveAppKeys, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="platform" value={platform} />
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">{idLabel}</span>
        <input name="id" required minLength={3} maxLength={300} autoComplete="off" spellCheck={false} defaultValue={state.values?.id ?? ""}
          placeholder={saved ? "Saved. Paste again only to change it." : "Paste it here"} className="field font-mono text-sm" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">{secretLabel}</span>
        <input name="secret" type="password" required={!saved} maxLength={300} autoComplete="off" spellCheck={false}
          placeholder={saved ? "Saved (hidden). Leave empty to keep it." : "Paste it here"} className="field font-mono text-sm" />
      </label>
      {withConfigId && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Configuration ID <span className="font-normal text-fg3">(only if your app has &quot;Facebook Login for Business&quot;)</span></span>
          <input name="configId" maxLength={100} autoComplete="off" spellCheck={false} defaultValue={configId ?? ""} placeholder="Leave empty if you don't have one" className="field font-mono text-sm" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-primary">{pending ? "Saving…" : saved ? "Save new keys" : "Save keys"}</button>
        {state.message && <span role="status" className={`text-xs ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span>}
      </div>
      <p className="text-xs text-fg3">The secret is locked (encrypted) on the server and never shown again, not even to you.</p>
    </form>
  );
}

const PLATFORM: Record<string, string> = { YOUTUBE: "YouTube", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok" };

export function TestButton({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<TestResult>(testChannels, {});
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || disabled} className="btn">{pending ? "Testing…" : "Test now"}</button>
        {state.message && <span role="status" className={`text-sm ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span>}
      </div>
      {state.results && state.results.length > 0 && (
        <ul className="divide-y divide-stroke rounded-md border border-stroke">
          {state.results.map((r) => (
            <li key={`${r.platform}-${r.language}`} className="flex gap-2 p-2.5 text-sm">
              <span aria-hidden className={r.ok ? "text-ok" : "text-bad"}>{r.ok ? "✓" : "✕"}</span>
              <span className="min-w-0">
                <b>{PLATFORM[r.platform] ?? r.platform} {r.language === "ne" ? "नेपाली" : "English"}:</b>{" "}
                <span className="break-words text-fg2">{r.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
