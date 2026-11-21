"use client";
/**
 * Last safety net, for problems outside the dashboard pages (for example the main layout).
 * It replaces the whole page, so it brings its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, background: "#fafafa", color: "#18181b" }}>
        <h1 style={{ fontSize: 20 }}>DualFlow had a problem loading</h1>
        <p>Press Try again. If the free server was asleep or just updated, the second try usually works.</p>
        <button onClick={reset} style={{ padding: "6px 12px", marginRight: 8 }}>Try again</button>
        <button onClick={() => window.location.reload()} style={{ padding: "6px 12px" }}>Reload the page</button>
        {error.digest && <p style={{ fontSize: 12, color: "#a1a1aa" }}>Error code for the server logs: {error.digest}</p>}
      </body>
    </html>
  );
}
