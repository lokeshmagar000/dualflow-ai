import Link from "next/link";
import { api, type ChannelInfo, type Story } from "@/lib/api";
import { ApiError, Card, LangBadge, Notice, PageHeader, SectionTitle, Stat } from "@/components/ui";

/** "2026-11-21" for a date, in Nepal time (so a video made at 2 AM counts for the right day). */
function nepalDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(d);
}
const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Analytics: how many videos you make and upload, from your own data.
 * (Views and watch time need the platforms' statistics APIs; those come later.)
 */
export default async function AnalyticsPage() {
  let stories: Story[];
  let channels: ChannelInfo[];
  try {
    [stories, channels] = await Promise.all([api<Story[]>("/stories"), api<ChannelInfo[]>("/channels").catch(() => [])]);
  } catch (e) {
    return (<><PageHeader title="Analytics" /><ApiError error={e} /></>);
  }
  stories = Array.isArray(stories) ? stories : [];
  channels = Array.isArray(channels) ? channels : [];

  const variants = stories.flatMap((s) => s.variants ?? []);
  const done = (lang: "ne" | "en") => variants.filter((v) => v.language === lang && ["READY", "APPROVED", "SCHEDULED", "PUBLISHED"].includes(v.status)).length;
  const failed = stories.filter((s) => s.status === "FAILED").length;
  const finishedStories = stories.filter((s) => s.status !== "FAILED" && s.status !== "DRAFT" && s.status !== "GENERATING").length;
  const successRate = finishedStories + failed > 0 ? Math.round((finishedStories / (finishedStories + failed)) * 100) : null;

  // Stories made per day, last 14 days (Nepal time).
  const days: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) days.push({ day: nepalDay(new Date(Date.now() - i * 86_400_000)), count: 0 });
  for (const s of stories) {
    const d = days.find((x) => x.day === nepalDay(new Date(s.createdAt)));
    if (d) d.count++;
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const last14 = days.reduce((a, d) => a + d.count, 0);

  const aiPicked = stories.filter((s) => s.topic?.source === "DIRECTOR").length;

  return (
    <>
      <PageHeader title="Analytics" subtitle="How many videos you make and upload. Based on the newest 50 stories." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stories, last 14 days" value={last14} />
        <Stat label="Finished Nepali videos" value={done("ne")} />
        <Stat label="Finished English videos" value={done("en")} />
        <Stat label="Made without errors" value={successRate == null ? "None yet" : `${successRate}%`} note={failed > 0 ? `${failed} failed` : undefined} tone={failed > 0 ? "bad" : undefined} href={failed > 0 ? "/content?show=failed" : undefined} />
      </div>

      <SectionTitle>Stories made per day</SectionTitle>
      <Card>
        {last14 === 0 ? (
          <p className="text-fg3">No stories in the last 14 days.</p>
        ) : (
          <figure>
            {/* A simple bar chart: one bar per day. Hover or tap a bar to see its number. */}
            <div className="flex h-40 items-end gap-[2px] border-b border-stroke" role="img"
              aria-label={`Stories per day for the last 14 days: ${days.map((d) => `${shortDay(d.day)} ${d.count}`).join(", ")}`}>
              {days.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center" title={`${shortDay(d.day)}: ${d.count} ${d.count === 1 ? "story" : "stories"}`}>
                  {d.count > 0 && (
                    <span className="pointer-events-none absolute -top-0.5 hidden -translate-y-full rounded bg-fg1 px-1.5 py-0.5 text-xs text-surface group-hover:block">{d.count}</span>
                  )}
                  <div className="w-full max-w-6 rounded-t bg-brand" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-[2px] text-[11px] text-fg3">
              {days.map((d, i) => (
                <span key={d.day} className="flex-1 text-center">{i % 2 === 1 || i === 13 ? shortDay(d.day) : ""}</span>
              ))}
            </div>
            <figcaption className="mt-2 text-xs text-fg3">Each story has a Nepali and an English video. Most per day: {max}.</figcaption>
          </figure>
        )}
      </Card>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card title="Where topics come from">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-subtle p-3"><dt className="text-fg3">Picked by AI</dt><dd className="text-xl font-semibold tabular-nums">{aiPicked}</dd></div>
            <div className="rounded-md bg-subtle p-3"><dt className="text-fg3">Your ideas and uploads</dt><dd className="text-xl font-semibold tabular-nums">{stories.length - aiPicked}</dd></div>
          </dl>
        </Card>

        <Card title="Uploads per channel">
          {channels.length === 0 ? (
            <p className="text-fg3">No channels connected yet. See <Link href="/channels" className="link">Channels</Link>.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="text-xs text-fg3">
                <tr><th className="pb-2 font-semibold">Channel</th><th className="pb-2 text-right font-semibold">Uploaded</th><th className="pb-2 text-right font-semibold">Failed</th></tr>
              </thead>
              <tbody className="divide-y divide-stroke">
                {channels.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2"><span className="flex flex-wrap items-center gap-1.5">{c.name} <LangBadge lang={c.language} /></span></td>
                    <td className="py-2 text-right tabular-nums">{c.counts?.PUBLISHED ?? 0}</td>
                    <td className="py-2 text-right tabular-nums">{c.counts?.FAILED ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Notice tone="info" title="Views and watch time come later">
          They need each platform&apos;s statistics permission (YouTube Analytics, Meta Insights, TikTok). When your channels are connected, we can add them here.
        </Notice>
      </div>
    </>
  );
}
