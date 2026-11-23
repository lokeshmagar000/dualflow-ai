import Link from "next/link";
import { api, type ReadyPage as ReadyData, type ReadyVariant } from "@/lib/api";
import { ApiError, EmptyState, LangBadge, Notice, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { nepalTime } from "@/components/UploadStatus";
import { DeleteStoryButton } from "@/components/DeleteStoryButton";
import { ActionButton } from "@/components/ActionButton";
import { IconCheck, IconChevronLeft, IconChevronRight, IconDownload, IconUpload } from "@/components/icons";
import { setUploaded, uploadAll, uploadVideo } from "./actions";

/**
 * Ready to upload: every finished video, Nepali and English side by side.
 * Download the video (and thumbnail), copy the title / description / hashtags,
 * upload it yourself, then press "Mark as uploaded".
 */
const TABS = [
  { key: "waiting", label: "Waiting for upload" },
  { key: "uploaded", label: "Uploaded" },
  { key: "all", label: "All" },
] as const;

export default async function ReadyPage({ searchParams }: { searchParams: Promise<{ show?: string; page?: string }> }) {
  const { show: rawShow, page: rawPage } = await searchParams;
  const show = TABS.some((t) => t.key === rawShow) ? rawShow! : "waiting";
  const page = Math.max(1, Number(rawPage) || 1);
  let data: ReadyData;
  let canUpload = false; // true when at least one channel is connected (Channels page)
  try {
    // Only 10 stories at a time (one "page"), so the page loads fast.
    const [ready, connect] = await Promise.all([
      api<ReadyData>(`/ready?show=${show}&page=${page}`),
      api<{ channels?: { connected: boolean }[] }>("/connect").catch(() => null),
    ]);
    data = ready;
    canUpload = Boolean(connect?.channels?.some((c) => c.connected));
  } catch (e) {
    return (<><PageHeader title="Ready to upload" /><ApiError error={e} /></>);
  }
  // If the API server still runs the older version (it answers with a plain list),
  // show the list anyway instead of crashing, plus a note on how to update it.
  const oldApi = Array.isArray(data);
  if (oldApi) {
    const list = data as unknown as ReadyData["stories"];
    data = { stories: list, total: list.length, page: 1, pageSize: Math.max(1, list.length), videoCount: 0 };
  }
  const stories = Array.isArray(data?.stories) ? data.stories : [];
  const total = data.total ?? stories.length;
  const pageSize = data.pageSize || 10;
  const videoCount = data.videoCount ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Ready to upload"
        subtitle={canUpload
          ? "Press Upload to send a video to your connected channels of its language. Or download it and post it yourself."
          : "Download each video, upload it to the channel of its language, then press Mark as uploaded."}
        actions={videoCount > 0 ? (
          <>
            {/* A plain link: the browser shows the download progress. */}
            <a href={`/download/all?show=${show}`} className="btn">
              <IconDownload className="h-4 w-4" /> Download all ({videoCount}) as .zip
            </a>
            {canUpload && show === "waiting" && (
              <ActionButton action={uploadAll} label={<><IconUpload className="h-4 w-4" /> Upload all to my channels</>}
                pendingLabel="Adding…" className="btn btn-primary" showOk align="end" />
            )}
          </>
        ) : undefined}
      />

      {!canUpload && stories.length > 0 && (
        <Notice tone="info" title="Want an Upload button here?">
          Connect your channels once on <Link href="/channels" className="underline">Channels</Link>. Then each video gets an
          <b> Upload to my channels</b> button, and Auto upload can post them by itself.
        </Notice>
      )}

      {oldApi && (
        <Notice tone="warn" title="The API server runs an older version">
          Delete and Download all do not work yet. On Render open <b>dualflow-api</b>, press <b>Manual Deploy</b>, then
          <b> Deploy latest commit</b>. Or turn on one server mode (see Settings).
        </Notice>
      )}

      <nav aria-label="Show" className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = show === t.key;
          return (
            <Link key={t.key} href={`/ready?show=${t.key}`} aria-current={active ? "page" : undefined}
              className={`flex h-9 shrink-0 items-center rounded-full border px-3.5 ${active ? "border-transparent bg-brand text-white" : "border-stroke bg-surface text-fg2 hover:bg-hover"}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      {videoCount > 0 && (
        <p className="-mt-2 mb-4 text-xs text-fg3">
          The zip has a Nepali and an English folder: each video with its thumbnail and a text file with the title, description and hashtags. A big zip takes a few minutes.
        </p>
      )}

      {stories.length === 0 && (
        <EmptyState title={show === "waiting" ? "Nothing waiting for upload" : "No videos here yet"}
          action={show === "waiting" ? <Link href="/ideas" className="btn">Make a video now</Link> : undefined}>
          {show === "waiting"
            ? "New videos arrive after the 2 AM and 4 AM runs (Nepal time). You can also press Generate now on Ideas & auto mode."
            : "Videos show here once they are finished."}
        </EmptyState>
      )}

      <div className="space-y-5">
        {stories.map((s) => (
          <section key={s.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <Link href={`/content/${s.id}`} className="font-semibold hover:text-brand-fg">{s.topic?.title ?? "Untitled"}</Link>
                <p className="text-xs text-fg3">Made {nepalTime(s.createdAt)}, {s.topic?.source === "DIRECTOR" ? "topic picked by AI" : "your idea"}</p>
              </div>
              <DeleteStoryButton storyId={s.id} title={s.topic?.title ?? "this video"} />
            </div>
            {/* Nepali first, then English. */}
            <div className="grid gap-px bg-stroke xl:grid-cols-2">
              {[...(s.variants ?? [])].sort((a, b) => (a.language === "ne" ? -1 : b.language === "ne" ? 1 : 0)).map((v) => (
                <VideoCard key={v.id} v={v} canUpload={canUpload} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Page buttons: only shown when there are more than 10 stories. */}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
          {page > 1 && <Link href={`/ready?show=${show}&page=${page - 1}`} className="btn"><IconChevronLeft className="h-4 w-4" /> Newer</Link>}
          <span className="text-fg3">Page {page} of {pages}</span>
          {page < pages && <Link href={`/ready?show=${show}&page=${page + 1}`} className="btn">Older <IconChevronRight className="h-4 w-4" /></Link>}
        </nav>
      )}

      <p className="mt-6 text-xs text-fg3">
        To save free storage, videos are deleted 7 days after you mark both languages as uploaded,
        and 30 days after they were made if you never mark them. The story text stays.
      </p>
    </>
  );
}

/** Names for the thumbnail sizes (the button text, and the full name when you point at it). */
const SIZE_LABELS: Record<string, { short: string; title: string }> = {
  shorts: { short: "Shorts / Reels", title: "1080x1920: YouTube Shorts, TikTok, Instagram and Facebook Reels" },
  youtube: { short: "YouTube", title: "1280x720: normal YouTube videos" },
  feed: { short: "FB / Insta post", title: "1080x1350: Facebook and Instagram feed posts" },
};

function VideoCard({ v, canUpload }: { v: ReadyVariant; canUpload: boolean }) {
  const tags = (v.hashtags ?? []).map((h) => `#${h.replace(/^#/, "")}`);
  const hashtags = tags.join(" ");
  const fullText = [v.description, hashtags].filter(Boolean).join("\n\n");
  const hasVideo = Boolean(v.outputKey);
  const hasThumb = (v.thumbnails?.length ?? 0) > 0 && hasVideo;
  // Direct R2 address when there is one (fast); otherwise through the dashboard.
  const poster = v.thumbnailUrl ?? (hasThumb ? `/download/${v.id}/thumbnail?inline=1` : undefined);
  const langName = v.language === "ne" ? "Nepali" : "English";

  return (
    <div className={`p-4 sm:p-5 ${v.manualUploadedAt ? "bg-ok-tint" : "bg-surface"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <LangBadge lang={v.language} long />
        <span className="text-xs text-fg3">For your {langName} channels</span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Preview: the video (press play; nothing downloads until then) and its own thumbnail. */}
        <div className="mx-auto flex shrink-0 gap-2 sm:mx-0">
          <div className="w-32">
            <p className="mb-1 text-xs font-semibold text-fg3">Video</p>
            {hasVideo ? (
              <video controls preload="none" poster={poster} src={`/download/${v.id}/video?inline=1`}
                className="aspect-[9/16] w-full rounded-md bg-[#1f1f1f] object-cover" />
            ) : (
              <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md bg-subtle p-2 text-center text-xs text-fg3">
                Video file deleted to save storage
              </div>
            )}
          </div>
          {hasThumb && poster && (
            <div className="w-32">
              <p className="mb-1 text-xs font-semibold text-fg3">{langName} thumbnail</p>
              {/* A plain link: opens the full-size picture. */}
              <a href={`/download/${v.id}/thumbnail?inline=1`} target="_blank" rel="noreferrer" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={poster} alt={`${langName} thumbnail`} loading="lazy"
                  className="aspect-[9/16] w-full rounded-md bg-subtle object-cover ring-1 ring-stroke" />
              </a>
              <a href={`/download/${v.id}/thumbnail`} className="btn btn-sm mt-2 w-full justify-center" title="The size that fits this video">
                <IconDownload className="h-4 w-4" /> Thumbnail
              </a>
              {(v.thumbnailSizes?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-fg3">Other sizes:</p>
                  {v.thumbnailSizes!.map((size) => (
                    <a key={size} href={`/download/${v.id}/thumbnail?size=${size}`} className="btn btn-sm w-full justify-center"
                      title={SIZE_LABELS[size]?.title}>
                      <IconDownload className="h-4 w-4" /> {SIZE_LABELS[size]?.short ?? size}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Field label="Title" text={v.title ?? ""} lang={v.language} big />
          <Field label="Description" text={v.description ?? ""} lang={v.language} />
          <Hashtags tags={tags} lang={v.language} />
          {fullText && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-subtle px-3 py-2">
              <span className="text-xs text-fg3">Description + hashtags in one go</span>
              <CopyButton text={fullText} label="Copy both" />
            </div>
          )}
          {v.durationSec != null && <p className="text-xs text-fg3">{Math.round(v.durationSec)} seconds, vertical 9:16</p>}
        </div>
      </div>

      {(v.publications?.length ?? 0) > 0 && <SentTo pubs={v.publications!} />}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hasVideo && canUpload && (
          <ActionButton action={uploadVideo} fields={{ variantId: v.id }} showOk
            label={<><IconUpload className="h-4 w-4" /> Upload to my {langName} channels</>}
            pendingLabel="Adding…" className="btn btn-primary" />
        )}
        {hasVideo && (
          <a href={`/download/${v.id}/video`} className={`btn ${canUpload ? "" : "btn-primary"}`}>
            <IconDownload className="h-4 w-4" /> Download video
          </a>
        )}
        {hasVideo && (v.subtitles?.length ?? 0) > 0 && <a href={`/download/${v.id}/srt`} className="btn">Subtitles (.srt)</a>}
        <div className="ml-auto">
          {v.manualUploadedAt ? (
            <ActionButton action={setUploaded} fields={{ variantId: v.id, uploaded: "false" }} align="end"
              label={<span className="flex items-center gap-1"><IconCheck className="h-4 w-4 text-ok" /> Uploaded {nepalTime(v.manualUploadedAt)}. Undo</span>}
              pendingLabel="Saving…" className="btn btn-subtle btn-sm" />
          ) : (
            <ActionButton action={setUploaded} fields={{ variantId: v.id, uploaded: "true" }} align="end"
              label="Mark as uploaded" pendingLabel="Saving…" className="btn btn-ok" />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, text, lang, big }: { label: string; text: string; lang: string; big?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg3">{label}</span>
        {text && <CopyButton text={text} />}
      </div>
      <p lang={lang} className={`whitespace-pre-line break-words ${big ? "font-semibold" : "max-h-32 overflow-y-auto text-fg2"}`}>
        {text || "Not written"}
      </p>
    </div>
  );
}

/**
 * Trending hashtags for this video, as chips. The first 3 are marked "Top":
 * YouTube shows the first 3 hashtags above the video title.
 */
function Hashtags({ tags, lang }: { tags: string[]; lang: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg3">Trending hashtags ({tags.length})</span>
        {tags.length > 0 && <CopyButton text={tags.join(" ")} label="Copy hashtags" />}
      </div>
      {tags.length === 0 ? (
        <p className="text-fg3">Not written</p>
      ) : (
        <ul lang={lang} className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <li key={t} className={`rounded-full px-2.5 py-0.5 text-sm ${i < 3 ? "bg-brand text-white" : "bg-subtle text-fg2"}`}
              title={i < 3 ? "Top hashtag: YouTube shows the first 3 above the title" : undefined}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PLATFORM: Record<string, string> = { YOUTUBE: "YouTube", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok" };
const SENT: Record<string, { text: string; cls: string }> = {
  READY: { text: "waits for Approve", cls: "bg-subtle2 text-fg2" },
  SCHEDULED: { text: "in the queue", cls: "bg-info-tint text-info" },
  GENERATING: { text: "uploading…", cls: "bg-warn-tint text-warn" },
  PUBLISHED: { text: "uploaded ✓", cls: "bg-ok-tint text-ok" },
  FAILED: { text: "failed", cls: "bg-bad-tint text-bad" },
};

/** Where this video was sent: one chip per channel, a link when it is up, the reason when it failed. */
function SentTo({ pubs }: { pubs: NonNullable<ReadyVariant["publications"]> }) {
  return (
    <div className="mt-4 rounded-md bg-subtle p-3">
      <p className="mb-2 text-xs font-semibold text-fg3">Sent to your channels</p>
      <ul className="space-y-1.5">
        {pubs.map((p, i) => {
          const s = SENT[p.status] ?? { text: p.status.toLowerCase(), cls: "bg-subtle2 text-fg2" };
          return (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{PLATFORM[p.channel.platform] ?? p.channel.platform}</span>
              <span className="text-fg3">{p.channel.name}</span>
              <span className={`badge ${s.cls}`}>{s.text}</span>
              {p.postUrl && <a href={p.postUrl} target="_blank" rel="noreferrer" className="text-brand-fg underline">open</a>}
              {p.error && <span className="w-full break-words text-xs text-fg3">{p.error}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
