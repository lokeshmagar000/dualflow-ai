import Link from "next/link";
import { api, type AutoStatus, type Topic } from "@/lib/api";
import { ApiError, Card, PageHeader, StatusBadge } from "@/components/ui";
import { AutoSwitch, GenerateNowButton } from "@/components/AutoControls";
import { nepalTime } from "@/components/UploadStatus";
import { addTopic, makeVideo } from "./actions";

export default async function IdeasPage() {
  let topics: Topic[] = [];
  let auto: AutoStatus | null = null;
  try {
    // Both at the same time. If the automatic-videos part fails (older API), the page still works.
    [topics, auto] = await Promise.all([api<Topic[]>("/topics"), api<AutoStatus>("/auto").catch(() => null)]);
  } catch (e) {
    return (<><PageHeader title="Ideas & Chat" /><ApiError error={e} /></>);
  }

  return (
    <>
      <PageHeader title="Ideas & Chat" subtitle="Let the AI make videos by itself, or add your own ideas." />

      {auto && <AutoCard auto={auto} />}

      <h2 className="mb-2 font-semibold">Your own ideas</h2>
      <p className="mb-3 text-sm text-zinc-500">Ideas you add here are made first, before the AI picks new topics.</p>

      <Card className="mb-6">
        <form action={addTopic} className="space-y-3">
          <input name="title" required minLength={3} maxLength={200} placeholder="Video idea, e.g. Why Nepal's tea is famous"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-brand-500" />
          <textarea name="notes" rows={2} maxLength={2000} placeholder="Notes (optional)"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-brand-500" />
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Add idea</button>
        </form>
      </Card>

      <Card className="divide-y divide-zinc-100 p-0">
        {topics.length === 0 && <p className="p-5 text-sm text-zinc-500">No ideas yet.</p>}
        {topics.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div>
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-xs text-zinc-500">{t.source === "DIRECTOR" ? "picked by AI" : t.source.toLowerCase()} · {t.status.toLowerCase()}</p>
            </div>
            {t.status !== "USED" && (
              <form action={makeVideo} className="flex gap-2">
                <input type="hidden" name="topicId" value={t.id} />
                <select name="format" className="rounded-lg border border-zinc-300 px-2 py-1 text-sm">
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                </select>
                <button className="rounded-lg bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700">Make NE + EN video</button>
              </form>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}

/** "Automatic videos": the Auto mode switch, Generate now, the next run times and the AI's topics. */
function AutoCard({ auto }: { auto: AutoStatus }) {
  return (
    <Card className="mb-8 border-emerald-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">🤖 Automatic videos</h2>
          <p className="mt-1 text-sm text-zinc-600">
            When Auto mode is ON, the AI picks a topic by itself and makes a Nepali + English video
            every night at <b>2:00 AM</b> and <b>4:00 AM</b> Nepal time ({auto.perDay} a day). You only download and upload them.
          </p>
        </div>
        <AutoSwitch enabled={auto.enabled} />
      </div>

      {auto.paused && (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          Everything is paused by the kill switch. Turn it back on in <Link href="/costs" className="underline">Costs & Automation</Link>.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-xs font-medium uppercase text-zinc-400">Next automatic runs</p>
          {auto.enabled && !auto.paused ? (
            <ul className="mt-1 text-sm">
              {auto.nextRuns.map((r) => <li key={r}>{nepalTime(r)}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-zinc-500">None while Auto mode is off.</p>
          )}
          {auto.waitingIdeas > 0 && (
            <p className="mt-2 text-xs text-zinc-500">First it makes your {auto.waitingIdeas} waiting idea{auto.waitingIdeas === 1 ? "" : "s"} below, then AI topics.</p>
          )}
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Want a video right now?</p>
          <GenerateNowButton available={auto.generateNowAvailable} />
          <p className="mt-2 text-xs text-zinc-500">Ready on <Link href="/ready" className="underline">Ready to upload</Link> in about 15-20 minutes. Works even when Auto mode is off.</p>
        </div>
      </div>

      <p className="mb-2 mt-5 text-xs font-medium uppercase text-zinc-400">Topics the AI picked</p>
      {auto.aiTopics.length === 0 ? (
        <p className="text-sm text-zinc-500">None yet. The first one comes with the next run, or press Generate now.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {auto.aiTopics.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              {t.storyId ? <Link href={`/content/${t.storyId}`} className="hover:text-brand-600">{t.title}</Link> : <span>{t.title}</span>}
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                {nepalTime(t.createdAt)}
                {t.storyStatus ? <StatusBadge status={t.storyStatus} /> : <span>deleted</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
