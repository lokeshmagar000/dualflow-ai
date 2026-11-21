"use client";
/** The "Add your own idea" form. It empties itself after saving and shows a short note. */
import { useActionState, useEffect, useRef } from "react";
import { addTopic } from "@/app/(dashboard)/ideas/actions";
import type { ActionResult } from "@/lib/api";

export function IdeaForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addTopic, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset(); // saved: clear the boxes for the next idea
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block font-semibold">Idea</span>
        <input key={`t${state.values?.title ?? ""}`} defaultValue={state.values?.title ?? ""} name="title" required minLength={3} maxLength={200} placeholder="e.g. Why Nepal's tea is famous" className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">Notes <span className="font-normal text-fg3">(optional)</span></span>
        <textarea key={`n${state.values?.notes ?? ""}`} defaultValue={state.values?.notes ?? ""} name="notes" rows={3} maxLength={2000} placeholder="Facts you want in it, the angle, places to mention…" className="field" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Add idea"}</button>
        {state.message && <span role="status" className={`text-xs ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
