import { api, type CostSummary, type PipelineStatus } from "@/lib/api";
import { ApiError, Card, PageHeader } from "@/components/ui";
import { runNow, setPaused } from "./actions";

// Costs & Automation: free limits, the job queue, "Run now" and the kill switch.
export default async function CostsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  let costs: CostSummary;
  let status: PipelineStatus;
  try {
    [costs, status] = await Promise.all([api<CostSummary>("/costs/summary"), api<PipelineStatus>("/pipeline/status")]);
  } catch (e) {
    return (<><PageHeader title="Costs & Automation" /><ApiError error={e} /></>);
  }
  const waiting = status.queue.readyNow + status.queue.later;

  return (
    <>
      <PageHeader title="Costs & Automation" subtitle="Free plan: $0 a month while you stay inside the free limits" />
      {msg && <Card className="mb-4 border-sky-200 bg-sky-50 text-sm text-sky-800">{msg}</Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Video making</h2>
          <p className="mt-1 text-sm text-zinc-500">
            GitHub Actions makes videos every 3 hours. Press Run now to start at once.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>Ready to make now: <b>{status.queue.readyNow}</b></li>
            <li>Running: <b>{status.queue.running}</b></li>
            <li>Waiting for later (retry or tomorrow&apos;s free limit): <b>{status.queue.later}</b></li>
            {status.queue.nextJobAt && waiting > 0 && (
              <li className="text-zinc-500">Next job can start: {new Date(status.queue.nextJobAt).toLocaleString()}</li>
            )}
          </ul>
          <form action={runNow} className="mt-4">
            <button
              disabled={!status.runNowAvailable}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Run now
            </button>
            {!status.runNowAvailable && (
              <p className="mt-2 text-xs text-zinc-500">Run now needs GITHUB_REPO and GITHUB_DISPATCH_TOKEN on the API (see README).</p>
            )}
          </form>
        </Card>

        <Card>
          <h2 className="font-semibold">Spend</h2>
          <p className="mt-3 text-3xl font-bold">${costs.monthUsd.toFixed(2)}</p>
          <p className="text-sm text-zinc-500">this month (today ${costs.todayUsd.toFixed(2)})</p>
          <form action={setPaused} className="mt-4">
            <input type="hidden" name="paused" value={String(!costs.paused)} />
            <button
              className={`rounded-lg px-4 py-2 text-sm font-medium ${costs.paused ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
            >
              {costs.paused ? "Resume automation" : "Pause all automation"}
            </button>
            {costs.paused && <p className="mt-2 text-xs font-medium text-red-600">Automation is paused.</p>}
          </form>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Free limits</h2>
      <Card className="space-y-4">
        {status.quotas.map((q) => (
          <QuotaBar key={q.name} name={q.name} used={q.used} limit={q.limit} />
        ))}
        <p className="text-xs text-zinc-500">
          Making stops by itself at the Gemini daily limit and at 90% of Azure&apos;s free characters, then continues when the limit resets.
        </p>
      </Card>
    </>
  );
}

function QuotaBar({ name, used, limit }: { name: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{name}</span>
        <span className="tabular-nums text-zinc-500">
          {used.toLocaleString()}{limit ? ` / ${limit.toLocaleString()} (${pct}%)` : ""}
        </span>
      </div>
      {limit && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
