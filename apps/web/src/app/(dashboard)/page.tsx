import { api, type CostSummary, type Story } from "@/lib/api";
import { ApiError, Card, PageHeader, StatusBadge } from "@/components/ui";

// Overview: what is happening right now.
export default async function OverviewPage() {
  let stories: Story[] = [];
  let costs: CostSummary;
  try {
    [stories, costs] = await Promise.all([api<Story[]>("/stories"), api<CostSummary>("/costs/summary")]);
  } catch (e) {
    return (<><PageHeader title="Overview" /><ApiError error={e} /></>);
  }

  const daily = costs.budgets.find((b) => b.period === "DAILY")?.capUsd;
  const count = (s: string) => stories.filter((x) => x.status === s).length;

  return (
    <>
      <PageHeader title="Overview" subtitle="Your bilingual video pipeline today" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Generating" value={count("GENERATING")} />
        <Stat label="Waiting for approval" value={count("READY")} />
        <Stat label="Published" value={count("PUBLISHED")} />
        <Stat label="Spend today" value={`$${costs.todayUsd.toFixed(2)}${daily ? ` / $${daily}` : ""}`}
          note={costs.paused ? "Automation paused" : undefined} />
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Recent stories</h2>
      <Card className="divide-y divide-zinc-100 p-0">
        {stories.length === 0 && <p className="p-5 text-sm text-zinc-500">No stories yet. Add an idea in Ideas & Chat.</p>}
        {stories.slice(0, 8).map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span className="text-sm font-medium">{s.topic.title}</span>
            <span className="flex gap-2">
              {s.variants.map((v) => (
                <span key={v.id} className="flex items-center gap-1 text-xs text-zinc-500">
                  {v.language.toUpperCase()} <StatusBadge status={v.status} />
                </span>
              ))}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {note && <p className="mt-1 text-xs font-medium text-red-600">{note}</p>}
    </Card>
  );
}
