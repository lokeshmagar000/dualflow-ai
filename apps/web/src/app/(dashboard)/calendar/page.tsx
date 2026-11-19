import Link from "next/link";
import { api, type QueueItem } from "@/lib/api";
import { ApiError, Card, PageHeader } from "@/components/ui";
import { UploadStatus, nepalTime } from "@/components/UploadStatus";
import { retryUpload } from "../content/publish-actions";

// The upload queue: every video waiting to go to a channel, in time order (Nepal time).
export default async function CalendarPage() {
  let items: QueueItem[];
  try {
    items = await api<QueueItem[]>("/publications");
  } catch (e) {
    return (<><PageHeader title="Upload queue" /><ApiError error={e} /></>);
  }
  const groups: [string, QueueItem[]][] = [
    ["Waiting for your approval", items.filter((i) => i.status === "READY")],
    ["Failed (needs a look)", items.filter((i) => i.status === "FAILED")],
    ["Coming up", items.filter((i) => i.status === "SCHEDULED" || i.status === "GENERATING")],
    ["Uploaded", items.filter((i) => i.status === "PUBLISHED").reverse().slice(0, 50)],
  ];
  return (
    <>
      <PageHeader title="Upload queue" subtitle="Each channel gets at most one video per upload time. Times are Nepal time." />
      {items.length === 0 && <Card><p className="text-sm text-zinc-500">Nothing in the queue yet. Finished videos appear here when publishing is turned on (see Channels).</p></Card>}
      <div className="space-y-6">
        {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
          <Card key={title}>
            <h2 className="mb-3 font-semibold">{title} ({list.length})</h2>
            <ul className="divide-y divide-zinc-100 text-sm">
              {list.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-40 text-zinc-500">{nepalTime(i.status === "PUBLISHED" ? i.publishedAt : i.scheduledAt)}</span>
                  <span className="w-44 font-medium">{i.channel.name}</span>
                  <Link href={`/content/${i.variant.story.id}`} lang={i.variant.language} className="flex-1 hover:underline">
                    {i.variant.title ?? i.variant.story.topic.title}
                  </Link>
                  <UploadStatus status={i.status} />
                  {i.postUrl && <a href={i.postUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">open</a>}
                  {i.status === "FAILED" && (
                    <form action={retryUpload}>
                      <input type="hidden" name="publicationId" value={i.id} />
                      <button className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700">Try again</button>
                    </form>
                  )}
                  {i.error && <p className="w-full text-xs text-zinc-500">{i.error}</p>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
