"use client";
/**
 * Buttons of the "Nepal News & Politics" card on the Ideas page:
 * the on/off switch, the series checkboxes + videos per day, and "Make one now".
 * useActionState shows "Saving…" while waiting, then the server's answer.
 */
import { useActionState } from "react";
import { generatePoliticsNow, savePolitics } from "@/app/(dashboard)/ideas/politics-actions";
import type { ActionResult, PoliticsStatus } from "@/lib/api";
import { IconBolt } from "./icons";

function Status({ state }: { state: ActionResult }) {
  return state.message ? <span role="status" className={`text-xs ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span> : null;
}

export function PoliticsSwitch({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(savePolitics, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button disabled={pending} role="switch" aria-checked={enabled} className="flex min-h-10 items-center gap-3 text-left disabled:opacity-60">
        <span className={`relative inline-flex h-5 w-10 shrink-0 rounded-full border transition-colors ${enabled ? "border-transparent bg-brand" : "border-fg3 bg-transparent"}`}>
          <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all ${enabled ? "left-[22px] bg-white" : "left-[3px] bg-fg3"}`} />
        </span>
        <span className="font-semibold">{pending ? "Saving…" : enabled ? "Series is on" : "Series is off"}</span>
      </button>
      <Status state={state} />
    </form>
  );
}

/** Tick the series to use, and how many of the day's automatic videos are news / politics. */
export function PoliticsSeriesForm({ status }: { status: PoliticsStatus }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(savePolitics, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="seriesForm" value="1" />
      <fieldset>
        <legend className="mb-2 text-fg3">Series to use (they take turns)</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {status.allSeries.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-stroke p-3 hover:bg-subtle2">
              <input type="checkbox" name="series" value={s.id} defaultChecked={status.series.includes(s.id)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
              <span className="min-w-0">
                <span className="font-semibold">{s.nameEn}</span> <span className="text-fg3">· {s.nameNe}</span>
                {s.needsNews && <span className="ml-1.5 rounded bg-[#C8102E] px-1.5 py-0.5 text-[11px] font-semibold text-white">TRENDING</span>}
                <span className="mt-0.5 block text-xs text-fg2">{s.about}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-fg3">News / politics videos each night</span>
          <select name="perDay" defaultValue={String(status.perDay)} className="field w-auto">
            <option value="1">1 of the 2 (the 1:35 AM video)</option>
            <option value="2">Both videos</option>
            <option value="0">None (only when I press the button)</option>
          </select>
        </label>
        <button disabled={pending} className="btn">{pending ? "Saving…" : "Save"}</button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function PoliticsGenerateNow({ status }: { status: PoliticsStatus }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(generatePoliticsNow, {});
  if (!status.generateNowAvailable) {
    return (
      <p className="text-xs text-fg3">
        Needs the GitHub key on your dashboard host (<code>GITHUB_REPO</code> + <code>GITHUB_DISPATCH_TOKEN</code>). Until then: GitHub, <b>Actions</b>, <b>Pipeline</b>,
        <b> Run workflow</b>, type a series name (for example <code>news-explained</code>) in <b>Nepal News &amp; Politics video now</b>.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-fg3">Series</span>
        <select name="series" defaultValue="news-explained" className="field w-auto">
          <option value="auto">Next in turn</option>
          {status.allSeries.map((s) => <option key={s.id} value={s.id}>{s.nameEn}</option>)}
        </select>
      </label>
      <button disabled={pending} className="btn btn-primary">
        <IconBolt className="h-4 w-4" /> {pending ? "Starting…" : "Make one now"}
      </button>
      <div className="basis-full"><Status state={state} /></div>
    </form>
  );
}
