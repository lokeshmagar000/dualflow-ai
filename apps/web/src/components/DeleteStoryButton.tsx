"use client";
/**
 * "Delete" button for one story (Nepali + English together).
 * It asks "Are you sure?" first, because a deleted video cannot come back.
 * useActionState keeps the server's answer: "pending" while deleting, and an
 * error message if it did not work (shown in red under the button).
 */
import { useActionState } from "react";
import { deleteStory, type DeleteState } from "@/app/(dashboard)/content/actions";

export function DeleteStoryButton({ storyId, title, goTo }: { storyId: string; title: string; goTo?: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteStory, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Delete "${title}"?\n\nBoth videos (Nepali and English), their files and their text are removed for good. This cannot be undone.`,
        );
        if (!ok) e.preventDefault(); // "Cancel" = nothing happens
      }}
      className="flex flex-col items-end"
    >
      <input type="hidden" name="storyId" value={storyId} />
      {goTo && <input type="hidden" name="goTo" value={goTo} />}
      <button
        disabled={pending}
        className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "🗑 Delete"}
      </button>
      {state.error && <span className="mt-1 max-w-xs text-right text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
