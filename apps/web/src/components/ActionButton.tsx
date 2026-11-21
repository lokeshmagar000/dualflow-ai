"use client";
/**
 * One button that runs a server action (Approve, Try again, Mark as uploaded, ...).
 * - While it works, the button says e.g. "Approving…" and cannot be pressed twice.
 * - If something goes wrong, a short red note shows under the button.
 *   (Before, a failed button opened the "Something went wrong" page.)
 */
import { useActionState } from "react";
import type { ActionResult } from "@/lib/api";

type Props = {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  fields?: Record<string, string>; // hidden values sent with the button, e.g. { storyId: "..." }
  label: React.ReactNode;
  pendingLabel?: string;
  className?: string; // button look, e.g. "btn btn-primary"
  showOk?: boolean; // also show the green "done" note
  align?: "start" | "end";
  children?: React.ReactNode; // extra form controls placed before the button (e.g. a select)
};

export function ActionButton({ action, fields = {}, label, pendingLabel = "Working…", className = "btn", showOk = false, align = "start", children }: Props) {
  const [state, run, pending] = useActionState<ActionResult, FormData>(action, {});
  return (
    <form action={run} className={`flex flex-col gap-1 ${align === "end" ? "items-end text-right" : "items-start"}`}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button disabled={pending} aria-busy={pending} className={className}>
          {pending ? pendingLabel : label}
        </button>
      </div>
      {state.message && (state.ok ? showOk : true) && (
        <span role="status" className={`max-w-xs text-xs ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span>
      )}
    </form>
  );
}
