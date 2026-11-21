import Link from "next/link";
import { api, type ReadyPage as ReadyData, type ReadyVariant } from "@/lib/api";
import { ApiError, EmptyState, LangBadge, Notice, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { nepalTime } from "@/components/UploadStatus";
import { DeleteStoryButton } from "@/components/DeleteStoryButton";
import { ActionButton } from "@/components/ActionButton";
import { IconCheck, IconChevronLeft, IconChevronRight, IconDownload } from "@/components/icons";
import { setUploaded } from "./actions";

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
  try {
    // Only 10 stories at a time (one "page"), so the page loads fast.
    data = await api<ReadyData>(`/ready?show=${show}&page=${page}`);
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
        subtitle="Download each video, upload it to the channel of its language, then press Mark as uploaded."
        actions={videoCount > 0 ? (
          // A plain link: the browser shows the download progress.
          <a href={`/download/all?show=${show}`} className="btn btn-primary">
            <IconDownload className="h-4 w-4" /> Download all ({videoCount}) as .zip
          </a>
        ) : undefined}
      />

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
                <VideoCard key={v.id} v={v} />
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

function VideoCard({ v }: { v: ReadyVariant }) {
  const hashtags = (v.hashtags ?? []).map((h) => `#${h.replace(/^#/, "")}`).join(" ");
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
        {/* Preview: the thumbnail; press play to watch. Nothing downloads until you press play. */}
        <div className="mx-auto w-36 shrink-0 sm:mx-0">
          {hasVideo ? (
            <video controls preload="none" poster={poster} src={`/download/${v.id}/video?inline=1`}
              className="aspect-[9/16] w-full rounded-md bg-[#1f1f1f] object-cover" />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md bg-subtle p-2 text-center text-xs text-fg3">
              Video file deleted to save storage
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Field label="Title" text={v.title ?? ""} lang={v.language} big />
          <Field label="Description and hashtags" text={fullText} lang={v.language} />
          {v.durationSec != null && <p className="text-xs text-fg3">{Math.round(v.durationSec)} seconds, vertical 9:16</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hasVideo && (
          <a href={`/download/${v.id}/video`} className="btn btn-primary">
            <IconDownload className="h-4 w-4" /> Download video
          </a>
        )}
        {hasThumb && <a href={`/download/${v.id}/thumbnail`} className="btn">Thumbnail</a>}
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
