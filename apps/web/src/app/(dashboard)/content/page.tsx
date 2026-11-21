import Link from "next/link";
import { api, type Story } from "@/lib/api";
import { nepaliFirst, ApiError, Card, EmptyState, LangBadge, PageHeader, StatusBadge } from "@/components/ui";
import { nepalTime } from "@/components/UploadStatus";
import { IconChevronRight } from "@/components/icons";

/** Filter buttons at the top. Each one shows stories with these statuses. */
const FILTERS = [
  { key: "all", label: "All", statuses: null },
  { key: "making", label: "Being made", statuses: ["DRAFT", "GENERATING"] },
  { key: "ready", label: "Ready", statuses: ["READY", "APPROVED", "SCHEDULED"] },
  { key: "uploaded", label: "Uploaded", statuses: ["PUBLISHED"] },
  { key: "failed", label: "Failed", statuses: ["FAILED"] },
] as const;

// Every story (one topic, made in Nepali and English together), newest first.
export default async function ContentPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];
  let stories: Story[] = [];
  try {
    stories = await api<Story[]>("/stories");
  } catch (e) {
    return (<><PageHeader title="All videos" /><ApiError error={e} /></>);
  }
  stories = Array.isArray(stories) ? stories : [];
  const visible = filter.statuses ? stories.filter((s) => (filter.statuses as readonly string[]).includes(s.status)) : stories;
  const countFor = (f: (typeof FILTERS)[number]) => (f.statuses ? stories.filter((s) => (f.statuses as readonly string[]).includes(s.status)).length : stories.length);

  return (
    <>
      <PageHeader title="All videos" subtitle="Every story is made in Nepali and English together. Open one to read the script, listen to the voice or delete it." />

      <nav aria-label="Filter" className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const active = f.key === filter.key;
          return (
            <Link key={f.key} href={f.key === "all" ? "/content" : `/content?show=${f.key}`} aria-current={active ? "page" : undefined}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 ${active ? "border-transparent bg-brand text-white" : "border-stroke bg-surface text-fg2 hover:bg-hover"}`}>
              {f.label} <span className={active ? "text-white/80" : "text-fg4"}>{countFor(f)}</span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <EmptyState title={stories.length === 0 ? "No videos yet" : "Nothing here"}
          action={stories.length === 0 ? <Link href="/ideas" className="btn btn-primary">Go to Ideas & auto mode</Link> : undefined}>
          {stories.length === 0 ? "Add an idea or turn on auto mode, and the first story shows up here." : "No story has this status right now."}
        </EmptyState>
      ) : (
        <Card flush>
          <ul className="divide-y divide-stroke">
            {visible.map((s) => (
              <li key={s.id}>
                <Link href={`/content/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{s.topic?.title ?? "Untitled"}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg3">
                      <span>{s.format === "LONG" ? "Long video" : "Short video"}</span>
                      <span>{nepalTime(s.createdAt)}</span>
                      {nepaliFirst(s.variants).map((v) => (
                        <span key={v.id} className="flex items-center gap-1"><LangBadge lang={v.language} /><StatusBadge status={v.status} /></span>
                      ))}
                    </div>
                    {s.lastError && <p className="mt-1 line-clamp-2 text-xs text-bad">{s.lastError}</p>}
                  </div>
                  <IconChevronRight className="shrink-0 text-fg4" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {stories.length >= 50 && <p className="mt-3 text-xs text-fg3">Showing the newest 50 stories.</p>}
    </>
  );
}
