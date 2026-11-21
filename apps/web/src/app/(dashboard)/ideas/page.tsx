import Link from "next/link";
import { api, type AutoStatus, type Topic } from "@/lib/api";
import { ApiError, Card, EmptyState, Notice, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { AutoSwitch, GenerateNowButton } from "@/components/AutoControls";
import { ActionButton } from "@/components/ActionButton";
import { IdeaForm } from "@/components/IdeaForm";
import { nepalTime } from "@/components/UploadStatus";
import { makeVideo } from "./actions";

export default async function IdeasPage() {
  let topics: Topic[] = [];
  let auto: AutoStatus | null = null;
  try {
    // Both at the same time. If the automatic-videos part fails (older API), the page still works.
    [topics, auto] = await Promise.all([api<Topic[]>("/topics"), api<AutoStatus>("/auto").catch(() => null)]);
  } catch (e) {
    return (<><PageHeader title="Ideas & auto mode" /><ApiError error={e} /></>);
  }
  topics = Array.isArray(topics) ? topics : [];
  const waiting = topics.filter((t) => t.status !== "USED");
  const used = topics.filter((t) => t.status === "USED");

  return (
    <>
      <PageHeader title="Ideas & auto mode" subtitle="Let the AI make videos by itself, or add your own ideas. Your ideas always go first." />

      {auto ? <AutoCard auto={auto} /> : (
        <Notice tone="warn" title="Auto mode controls are not available">
          The API server runs an older version. Redeploy it on Render, or turn on one server mode (see Settings).
        </Notice>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Add your own idea">
          <IdeaForm />
        </Card>

        <div>
          <h2 className="mb-3 text-base font-semibold">Waiting ideas ({waiting.length})</h2>
          {waiting.length === 0 ? (
            <EmptyState title="No waiting ideas">Add one on the left, or let auto mode pick topics.</EmptyState>
          ) : (
            <Card flush>
              <ul className="divide-y divide-stroke">
                {waiting.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t.title}</p>
                      <p className="text-xs text-fg3">{t.source === "DIRECTOR" ? "Picked by AI" : "Your idea"} · added {nepalTime(t.createdAt)}</p>
                    </div>
                    <ActionButton action={makeVideo} fields={{ topicId: t.id }} label="Make video" pendingLabel="Starting…" className="btn btn-primary" showOk>
                      <label className="sr-only" htmlFor={`f-${t.id}`}>Length</label>
                      <select id={`f-${t.id}`} name="format" className="field w-auto">
                        <option value="short">Short</option>
                        <option value="long">Long</option>
                      </select>
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {used.length > 0 && (
        <>
          <SectionTitle>Already made ({used.length})</SectionTitle>
          <Card flush>
            <ul className="divide-y divide-stroke">
              {used.slice(0, 20).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-fg3">{t.source === "DIRECTOR" ? "AI" : "you"} · {nepalTime(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

/** "Automatic videos": the Auto mode switch, Generate now, the next run times and the AI's topics. */
function AutoCard({ auto }: { auto: AutoStatus }) {
  const nextRuns = auto.nextRuns ?? [];
  const aiTopics = auto.aiTopics ?? [];
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-[15rem] max-w-2xl flex-1">
          <h2 className="text-lg font-semibold">Automatic videos</h2>
          <p className="mt-1 text-fg2">
            When auto mode is on, the AI picks a topic and makes a Nepali and an English video every night at
            <b> 2:00 AM</b> and <b>4:00 AM</b> Nepal time ({auto.perDay} a day). You only download and upload them.
          </p>
        </div>
        <AutoSwitch enabled={auto.enabled} />
      </div>

      {auto.paused && (
        <div className="px-4 sm:px-5">
          <Notice tone="bad" title="Everything is paused by the kill switch">
            Turn it back on in <Link href="/costs" className="link">Costs & limits</Link>.
          </Notice>
        </div>
      )}

      <div className="grid gap-px border-t border-stroke bg-stroke sm:grid-cols-2">
        <div className="bg-surface p-4 sm:p-5">
          <p className="text-fg3">Next automatic runs</p>
          {auto.enabled && !auto.paused && nextRuns.length > 0 ? (
            <ul className="mt-1 space-y-0.5 font-semibold">
              {nextRuns.map((r) => <li key={r}>{nepalTime(r)}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-fg2">None while auto mode is off.</p>
          )}
          {auto.waitingIdeas > 0 && (
            <p className="mt-2 text-xs text-fg3">First it makes your {auto.waitingIdeas} waiting idea{auto.waitingIdeas === 1 ? "" : "s"}, then AI topics.</p>
          )}
        </div>
        <div className="bg-surface p-4 sm:p-5">
          <p className="mb-2 text-fg3">Want a video right now?</p>
          <GenerateNowButton available={auto.generateNowAvailable} />
          {auto.generateNowAvailable && (
            <p className="mt-2 text-xs text-fg3">Ready on <Link href="/ready" className="link">Ready to upload</Link> in about 15 to 20 minutes. Works even when auto mode is off.</p>
          )}
        </div>
      </div>

      <div className="border-t border-stroke p-4 sm:p-5">
        <p className="mb-2 text-fg3">Topics the AI picked</p>
        {aiTopics.length === 0 ? (
          <p className="text-fg2">None yet. The first one comes with the next run, or press Generate now.</p>
        ) : (
          <ul className="divide-y divide-stroke">
            {aiTopics.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                {t.storyId ? <Link href={`/content/${t.storyId}`} className="link min-w-0 flex-1">{t.title}</Link> : <span className="min-w-0 flex-1">{t.title}</span>}
                <span className="flex items-center gap-2 text-xs text-fg3">
                  {nepalTime(t.createdAt)}
                  {t.storyStatus ? <StatusBadge status={t.storyStatus} /> : <span>deleted</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
