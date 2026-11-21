import { api, type CostSummary, type PipelineStatus } from "@/lib/api";
import { ApiError, Card, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { nepalTime } from "@/components/UploadStatus";
import { runNow, setPaused } from "./actions";

// Costs & limits: free limits, the job queue, "Run now" and the kill switch.
export default async function CostsPage() {
  let costs: CostSummary;
  let status: PipelineStatus | null;
  try {
    // The job queue part is optional, so an older API still shows the spend.
    [costs, status] = await Promise.all([api<CostSummary>("/costs/summary"), api<PipelineStatus>("/pipeline/status").catch(() => null)]);
  } catch (e) {
    return (<><PageHeader title="Costs & limits" /><ApiError error={e} /></>);
  }
  const queue = status?.queue ?? { readyNow: 0, later: 0, running: 0, nextJobAt: null };
  const waiting = queue.readyNow + queue.later;

  return (
    <>
      <PageHeader title="Costs & limits" subtitle="Free plan: $0 a month while you stay inside the free limits." />

      {costs.paused && (
        <Notice tone="bad" title="All automation is paused">
          No videos are made and nothing is uploaded until you press Resume automation below.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Video making">
          <p className="text-fg2">GitHub Actions makes videos every night at 2 AM and 4 AM Nepal time. Run now starts the waiting jobs at once.</p>
          <dl className="mt-4 grid grid-cols-3 gap-2 rounded-md bg-subtle p-3 text-center">
            <div><dt className="text-xs text-fg3">Ready to make</dt><dd className="text-xl font-semibold tabular-nums">{queue.readyNow}</dd></div>
            <div><dt className="text-xs text-fg3">Running</dt><dd className="text-xl font-semibold tabular-nums">{queue.running}</dd></div>
            <div><dt className="text-xs text-fg3">Later</dt><dd className="text-xl font-semibold tabular-nums">{queue.later}</dd></div>
          </dl>
          {queue.nextJobAt && waiting > 0 && (
            <p className="mt-2 text-xs text-fg3">Next job can start {nepalTime(queue.nextJobAt)}. &quot;Later&quot; means a retry or waiting for tomorrow&apos;s free limit.</p>
          )}
          <div className="mt-4">
            {status?.runNowAvailable ? (
              <ActionButton action={runNow} label="Run now" pendingLabel="Starting…" className="btn btn-primary" showOk />
            ) : (
              <>
                <button className="btn" disabled aria-disabled="true">Run now</button>
                <p className="mt-2 text-xs text-fg3">Run now needs <code>GITHUB_REPO</code> and <code>GITHUB_DISPATCH_TOKEN</code> on Render (see Settings).</p>
              </>
            )}
          </div>
        </Card>

        <Card title="Spend">
          <p className="text-[32px] font-semibold leading-10 tabular-nums">${(costs.monthUsd ?? 0).toFixed(2)}</p>
          <p className="text-fg3">this month, today ${(costs.todayUsd ?? 0).toFixed(2)}</p>
          {(costs.budgets?.length ?? 0) > 0 && (
            <p className="mt-2 text-xs text-fg3">Caps: {costs.budgets.map((b) => `$${b.capUsd} ${b.period.toLowerCase()}`).join(", ")}</p>
          )}
          <div className="mt-4 border-t border-stroke pt-4">
            <p className="mb-2 font-semibold">Kill switch</p>
            <ActionButton action={setPaused} fields={{ paused: String(!costs.paused) }} showOk
              label={costs.paused ? "Resume automation" : "Pause all automation"}
              pendingLabel="Saving…" className={costs.paused ? "btn btn-ok" : "btn btn-danger"} />
          </div>
        </Card>
      </div>

      <SectionTitle>Free limits</SectionTitle>
      <Card>
        {status && status.quotas.length > 0 ? (
          <div className="space-y-4">
            {status.quotas.map((q) => <QuotaBar key={q.name} name={q.name} used={q.used} limit={q.limit} />)}
          </div>
        ) : (
          <p className="text-fg3">No limit data yet.</p>
        )}
        <p className="mt-4 text-xs text-fg3">
          Making stops by itself at the Gemini daily limit, then continues when the limit resets.
        </p>
      </Card>
    </>
  );
}

function QuotaBar({ name, used, limit }: { name: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? "bg-bad" : pct >= 70 ? "bg-warn" : "bg-ok";
  return (
    <div>
      <div className="flex justify-between gap-3">
        <span>{name}</span>
        <span className="tabular-nums text-fg3">
          {used.toLocaleString()}{limit ? ` of ${limit.toLocaleString()} (${pct}%)` : ""}
        </span>
      </div>
      {limit ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={name}>
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
