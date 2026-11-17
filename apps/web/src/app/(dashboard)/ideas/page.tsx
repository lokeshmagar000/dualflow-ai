import { api, type Topic } from "@/lib/api";
import { ApiError, Card, PageHeader } from "@/components/ui";
import { addTopic, makeVideo } from "./actions";

export default async function IdeasPage() {
  let topics: Topic[] = [];
  try {
    topics = await api<Topic[]>("/topics");
  } catch (e) {
    return (<><PageHeader title="Ideas & Chat" /><ApiError error={e} /></>);
  }

  return (
    <>
      <PageHeader title="Ideas & Chat" subtitle="Add your own ideas. The AI chat assistant arrives in Phase 1." />

      <Card className="mb-6">
        <form action={addTopic} className="space-y-3">
          <input name="title" required minLength={3} maxLength={200} placeholder="Video idea, e.g. Why Nepal's tea is famous"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-brand-500" />
          <textarea name="notes" rows={2} maxLength={2000} placeholder="Notes (optional)"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-brand-500" />
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Add idea</button>
        </form>
      </Card>

      <Card className="divide-y divide-zinc-100 p-0">
        {topics.length === 0 && <p className="p-5 text-sm text-zinc-500">No ideas yet.</p>}
        {topics.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div>
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-xs text-zinc-500">{t.source.toLowerCase()} · {t.status.toLowerCase()}</p>
            </div>
            {t.status !== "USED" && (
              <form action={makeVideo} className="flex gap-2">
                <input type="hidden" name="topicId" value={t.id} />
                <select name="format" className="rounded-lg border border-zinc-300 px-2 py-1 text-sm">
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                </select>
                <button className="rounded-lg bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700">Make NE + EN video</button>
              </form>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}
