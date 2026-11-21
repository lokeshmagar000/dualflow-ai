import Link from "next/link";
import { api, type ReadyPage as ReadyData } from "@/lib/api";
import { ApiError, EmptyState, LangBadge, PageHeader } from "@/components/ui";
import { IconChevronLeft, IconChevronRight, IconDownload } from "@/components/icons";

/**
 * Media library: every finished video and thumbnail as a picture grid.
 * Tap a picture to watch it; the button downloads the file.
 * (It uses the same data as Ready to upload, "All" tab, 10 stories = up to 20 videos per page.)
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ page?: string; lang?: string }> }) {
  const { page: rawPage, lang: rawLang } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);
  const lang = rawLang === "ne" || rawLang === "en" ? rawLang : null;
  let data: ReadyData;
  try {
    data = await api<ReadyData>(`/ready?show=all&page=${page}`);
  } catch (e) {
    return (<><PageHeader title="Media library" /><ApiError error={e} /></>);
  }
  // An older API answers with a plain list; handle both.
  const stories = Array.isArray(data) ? (data as unknown as ReadyData["stories"]) : Array.isArray(data?.stories) ? data.stories : [];
  const total = Array.isArray(data) ? stories.length : data.total ?? stories.length;
  const pages = Math.max(1, Math.ceil(total / ((!Array.isArray(data) && data.pageSize) || 10)));

  const tiles = stories.flatMap((s) =>
    (s.variants ?? []).filter((v) => !lang || v.language === lang).map((v) => ({ story: s, v })),
  );
  const href = (p: number, l: string | null = lang) => `/library?${new URLSearchParams({ ...(p > 1 ? { page: String(p) } : {}), ...(l ? { lang: l } : {}) })}`;

  return (
    <>
      <PageHeader title="Media library" subtitle="All finished videos and thumbnails. Tap a picture to watch, or download the file." />

      <nav aria-label="Language" className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {[{ k: null, label: "Both languages" }, { k: "ne", label: "नेपाली" }, { k: "en", label: "English" }].map((o) => {
          const active = lang === o.k;
          return (
            <Link key={o.label} href={href(1, o.k)} aria-current={active ? "page" : undefined}
              className={`flex h-9 shrink-0 items-center rounded-full border px-3.5 ${active ? "border-transparent bg-brand text-white" : "border-stroke bg-surface text-fg2 hover:bg-hover"}`}>
              {o.label}
            </Link>
          );
        })}
      </nav>

      {tiles.length === 0 ? (
        <EmptyState title="No finished videos yet">Videos appear here once they are made. New ones come after the 2 AM and 4 AM runs.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {tiles.map(({ story, v }) => {
            const hasVideo = Boolean(v.outputKey);
            const poster = v.thumbnailUrl ?? (hasVideo && (v.thumbnails?.length ?? 0) > 0 ? `/download/${v.id}/thumbnail?inline=1` : undefined);
            return (
              <li key={v.id} className="card flex flex-col overflow-hidden">
                {hasVideo ? (
                  <video controls preload="none" poster={poster} src={`/download/${v.id}/video?inline=1`}
                    className="aspect-[9/16] w-full bg-[#1f1f1f] object-cover" />
                ) : (
                  <div className="flex aspect-[9/16] w-full items-center justify-center bg-subtle p-3 text-center text-xs text-fg3">
                    File deleted to save storage
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-1">
                    <LangBadge lang={v.language} />
                    {v.durationSec != null && <span className="text-xs text-fg3">{Math.round(v.durationSec)} s</span>}
                  </div>
                  <Link href={`/content/${story.id}`} lang={v.language} className="line-clamp-2 font-semibold hover:text-brand-fg">
                    {v.title ?? story.topic?.title ?? "Untitled"}
                  </Link>
                  {hasVideo && (
                    <a href={`/download/${v.id}/video`} className="btn btn-sm mt-auto w-full" aria-label={`Download ${v.title ?? "video"}`}>
                      <IconDownload className="h-4 w-4" /> Download
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
          {page > 1 && <Link href={href(page - 1)} className="btn"><IconChevronLeft className="h-4 w-4" /> Newer</Link>}
          <span className="text-fg3">Page {page} of {pages}</span>
          {page < pages && <Link href={href(page + 1)} className="btn">Older <IconChevronRight className="h-4 w-4" /></Link>}
        </nav>
      )}
    </>
  );
}
