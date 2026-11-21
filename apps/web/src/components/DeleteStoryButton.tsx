"use client";
/**
 * "Delete" button for one story (Nepali + English together).
 * It asks "Are you sure?" first, because a deleted video cannot come back.
 * useFormStatus tells us while the server is still deleting, so we can show "Deleting…".
 */
import { useFormStatus } from "react-dom";
import { deleteStory } from "@/app/(dashboard)/content/actions";

export function DeleteStoryButton({ storyId, title, goTo }: { storyId: string; title: string; goTo?: string }) {
  return (
    <form
      action={deleteStory}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Delete "${title}"?\n\nBoth videos (Nepali and English), their files and their text are removed for good. This cannot be undone.`,
        );
        if (!ok) e.preventDefault(); // "Cancel" = nothing happens
      }}
    >
      <input type="hidden" name="storyId" value={storyId} />
      {goTo && <input type="hidden" name="goTo" value={goTo} />}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "🗑 Delete"}
    </button>
  );
}
