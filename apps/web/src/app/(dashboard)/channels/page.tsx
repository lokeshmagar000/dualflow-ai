import { api, type ChannelInfo } from "@/lib/api";
import { ApiError, Card, LangBadge, PageHeader } from "@/components/ui";

const MODE_TEXT: Record<ChannelInfo["mode"], { name: string; text: string }> = {
  AUTO: { name: "Automatic", text: "Every finished video is queued by itself." },
  APPROVAL: { name: "Approval", text: "Waits until you press Approve on the video." },
  MANUAL: { name: "Manual", text: "Only when you press Upload now." },
};

const PLATFORM: Record<string, string> = { YOUTUBE: "YouTube", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok" };

// Connected channels. Tokens live in GitHub Secrets; this page only shows names and modes.
export default async function ChannelsPage() {
  let channels: ChannelInfo[];
  try {
    channels = await api<ChannelInfo[]>("/channels");
  } catch (e) {
    return (<><PageHeader title="Channels" /><ApiError error={e} /></>);
  }
  channels = Array.isArray(channels) ? channels : [];
  return (
    <>
      <PageHeader title="Channels" subtitle="One channel per language on each platform. The mode comes from the PUBLISH_MODE setting in GitHub." />
      {channels.length === 0 ? (
        <Card title="No channels connected yet">
          <ol className="list-decimal space-y-1.5 pl-5 text-fg2">
            <li>Follow <code>docs/channel-and-token-guide.md</code> in your GitHub project to get your tokens.</li>
            <li>Save them in GitHub: Settings, then Secrets and variables, then Actions.</li>
            <li>Run the &quot;Test my channels&quot; workflow in the Actions tab. Your channels then show up here.</li>
          </ol>
          <p className="mt-3 text-fg3">Until then you can still download every video on Ready to upload and post it yourself.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {channels.map((c) => {
            const m = MODE_TEXT[c.mode] ?? { name: c.mode, text: "" };
            const n = (k: string) => c.counts?.[k] ?? 0;
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-fg3">{PLATFORM[c.platform] ?? c.platform}</p>
                  </div>
                  <LangBadge lang={c.language} long />
                </div>
                <p className="mt-3"><span className="font-semibold">{m.name} mode.</span> <span className="text-fg2">{m.text}</span></p>
                <dl className="mt-3 grid grid-cols-4 gap-2 rounded-md bg-subtle p-3 text-center">
                  {([["Uploaded", "PUBLISHED"], ["In queue", "SCHEDULED"], ["Approval", "READY"], ["Failed", "FAILED"]] as const).map(([label, key]) => (
                    <div key={key}>
                      <dt className="text-xs text-fg3">{label}</dt>
                      <dd className={`text-lg font-semibold tabular-nums ${key === "FAILED" && n(key) > 0 ? "text-bad" : ""}`}>{n(key)}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
