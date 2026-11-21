"use client";
/**
 * The two buttons of the "Automatic videos" card: the Auto mode switch and "Generate now".
 * useActionState shows "Saving…" / "Starting…" while waiting, then the server's answer.
 */
import { useActionState } from "react";
import { generateNow, setAutoMode, type AutoState } from "@/app/(dashboard)/ideas/auto-actions";

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
        className="flex items-center gap-3 text-left disabled:opacity-60"
      >
        <span className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-emerald-500" : "bg-zinc-300"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} />
        </span>
        <span className="font-semibold">{pending ? "Saving…" : enabled ? "Auto mode: ON" : "Auto mode: OFF"}</span>
      </button>
      {state.message && <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
    </form>
  );
}

export function GenerateNowButton({ available }: { available: boolean }) {
  const [state, action, pending] = useActionState<AutoState>(generateNow, {});
  if (!available) {
    // Without the GitHub token on Render the dashboard cannot start a run, so show the manual way.
    return (
      <p className="text-xs text-zinc-600">
        <b>Generate now</b> needs the GitHub key on Render (<code>GITHUB_REPO</code> + <code>GITHUB_DISPATCH_TOKEN</code>, see
        docs/put-dashboard-online.md). Until then: GitHub → <b>Actions</b> → <b>Pipeline</b> → <b>Run workflow</b> → tick
        <b> Make one automatic video now</b> → <b>Run workflow</b>.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-1">
      <button disabled={pending} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
        {pending ? "Starting…" : "⚡ Generate now"}
      </button>
      {state.message && <span className={`max-w-sm text-xs ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
    </form>
  );
}
