"use client";
/**
 * "Delete" button for one story (Nepali + English together).
 * It asks "Are you sure?" first, because a deleted video cannot come back.
 * useActionState keeps the server's answer: "pending" while deleting, and an
 * error message if it did not work (shown in red under the button).
 */
import { useActionState } from "react";
import { IconTrash } from "./icons";
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
      <button disabled={pending} className="btn btn-sm btn-danger">
        <IconTrash className="h-4 w-4" /> {pending ? "Deleting…" : "Delete"}
      </button>
      {state.error && <span role="alert" className="mt-1 max-w-xs text-right text-xs text-bad">{state.error}</span>}
    </form>
  );
}
