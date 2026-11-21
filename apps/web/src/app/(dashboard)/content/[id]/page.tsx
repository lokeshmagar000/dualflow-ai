import Link from "next/link";
import { LANGUAGE_LABELS } from "@dualflow/shared";
import { api, type StoryDetail } from "@/lib/api";
import { ApiError, Card, PageHeader, StatusBadge } from "@/components/ui";
import { VoicePlayer } from "@/components/VoicePlayer";
import { retryStory } from "../actions";
import { DeleteStoryButton } from "@/components/DeleteStoryButton";
import { approveStory, retryUpload, uploadNow } from "../publish-actions";
import { UploadStatus, nepalTime } from "@/components/UploadStatus";

/** 7350 ms -> "0:07" */
function clock(ms: number | null) {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// One story: the Nepali and English scripts side by side, plus the research behind them.
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let story: StoryDetail;
  try {
    story = await api<StoryDetail>(`/stories/${id}`);
  } catch (e) {
    return (<><PageHeader title="Story" /><ApiError error={e} /></>);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link href="/content" className="text-sm text-zinc-500 hover:text-zinc-800">← All content</Link>
        <DeleteStoryButton storyId={story.id} title={story.topic.title} goTo="/content" />
      </div>
      <PageHeader title={story.topic.title} subtitle={`${story.format.toLowerCase()} · cost so far $${story.costUsd.toFixed(2)}`} />

      {story.status === "FAILED" && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <p className="font-medium text-red-700">Something went wrong</p>
          <p className="mt-1 text-sm text-red-600">{story.lastError}</p>
          <form action={retryStory} className="mt-3">
            <input type="hidden" name="storyId" value={story.id} />
            <button className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700">Try again</button>
          </form>
        </Card>
      )}

      {/* Two columns on wide screens: Nepali left, English right. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {story.variants.map((v) => (
          <Card key={v.id}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold">{LANGUAGE_LABELS[v.language]}</span>
              <StatusBadge status={v.status} />
            </div>
            {v.title ? (
              <>
                <h2 lang={v.language} className="text-lg font-bold">{v.title}</h2>
                {v.thumbnailHeadline && (
                  <p className="mt-1 text-xs text-zinc-500">Thumbnail text: <span lang={v.language}>{v.thumbnailHeadline}</span></p>
                )}
                {v.voice ? (
                  <div className="mt-4">
                    <VoicePlayer variantId={v.id} lang={v.language} cues={v.voice.cues} />
                    <p className="mt-1 text-xs text-zinc-500">
                      {v.voice.provider === "mock" ? "Practice voice (beeps, no key needed)" : `Voice: ${v.voice.voice}`}
                      {v.durationSec != null && ` · ${Math.round(v.durationSec)} seconds`}
                    </p>
                  </div>
                ) : (
                  v.status === "GENERATING" && <p className="mt-4 text-sm text-zinc-500">The voice is being recorded...</p>
                )}
                <ol className="mt-4 space-y-3">
                  {v.scenes.map((s) => (
                    <li key={s.id} className="rounded-lg bg-zinc-50 p-3">
                      <p className="mb-1 text-xs font-medium uppercase text-zinc-400">
                        {s.order}. {s.purpose?.replace(/_/g, " ")}
                        {s.startMs != null && <span className="ml-2 normal-case">{clock(s.startMs)} – {clock(s.endMs)}</span>}
                      </p>
                      <p lang={v.language} className="leading-relaxed">{s.text}</p>
                    </li>
                  ))}
                </ol>
                <p lang={v.language} className="mt-4 whitespace-pre-line text-sm text-zinc-600">{v.description}</p>
                <p className="mt-2 text-sm text-brand-600">{v.hashtags.map((h) => `#${h}`).join(" ")}</p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">{story.status === "FAILED" ? "Not written yet." : "The script is being written..."}</p>
            )}
          </Card>
        ))}
      </div>

      <UploadsCard story={story} />

      {story.research && (
        <Card className="mt-6">
          <h2 className="mb-2 font-semibold">Research</h2>
          <p className="text-sm text-zinc-700">{story.research.summary}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {story.topic.researchNotes.map((n) => (
              <li key={n.id}>
                • {n.claim}{" "}
                {n.sourceUrl && (
                  <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">source</a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** Uploads to social channels: status per channel, plus Approve / Upload now buttons. */
function UploadsCard({ story }: { story: StoryDetail }) {
  const videosReady = story.variants.some((v) => ["READY", "SCHEDULED", "PUBLISHED"].includes(v.status));
  if (!videosReady) return null;
  const pubs = story.variants.flatMap((v) => v.publications.map((p) => ({ ...p, language: v.language })));
  const waitingApproval = pubs.some((p) => p.status === "READY");
  return (
    <Card className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Uploads to social channels</h2>
        <div className="flex gap-2">
          {waitingApproval && (
            <form action={approveStory}>
              <input type="hidden" name="storyId" value={story.id} />
              <button className="rounded-lg bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700">Approve</button>
            </form>
          )}
          <form action={uploadNow}>
            <input type="hidden" name="storyId" value={story.id} />
            <button className="rounded-lg bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700">Upload now</button>
          </form>
        </div>
      </div>
      {pubs.length === 0 ? (
        <p className="text-sm text-zinc-500">Not in the upload queue. Press &quot;Upload now&quot;, or see the Channels page to set up auto or approval mode.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {pubs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-48 font-medium">{p.channel.name}</span>
              <UploadStatus status={p.status} />
              <span className="text-zinc-500">
                {p.status === "PUBLISHED" ? `on ${nepalTime(p.publishedAt)}` : p.status === "SCHEDULED" ? `at ${nepalTime(p.scheduledAt)}` : ""}
              </span>
              {p.postUrl && <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">open</a>}
              {p.status === "FAILED" && (
                <form action={retryUpload}>
                  <input type="hidden" name="publicationId" value={p.id} />
                  <input type="hidden" name="storyId" value={story.id} />
                  <button className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700">Try again</button>
                </form>
              )}
              {p.error && <p className="w-full text-xs text-zinc-500">{p.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
