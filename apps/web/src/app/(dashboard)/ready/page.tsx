import Link from "next/link";
import { api, type ReadyPage as ReadyData, type ReadyVariant } from "@/lib/api";
import { ApiError, Card, PageHeader } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { nepalTime } from "@/components/UploadStatus";
import { DeleteStoryButton } from "@/components/DeleteStoryButton";
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

const LANG = {
  ne: { name: "नेपाली · Nepali", where: "Upload to your NEPALI channels", color: "bg-rose-100 text-rose-800" },
  en: { name: "English", where: "Upload to your ENGLISH channels", color: "bg-sky-100 text-sky-800" },
};

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
  const { stories, total, pageSize, videoCount } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Ready to upload"
        subtitle="New videos (Nepali + English) are made by themselves every night at 2 AM and 4 AM Nepal time. Download, upload to your channels, then mark as uploaded."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/ready?show=${t.key}`}
            className={`rounded-full px-3 py-1 text-sm ${show === t.key ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"}`}>
            {t.label}
          </Link>
        ))}
        {/* One .zip with every video of this tab (a plain link: the browser shows the download progress). */}
        {videoCount > 0 && (
          <a href={`/download/all?show=${show}`}
            className="ml-auto rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            ⬇ Download all ({videoCount} video{videoCount === 1 ? "" : "s"}) as .zip
          </a>
        )}
      </div>
      {videoCount > 0 && (
        <p className="-mt-2 mb-4 text-right text-xs text-zinc-500">
          The zip has a Nepali and an English folder: each video with its thumbnail and a text file (title, description, hashtags).
          A big zip takes a few minutes.
        </p>
      )}

      {stories.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-600">
            {show === "waiting"
              ? "Nothing waiting. New videos are made at 2 AM and 4 AM Nepal time. Want one now? Add an idea on Ideas & Chat, or press Run now on Costs & Automation."
              : "No videos here yet."}
          </p>
        </Card>
      )}

      <div className="space-y-6">
        {stories.map((s) => (
          <Card key={s.id}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/content/${s.id}`} className="font-semibold hover:text-brand-600">{s.topic.title} →</Link>
              <span className="flex items-center gap-3 text-xs text-zinc-500">
                Made {nepalTime(s.createdAt)} · {s.topic.source === "DIRECTOR" ? "topic picked by AI" : "your idea"}
                <DeleteStoryButton storyId={s.id} title={s.topic.title} />
              </span>
            </div>
            {/* Nepali first, then English. */}
            <div className="grid gap-4 lg:grid-cols-2">
              {[...s.variants].sort((a, b) => (a.language === "ne" ? -1 : b.language === "ne" ? 1 : 0)).map((v) => (
                <VideoCard key={v.id} v={v} />
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Page buttons: only shown when there are more than 10 stories. */}
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={`/ready?show=${show}&page=${page - 1}`} className="rounded-lg px-3 py-1 ring-1 ring-zinc-200 hover:bg-zinc-100">← Newer</Link>}
          <span className="text-zinc-500">Page {page} of {pages}</span>
          {page < pages && <Link href={`/ready?show=${show}&page=${page + 1}`} className="rounded-lg px-3 py-1 ring-1 ring-zinc-200 hover:bg-zinc-100">Older →</Link>}
        </nav>
      )}

      <p className="mt-6 text-xs text-zinc-500">
        To save free storage, videos are deleted 7 days after you mark both languages as uploaded,
        and 30 days after they were made if you never mark them. The story text stays.
      </p>
    </>
  );
}

function VideoCard({ v }: { v: ReadyVariant }) {
  const lang = LANG[v.language];
  const hashtags = v.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  const fullText = [v.description, hashtags].filter(Boolean).join("\n\n");
  const hasVideo = Boolean(v.outputKey);
  const hasThumb = v.thumbnails.length > 0 && hasVideo;
  // Direct R2 address when there is one (fast); otherwise through the dashboard.
  const poster = v.thumbnailUrl ?? (hasThumb ? `/download/${v.id}/thumbnail?inline=1` : undefined);

  return (
    <div className={`rounded-xl border p-4 ${v.manualUploadedAt ? "border-emerald-300 bg-emerald-50/40" : "border-zinc-200"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${lang.color}`}>{lang.name}</span>
        <span className="text-xs text-zinc-500">{lang.where}</span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Preview: the thumbnail; press play to watch. Nothing downloads until you press play. */}
        <div className="mx-auto w-40 shrink-0">
          {hasVideo ? (
            <video
              controls
              preload="none"
              poster={poster}
              src={`/download/${v.id}/video?inline=1`}
              className="aspect-[9/16] w-full rounded-lg bg-zinc-900 object-cover"
            />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-zinc-100 p-2 text-center text-xs text-zinc-500">
              Video file deleted to save storage
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Field label="Title" text={v.title ?? ""} lang={v.language} big />
          <Field label="Description + hashtags" text={fullText} lang={v.language} />
          {v.durationSec != null && <p className="text-xs text-zinc-500">{Math.round(v.durationSec)} seconds · vertical 9:16</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hasVideo && (
          <a href={`/download/${v.id}/video`} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
            ⬇ Download {v.language === "ne" ? "Nepali" : "English"} video
          </a>
        )}
        {hasThumb && (
          <a href={`/download/${v.id}/thumbnail`} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
            Thumbnail
          </a>
        )}
        {hasVideo && v.subtitles.length > 0 && (
          <a href={`/download/${v.id}/srt`} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
            Subtitles (.srt)
          </a>
        )}
        <form action={setUploaded} className="ml-auto">
          <input type="hidden" name="variantId" value={v.id} />
          <input type="hidden" name="uploaded" value={v.manualUploadedAt ? "false" : "true"} />
          {v.manualUploadedAt ? (
            <span className="flex items-center gap-2 text-sm text-emerald-700">
              ✓ Uploaded {nepalTime(v.manualUploadedAt)}
              <button className="text-xs text-zinc-500 underline hover:text-zinc-800">Undo</button>
            </span>
          ) : (
            <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              Mark as uploaded
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function Field({ label, text, lang, big }: { label: string; text: string; lang: string; big?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-zinc-400">{label}</span>
        {text && <CopyButton text={text} />}
      </div>
      <p lang={lang} className={`whitespace-pre-line break-words ${big ? "font-semibold" : "max-h-32 overflow-y-auto text-sm text-zinc-700"}`}>
        {text || "—"}
      </p>
    </div>
  );
}
