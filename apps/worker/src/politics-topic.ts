/**
 * NEPAL POLITICS: makes the topic of the next politics video (used by auto-ideas.ts).
 *
 * Which series: the one you asked for ("Generate now" on the Ideas page), otherwise the
 * switched-on series used longest ago. "News Explained" reads real news from Google News
 * first; if there is none (or Google cannot be reached) the next series is tried.
 */
import { prisma, Prisma } from "@dualflow/db";
import {
  DEFAULT_POLITICS_SERIES,
  nextSeries,
  POLITICS_CATEGORY,
  POLITICS_SERIES_IDS,
  POLITICS_SETTING_KEYS,
  politicsSeries,
  type PoliticsSeriesId,
} from "@dualflow/shared";
import { fetchNepalPoliticsNews, suggestPoliticsTopic, type NewsItem } from "@dualflow/ai";

export type PoliticsSettings = { enabled: boolean; series: PoliticsSeriesId[]; perDay: number };

/** Read the dashboard's politics settings (AppSetting rows). Nothing saved = off. */
export async function politicsSettings(workspaceId: string): Promise<PoliticsSettings> {
  const rows = await prisma.appSetting.findMany({ where: { workspaceId, key: { startsWith: "politics." } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const series = (get(POLITICS_SETTING_KEYS.series)?.split(",") ?? DEFAULT_POLITICS_SERIES).filter((id): id is PoliticsSeriesId =>
    (POLITICS_SERIES_IDS as string[]).includes(id),
  );
  return {
    enabled: get(POLITICS_SETTING_KEYS.enabled) === "true",
    series,
    perDay: Math.max(0, Math.min(2, Number(get(POLITICS_SETTING_KEYS.perDay) ?? 1) || 0)),
  };
}

/**
 * Is the day's next video a politics one? The LAST `politicsPerDay` videos of the day are.
 * Example: 2 videos a day, 1 politics -> video 1 normal, video 2 politics.
 */
export function isPoliticsTurn(opts: { videoNumber: number; perDay: number; politicsPerDay: number }): boolean {
  if (opts.politicsPerDay <= 0) return false;
  return opts.videoNumber > Math.max(0, opts.perDay - opts.politicsPerDay);
}

/**
 * Create the Topic for a politics video. `wanted` = a series id, or undefined/"auto" for the next one.
 * Returns null (with a log line) when no series could make a topic now.
 */
export async function createPoliticsTopic(workspaceId: string, settings: PoliticsSettings, wanted?: string) {
  const forced = politicsSeries(wanted)?.id;
  const enabled = forced ? [forced] : settings.series.length ? settings.series : DEFAULT_POLITICS_SERIES;

  // When was each series used last?
  const last = await prisma.topic.groupBy({
    by: ["series"],
    where: { workspaceId, category: POLITICS_CATEGORY },
    _max: { createdAt: true },
  });
  const lastUsed: Record<string, Date | undefined> = {};
  for (const r of last) if (r.series) lastUsed[r.series] = r._max.createdAt ?? undefined;

  const recent = await prisma.topic.findMany({
    where: { workspaceId, category: POLITICS_CATEGORY },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { title: true },
  });

  let news: NewsItem[] | null = null;
  const skip: string[] = [];
  for (let tries = 0; tries < 3; tries++) {
    const series = nextSeries(enabled, lastUsed, skip);
    if (!series) break;
    const info = politicsSeries(series)!;
    try {
      if (info.needsNews) {
        news ??= await fetchNepalPoliticsNews();
        console.log(`Politics: ${news.length} recent news headline(s) found.`);
      }
      const { idea, sources, costs } = await suggestPoliticsTopic({
        series,
        recentTitles: recent.map((t) => t.title),
        news: news ?? [],
      });
      if (costs.length) await prisma.costEvent.createMany({ data: costs.map((c) => ({ workspaceId, ...c })) });
      const topic = await prisma.topic.create({
        data: {
          workspaceId,
          title: idea.title,
          notes: idea.notes,
          source: info.needsNews ? "TREND" : "DIRECTOR",
          category: POLITICS_CATEGORY,
          series,
          sources: sources.length ? (sources as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      console.log(`Politics topic (${info.nameEn}): "${topic.title}"`);
      return topic;
    } catch (err) {
      console.warn(`Politics: ${info.nameEn} could not make a topic (${(err as Error).message}).`);
      skip.push(series);
      if (forced) break;
    }
  }
  return null;
}
