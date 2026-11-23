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

export function GenerateNowButton({ available }: { available: boolean }) {
  const [state, action, pending] = useActionState<AutoState>(generateNow, {});
  if (!available) {
    // Without the GitHub token on Render the dashboard cannot start a run, so show the manual way.
    return (
      <div className="text-fg2">
        <button className="btn" disabled aria-disabled="true"><IconBolt className="h-4 w-4" /> Generate now</button>
        <p className="mt-2 text-xs text-fg3">
          Needs the GitHub key on your dashboard host, Render or Vercel (<code>GITHUB_REPO</code> + <code>GITHUB_DISPATCH_TOKEN</code>). Until then: GitHub,
          then <b>Actions</b>, <b>Pipeline</b>, <b>Run workflow</b>, tick <b>Make one automatic video now</b>, and press <b>Run workflow</b>.
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
