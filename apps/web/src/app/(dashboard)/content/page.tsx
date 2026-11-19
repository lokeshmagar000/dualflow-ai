import Link from "next/link";
import { LANGUAGE_LABELS } from "@dualflow/shared";
import { api, type Story } from "@/lib/api";
import { ApiError, Card, PageHeader, StatusBadge } from "@/components/ui";

// Each Story with its Nepali and English versions side by side.
export default async function ContentPage() {
  let stories: Story[] = [];
  try {
    stories = await api<Story[]>("/stories");
  } catch (e) {
    return (<><PageHeader title="Content" /><ApiError error={e} /></>);
  }

  return (
    <>
      <PageHeader title="Content" subtitle="Every story is made in Nepali and English together" />
      <div className="space-y-4">
        {stories.length === 0 && <Card><p className="text-sm text-zinc-500">No stories yet.</p></Card>}
        {stories.map((s) => (
          <Card key={s.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Link href={`/content/${s.id}`} className="font-semibold hover:text-brand-600">{s.topic.title} →</Link>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                {s.format.toLowerCase()} <StatusBadge status={s.status} />
              </span>
            </div>
            {s.lastError && <p className="mb-3 text-sm text-red-600">{s.lastError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {s.variants.map((v) => (
                <div key={v.id} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{LANGUAGE_LABELS[v.language]}</span>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="mt-3 flex aspect-[9/16] max-h-48 items-center justify-center rounded-lg bg-zinc-100 p-2 text-center text-xs text-zinc-400">
                    Video preview (Phase 1)
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
