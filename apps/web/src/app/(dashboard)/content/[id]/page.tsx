import Link from "next/link";
import { LANGUAGE_LABELS } from "@dualflow/shared";
import { api, type StoryDetail } from "@/lib/api";
import { ApiError, Card, PageHeader, StatusBadge } from "@/components/ui";
import { retryStory } from "../actions";

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
      <Link href="/content" className="text-sm text-zinc-500 hover:text-zinc-800">← All content</Link>
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
                <ol className="mt-4 space-y-3">
                  {v.scenes.map((s) => (
                    <li key={s.id} className="rounded-lg bg-zinc-50 p-3">
                      <p className="mb-1 text-xs font-medium uppercase text-zinc-400">{s.order}. {s.purpose?.replace(/_/g, " ")}</p>
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
