"use client";
/**
 * The two buttons of the "Automatic videos" card: the Auto mode switch and "Generate now".
 * useActionState shows "Saving…" / "Starting…" while waiting, then the server's answer.
 */
import { useActionState } from "react";
import { generateNow, setAutoMode, type AutoState } from "@/app/(dashboard)/ideas/auto-actions";
import { IconBolt } from "./icons";

export function AutoSwitch({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<AutoState, FormData>(setAutoMode, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      {/* Pressing the switch sends the OPPOSITE of the current value. */}
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        disabled={pending}
        role="switch"
        aria-checked={enabled}
        className="flex min-h-10 items-center gap-3 text-left disabled:opacity-60"
      >
        {/* Fluent switch: 40 x 20 track with a round knob. */}
        <span className={`relative inline-flex h-5 w-10 shrink-0 rounded-full border transition-colors ${enabled ? "border-transparent bg-brand" : "border-fg3 bg-transparent"}`}>
          <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all ${enabled ? "left-[22px] bg-white" : "left-[3px] bg-fg3"}`} />
        </span>
        <span className="font-semibold">{pending ? "Saving…" : enabled ? "Auto mode is on" : "Auto mode is off"}</span>
      </button>
      {state.message && <span role="status" className={`text-xs ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span>}
    </form>
  );
}

export function GenerateNowButton({ available, pipelineUrl, missing }: { available: boolean; pipelineUrl?: string; missing?: string[] }) {
  const [state, action, pending] = useActionState<AutoState>(generateNow, {});
  if (!available) {
    // The dashboard has no GitHub key yet, so it cannot start the run by itself.
    // The button still works: it opens the Pipeline page on GitHub, where one more click starts it.
    const url = pipelineUrl ?? "https://github.com/lokeshmagar000/dualflow-ai/actions/workflows/pipeline.yml";
    const what = missing && missing.length > 0 ? missing : ["GITHUB_DISPATCH_TOKEN"];
    return (
      <div className="text-fg2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          <IconBolt className="h-4 w-4" /> Generate now (on GitHub)
        </a>
        <p className="mt-2 text-xs text-fg3">
          On GitHub press <b>Run workflow</b>, tick <b>Make one automatic video now</b>, and press the green <b>Run workflow</b>.
          To make this button start it by itself, add {what.map((m, i) => <span key={m}>{i > 0 && " and "}<code>{m}</code></span>)} on Vercel
          (steps: <code>docs/generate-now.md</code>).
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <button disabled={pending} className="btn btn-primary">
        <IconBolt className="h-4 w-4" /> {pending ? "Starting…" : "Generate now"}
      </button>
      {state.message && <span role="status" className={`max-w-sm text-xs ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span>}
    </form>
  );
}
