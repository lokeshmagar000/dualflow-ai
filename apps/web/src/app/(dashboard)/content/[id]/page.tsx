import Link from "next/link";
import { api, type StoryDetail } from "@/lib/api";
import { nepaliFirst, ApiError, Card, LangBadge, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { IconChevronLeft } from "@/components/icons";
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
    return (<><BackLink /><PageHeader title="Video" /><ApiError error={e} /></>);
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={story.topic.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={story.status} /> {story.format === "LONG" ? "Long video" : "Short video"}, cost so far ${(story.costUsd ?? 0).toFixed(2)}</span>}
        actions={<DeleteStoryButton storyId={story.id} title={story.topic.title} goTo="/content" />}
      />

      {story.status === "FAILED" && (
        <Notice tone="bad" title="Making this video failed"
          action={<ActionButton action={retryStory} fields={{ storyId: story.id }} label="Try again" pendingLabel="Starting…" className="btn btn-danger-solid" showOk align="end" />}>
          <span className="break-words">{story.lastError ?? "No reason was saved."}</span>
        </Notice>
      )}

      {/* Two columns on wide screens: Nepali left, English right. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {nepaliFirst(story.variants).map((v) => (
          <Card key={v.id}>
            <div className="mb-3 flex items-center justify-between">
              <LangBadge lang={v.language} long />
              <StatusBadge status={v.status} />
            </div>
            {v.title ? (
              <>
                <h2 lang={v.language} className="text-lg font-semibold">{v.title}</h2>
                {v.thumbnailHeadline && (
                  <p className="mt-1 text-xs text-fg3">Thumbnail text: <span lang={v.language}>{v.thumbnailHeadline}</span></p>
                )}
                {v.voice ? (
                  <div className="mt-4">
                    <VoicePlayer variantId={v.id} lang={v.language} cues={v.voice.cues} />
                    <p className="mt-1 text-xs text-fg3">
                      {v.voice.provider === "mock" ? "Practice voice (beeps, no key needed)" : `Voice: ${v.voice.voice}`}
                      {v.durationSec != null && ` · ${Math.round(v.durationSec)} seconds`}
                    </p>
                  </div>
                ) : (
                  v.status === "GENERATING" && <p className="mt-4 text-fg3">The voice is being recorded…</p>
                )}
                <ol className="mt-4 space-y-3">
                  {(v.scenes ?? []).map((s) => (
                    <li key={s.id} className="rounded-md bg-subtle p-3">
                      <p className="mb-1 text-xs font-semibold text-fg3">
                        Scene {s.order}{s.purpose ? `: ${s.purpose.replace(/_/g, " ")}` : ""}
                        {s.startMs != null && <span className="ml-2 font-normal">{clock(s.startMs)} – {clock(s.endMs)}</span>}
                      </p>
                      <p lang={v.language} className="leading-relaxed">{s.text}</p>
                    </li>
                  ))}
                </ol>
                <p lang={v.language} className="mt-4 whitespace-pre-line break-words text-fg2">{v.description}</p>
                <p className="mt-2 break-words text-brand-fg">{(v.hashtags ?? []).map((h) => `#${h}`).join(" ")}</p>
              </>
            ) : (
              <p className="text-fg3">{story.status === "FAILED" ? "Not written yet." : "The script is being written…"}</p>
            )}
          </Card>
        ))}
      </div>

      <UploadsCard story={story} />

      {story.research && (
        <Card className="mt-6" title="Research behind the script">
          <p className="text-fg2">{story.research.summary}</p>
          <ul className="mt-3 space-y-1">
            {(story.topic.researchNotes ?? []).map((n) => (
              <li key={n.id}>
                • {n.claim}{" "}
                {n.sourceUrl && (
                  <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">source</a>
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
  const pubs = story.variants.flatMap((v) => (v.publications ?? []).map((p) => ({ ...p, language: v.language })));
  const waitingApproval = pubs.some((p) => p.status === "READY");
  return (
    <Card className="mt-6" title="Uploads to social channels"
      action={
        <div className="flex flex-wrap gap-2">
          {waitingApproval && <ActionButton action={approveStory} fields={{ storyId: story.id }} label="Approve" pendingLabel="Approving…" className="btn btn-ok" align="end" />}
          <ActionButton action={uploadNow} fields={{ storyId: story.id }} label="Upload now" pendingLabel="Adding…" className="btn btn-primary" showOk align="end" />
        </div>
      }>
      {pubs.length === 0 ? (
        <p className="text-fg3">Not in the upload queue. Press Upload now, or set auto or approval mode on the Channels page. You can also download the videos on <Link href="/ready" className="link">Ready to upload</Link>.</p>
      ) : (
        <ul className="divide-y divide-stroke">
          {pubs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-40 font-semibold">{p.channel.name}</span> <LangBadge lang={p.language} />
              <UploadStatus status={p.status} />
              <span className="text-fg3">
                {p.status === "PUBLISHED" ? `on ${nepalTime(p.publishedAt)}` : p.status === "SCHEDULED" ? `at ${nepalTime(p.scheduledAt)}` : ""}
              </span>
              {p.postUrl && <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="link">Open post</a>}
              {p.status === "FAILED" && (
                <ActionButton action={retryUpload} fields={{ publicationId: p.id, storyId: story.id }} label="Try again" pendingLabel="Retrying…" className="btn btn-sm btn-danger" />
              )}
              {p.error && <p className="w-full break-words text-xs text-fg3">{p.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BackLink() {
  return (
    <Link href="/content" className="mb-2 inline-flex h-9 items-center gap-1 rounded-md pr-2 text-fg3 hover:text-fg1">
      <IconChevronLeft className="h-4 w-4" /> All videos
    </Link>
  );
}
