import { LANGUAGE_LABELS } from "@dualflow/shared";
import { api, type ChannelInfo } from "@/lib/api";
import { ApiError, Card, PageHeader } from "@/components/ui";

const MODE_TEXT: Record<ChannelInfo["mode"], string> = {
  AUTO: "Auto: every finished video is queued by itself",
  APPROVAL: "Approval: waits for you to press Approve",
  MANUAL: "Manual: only when you press Upload now",
};

// Connected channels. Tokens live in GitHub Secrets; this page only shows names and modes.
export default async function ChannelsPage() {
  let channels: ChannelInfo[];
  try {
    channels = await api<ChannelInfo[]>("/channels");
  } catch (e) {
    return (<><PageHeader title="Channels" /><ApiError error={e} /></>);
  }
  return (
    <>
      <PageHeader title="Channels" subtitle="One channel per language on each platform. Change the mode with the PUBLISH_MODE variable in GitHub." />
      {channels.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-700">No channels connected yet.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
            <li>Follow <code>docs/social-setup.md</code> in the GitHub project to get your tokens.</li>
            <li>Save them in GitHub: Settings → Secrets and variables → Actions.</li>
            <li>Run the &quot;Test my channels&quot; workflow in the Actions tab. Your channels then show up here.</li>
          </ol>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {channels.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{c.name}</span>
                <span className="text-xs text-zinc-500">{LANGUAGE_LABELS[c.language]}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">{MODE_TEXT[c.mode]}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Uploaded {c.counts.PUBLISHED ?? 0} · in queue {c.counts.SCHEDULED ?? 0} · waiting approval {c.counts.READY ?? 0} · failed {c.counts.FAILED ?? 0}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
