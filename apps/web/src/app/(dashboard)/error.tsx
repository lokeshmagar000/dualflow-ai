"use client";
/**
 * Safety net: if a page or a button hits a problem we did not expect, this friendly box
 * shows INSIDE the dashboard (the menu stays), instead of the white
 * "Application error: a server-side exception has occurred" screen.
 * (Next.js shows a file named error.tsx automatically when something breaks.)
 */
import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-red-200">
      <h1 className="text-lg font-bold text-red-700">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-zinc-700">Usually one of these fixes it:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
        <li>Press <b>Try again</b>. If the server was asleep or just updated, the second try usually works.</li>
        <li>Still broken? <b>Reload the page</b> (an old page open from before an update can cause this).</li>
        <li>Still broken after 5 minutes? On Render, check that <b>dualflow-api</b> and <b>dualflow-web</b> both say <b>Live</b>.</li>
      </ul>
      <div className="mt-4 flex gap-2">
        <button onClick={reset} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Try again</button>
        <button onClick={() => window.location.reload()} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">Reload the page</button>
      </div>
      {error.digest && <p className="mt-4 text-xs text-zinc-400">Error code for the server logs: {error.digest}</p>}
    </div>
  );
}
