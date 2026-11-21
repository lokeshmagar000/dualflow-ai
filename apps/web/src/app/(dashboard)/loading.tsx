/**
 * Shown INSTANTLY when you click a page in the menu, while the server is still
 * getting the data. Before, the screen stayed frozen until everything was ready,
 * so the dashboard felt slower than it was.
 * (Next.js shows a file named loading.tsx automatically.)
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-7 w-56 rounded-lg bg-zinc-200" />
      <div className="mb-6 h-4 w-80 max-w-full rounded bg-zinc-100" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-white ring-1 ring-zinc-200" />
        ))}
      </div>
      <p className="mt-4 text-sm text-zinc-500">Loading… (after a long break the free server needs up to a minute to wake up)</p>
    </div>
  );
}
