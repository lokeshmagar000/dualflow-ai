import Link from "next/link";
import { api, type AutoStatus, type CostSummary, type Story } from "@/lib/api";
import { nepaliFirst, ApiError, Card, EmptyState, LangBadge, PageHeader, SectionTitle, Stat, StatusBadge } from "@/components/ui";
import { nepalTime } from "@/components/UploadStatus";
import { IconChevronRight, IconDownload, IconSparkle } from "@/components/icons";

// Home: what happens next, what is waiting for you, and the newest videos.
export default async function HomePage() {
  let stories: Story[] = [];
  let costs: CostSummary;
  let auto: AutoStatus | null = null;
  try {
    // The automatic-videos part is optional: an older API simply has no /auto.
    [stories, costs, auto] = await Promise.all([
      api<Story[]>("/stories"),
      api<CostSummary>("/costs/summary"),
      api<AutoStatus>("/auto").catch(() => null),
    ]);
  } catch (e) {
    return (<><PageHeader title="Home" /><ApiError error={e} /></>);
  }
  stories = Array.isArray(stories) ? stories : [];

  const daily = costs.budgets?.find((b) => b.period === "DAILY")?.capUsd;
  const count = (s: string) => stories.filter((x) => x.status === s).length;
  const waitingUpload = count("READY");

  return (
    <>
      <PageHeader title="Home" subtitle="Your Nepali + English video studio at a glance." />

      <NextRunCard auto={auto} paused={costs.paused} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Being made" value={count("GENERATING") + count("DRAFT")} href="/content" />
        <Stat label="Ready to upload" value={waitingUpload} href="/ready" />
        <Stat label="Uploaded" value={count("PUBLISHED")} href="/calendar" />
        <Stat label="Spend today" value={`$${(costs.todayUsd ?? 0).toFixed(2)}`}
          note={costs.paused ? "Automation paused" : daily ? `Daily cap $${daily}` : "Free plan"} tone={costs.paused ? "bad" : undefined} href="/costs" />
      </div>

      <SectionTitle action={<Link href="/content" className="link flex items-center gap-1">All videos <IconChevronRight className="h-4 w-4" /></Link>}>
        Newest videos
      </SectionTitle>
      {stories.length === 0 ? (
        <EmptyState title="No videos yet"
          action={<Link href="/ideas" className="btn btn-primary"><IconSparkle className="h-4 w-4" /> Add an idea or turn on auto mode</Link>}>
          Videos appear here as soon as the first one starts.
        </EmptyState>
      ) : (
        <Card flush>
          <ul className="divide-y divide-stroke">
            {stories.slice(0, 6).map((s) => (
              <li key={s.id}>
                <Link href={`/content/${s.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-hover sm:px-5">
                  <span className="min-w-0 basis-full font-semibold sm:basis-auto sm:flex-1">{s.topic?.title ?? "Untitled"}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {nepaliFirst(s.variants).map((v) => (
                      <span key={v.id} className="flex items-center gap-1"><LangBadge lang={v.language} /><StatusBadge status={v.status} /></span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/**
 * The top card: when the next automatic videos come, and the two buttons you need most.
 * The thin crimson + blue line on top stands for the two languages made together.
 */
function NextRunCard({ auto, paused }: { auto: AutoStatus | null; paused: boolean }) {
  const on = auto?.enabled && !paused;
  const next = auto?.nextRuns?.[0];
  return (
    <section className="card relative overflow-hidden p-5 sm:p-6">
      <div aria-hidden className="absolute inset-x-0 top-0 flex h-1">
        <span className="flex-1 bg-ne" />
        <span className="flex-1 bg-en" />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-fg3">{on ? "Next automatic videos" : "Automatic videos"}</p>
          <p className="mt-1 text-[28px] font-semibold leading-9 sm:text-[32px] sm:leading-10">
            {paused ? "Paused" : !auto ? "Every night, 2 AM and 4 AM" : on && next ? nepalTime(next) : "Auto mode is off"}
          </p>
          <p className="mt-1 text-fg3">
            {paused
              ? "The kill switch on Costs & limits stops all automation."
              : on
                ? `Nepal time. Each run makes one story in both languages (${auto?.perDay ?? 2} a day).`
                : "Turn it on and the AI picks topics and makes videos while you sleep."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/ideas" className="btn"><IconSparkle className="h-4 w-4" /> {on ? "Ideas & auto mode" : "Turn on auto mode"}</Link>
          <Link href="/ready" className="btn btn-primary"><IconDownload className="h-4 w-4" /> Ready to upload</Link>
        </div>
      </div>
    </section>
  );
}
