import Link from "next/link";
import { api, type QueueItem } from "@/lib/api";
import { ApiError, EmptyState, LangBadge, PageHeader } from "@/components/ui";
import { UploadStatus, nepalTime } from "@/components/UploadStatus";
import { ActionButton } from "@/components/ActionButton";
import { retryUpload } from "../content/publish-actions";

// The upload queue: every video waiting to go to a channel, in time order (Nepal time).
export default async function CalendarPage() {
  let items: QueueItem[];
  try {
    items = await api<QueueItem[]>("/publications");
  } catch (e) {
    return (<><PageHeader title="Upload queue" /><ApiError error={e} /></>);
  }
  items = Array.isArray(items) ? items : [];
  const groups: [string, QueueItem[]][] = [
    ["Waiting for your approval", items.filter((i) => i.status === "READY")],
    ["Failed, needs a look", items.filter((i) => i.status === "FAILED")],
    ["Coming up", items.filter((i) => i.status === "SCHEDULED" || i.status === "GENERATING")],
    ["Uploaded", items.filter((i) => i.status === "PUBLISHED").reverse().slice(0, 50)],
  ];
  return (
    <>
      <PageHeader title="Upload queue" subtitle="Automatic uploads to your channels. Each channel gets at most one video per upload time. Times are Nepal time." />
      {items.length === 0 && (
        <EmptyState title="The queue is empty"
          action={<Link href="/ready" className="btn btn-primary">Go to Ready to upload</Link>}>
          Automatic uploads are off for now, so you upload by hand from Ready to upload. When you turn them on (see Channels), finished videos line up here.
        </EmptyState>
      )}
      <div className="space-y-5">
        {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
          <section key={title} className="card overflow-hidden">
            <h2 className="px-4 py-3 text-base font-semibold sm:px-5">{title} ({list.length})</h2>
            <ul className="divide-y divide-stroke border-t border-stroke">
              {list.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
                  <span className="w-36 shrink-0 text-fg3">{nepalTime(i.status === "PUBLISHED" ? i.publishedAt : i.scheduledAt)}</span>
                  <span className="flex shrink-0 items-center gap-1.5 font-semibold">{i.channel?.name} <LangBadge lang={i.channel?.language ?? i.variant.language} /></span>
                  <Link href={`/content/${i.variant.story.id}`} lang={i.variant.language} className="link min-w-0 flex-1 truncate">
                    {i.variant.title ?? i.variant.story.topic.title}
                  </Link>
                  <UploadStatus status={i.status} />
                  {i.postUrl && <a href={i.postUrl} target="_blank" rel="noopener noreferrer" className="link">Open post</a>}
                  {i.status === "FAILED" && (
                    <ActionButton action={retryUpload} fields={{ publicationId: i.id }} label="Try again" pendingLabel="Retrying…" className="btn btn-sm btn-danger" />
                  )}
                  {i.error && <p className="w-full break-words text-xs text-fg3">{i.error}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
