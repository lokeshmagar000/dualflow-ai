/** Small reusable UI pieces. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 ${className}`}>{children}</div>;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  GENERATING: "bg-amber-100 text-amber-800",
  READY: "bg-sky-100 text-sky-800",
  APPROVED: "bg-indigo-100 text-indigo-800",
  SCHEDULED: "bg-violet-100 text-violet-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-zinc-100"}`}>
      {status.toLowerCase()}
    </span>
  );
}

/** Placeholder for pages built in later phases. */
export function ComingSoon({ title, phase, items }: { title: string; phase: number; items: string[] }) {
  return (
    <>
      <PageHeader title={title} subtitle={`Built in Phase ${phase}`} />
      <Card>
        <p className="mb-3 text-sm text-zinc-600">This page will include:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </Card>
    </>
  );
}

/** Shown when the API cannot be reached. */
export function ApiError({ error }: { error: unknown }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <p className="font-medium text-red-700">Could not reach the API.</p>
      <p className="mt-1 text-sm text-red-600">{String(error instanceof Error ? error.message : error)}</p>
    </Card>
  );
}
