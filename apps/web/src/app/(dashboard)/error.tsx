"use client";
/**
 * Safety net: if a page hits a problem we did not expect, this friendly box
 * shows INSIDE the dashboard (the menu stays), instead of the white
 * "Application error: a server-side exception has occurred" screen.
 * (Next.js shows a file named error.tsx automatically when something breaks.)
 */
import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert" className="card border-l-4 border-l-bad p-5 sm:p-6">
      <h1 className="text-lg font-semibold">This page had a problem</h1>
      <p className="mt-2 text-fg2">Usually one of these fixes it:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-fg2">
        <li>Press <b>Try again</b>. If the server was asleep or just updated, the second try usually works.</li>
        <li>Still broken? Press <b>Reload the page</b>. A page left open from before an update can cause this.</li>
        <li>Still broken after 5 minutes? Open <b>Settings</b> in the menu: it checks the connection and says what to fix.</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={reset} className="btn btn-primary">Try again</button>
        <button onClick={() => window.location.reload()} className="btn">Reload the page</button>
      </div>
      {error.digest && <p className="mt-4 text-xs text-fg4">Error code for the server logs: {error.digest}</p>}
    </div>
  );
}
