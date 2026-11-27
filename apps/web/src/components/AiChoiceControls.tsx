"use client";
/**
 * "AI for writing" card (Settings page): two big choices, Claude or Gemini,
 * plus which Claude model. useActionState shows "Saving…" and then the answer.
 */
import { useActionState, useState } from "react";
import { saveAiSettings } from "@/app/(dashboard)/settings/ai-actions";
import type { ActionResult, AiSettings } from "@/lib/api";

const OPTIONS = [
  {
    id: "claude",
    title: "Claude (Anthropic)",
    text: "Paid from your Claude Console credit. Best writing, no daily limit. If Claude fails, Gemini does that step instead.",
  },
  {
    id: "gemini",
    title: "Gemini (Google, free)",
    text: "Free, but only about 20 writing requests a day. When they run out, videos wait until the next day.",
  },
] as const;

export function AiChoiceForm({ settings }: { settings: AiSettings }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveAiSettings, {});
  const [provider, setProvider] = useState<string>(settings.provider);
  return (
    <form action={action} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-fg3">Who writes topics, research and scripts (and checks the pictures)</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {OPTIONS.map((o) => (
            <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-subtle2 ${provider === o.id ? "border-brand" : "border-stroke"}`}>
              <input type="radio" name="provider" value={o.id} checked={provider === o.id} onChange={() => setProvider(o.id)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
              <span className="min-w-0">
                <span className="font-semibold">{o.title}</span>
                <span className="mt-0.5 block text-xs text-fg2">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {provider === "claude" && (
        <label className="flex flex-col gap-1">
          <span className="text-fg3">Claude model</span>
          <select name="claudeModel" defaultValue={settings.claudeModel} className="field w-auto max-w-full">
            {settings.claudeModels.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <span className="text-xs text-fg2">
            {settings.claudeModels.map((m) => (
              <span key={m.id} className="block"><b>{m.label.split(" (")[0]}:</b> {m.about}</span>
            ))}
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save"}</button>
        {state.message && <span role="status" className={`text-xs ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
