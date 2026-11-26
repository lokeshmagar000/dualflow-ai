/**
 * NEPAL POLITICS: picks the topic of the next politics video for one series.
 *
 * - "News Explained": the AI must choose one of the REAL headlines we fetched from
 *   Google News (news.ts). It answers with the headline's number, so it cannot make
 *   up an event; the headline's link, paper and date are saved as the topic's sources.
 * - The other series (Today in History, PM Files ...): the AI suggests a topic, and the
 *   research step must then find at least 3 sources for it, or the video is not made.
 *
 * Costs: 1 Gemini request (free) or 1 small Claude request.
 */
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NEUTRAL_RULES, politicsSeries, type PoliticsSeriesId } from "@dualflow/shared";
import { claude, currentModel, fallbackOptions } from "./client";
import { claudeCost, type CostLine } from "./cost";
import { isMockAI } from "./mock";
import { aiProvider } from "./provider";
import { askGeminiJson } from "./gemini";
import type { NewsItem } from "./news";

export const PoliticsIdeaSchema = z.object({
  headline: z.number().int().describe("News Explained only: the number of the chosen headline from the list. Other series: 0"),
  title: z.string().describe("The video topic in English, 4-14 words, neutral wording, e.g. 'What Nepal and India discussed in the November 2026 PM meeting'"),
  notes: z.string().describe("Two sentences: the angle of the video (facts only) and the key facts to check"),
});
export type PoliticsIdea = z.infer<typeof PoliticsIdeaSchema>;

/** A source saved on the topic (Topic.sources). */
export type TopicSource = { title: string; url: string; publisher: string; publishedAt?: string };

const SYSTEM = `You are the politics desk editor of "Namaste Facts", a short-video channel in Nepali and English.
You choose ONE topic for the next 30-45 second vertical video of a Nepal politics series.
${NEUTRAL_RULES}
- Pick topics that are factual and easy to check: events, dates, numbers, rules, official statements.
- Never pick rumours, scandals that are not proven, personal attacks, or anything about violence in detail.
- Never repeat or closely copy a recent topic.`;

/** "26 November" in English, for Today in History. */
export function dayMonth(date: Date, timeZone = "Asia/Kathmandu"): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "long" }).format(date);
}

function prompt(series: PoliticsSeriesId, recentTitles: string[], news: NewsItem[], now: Date) {
  const s = politicsSeries(series)!;
  const recent = recentTitles.length ? recentTitles.map((t) => `- ${t}`).join("\n") : "(none yet)";
  const newsList = news
    .map((n, i) => `${i + 1}. ${n.title} (${n.publisher || "news"}, ${n.publishedAt.toISOString().slice(0, 10)}${n.coverage ? `, covered by ${n.coverage} paper(s)` : ""})`)
    .join("\n");
  return `Series: ${s.nameEn}
What this series makes: ${s.brief}
Today's date: ${dayMonth(now)} ${now.getUTCFullYear()} (Nepal time).
${s.needsNews ? `\nReal Nepal news headlines from the last few days, MOST TRENDING FIRST (choose ONE by its number; the video may only talk about this news):\n${newsList}\n` : ""}
Recent videos (do NOT repeat these or make something very similar):
${recent}

Pick the topic for the next video.`;
}

const PRACTICE: Record<PoliticsSeriesId, string> = {
  "news-explained": "Practice: what the latest Nepal politics headline is about",
  "today-in-history": "Practice: the Constitution of Nepal was promulgated on 20 September 2015",
  "pm-files": "Practice: how many prime ministers Nepal has had since 1990",
  "constitution-60": "Practice: Article 1 to 9 of Nepal's Constitution in simple words",
  "politics-in-numbers": "Practice: 275 seats in Nepal's House of Representatives explained",
  "politics-quiz": "Practice quiz: how many provinces does Nepal have?",
};

export async function suggestPoliticsTopic(input: {
  series: PoliticsSeriesId;
  recentTitles: string[];
  news?: NewsItem[];
  now?: Date;
}): Promise<{ idea: { title: string; notes: string }; sources: TopicSource[]; costs: CostLine[] }> {
  const series = politicsSeries(input.series);
  if (!series) throw new Error(`Unknown politics series "${input.series}".`);
  const news = (input.news ?? []).slice(0, 25);
  if (series.needsNews && news.length === 0) throw new Error("No recent Nepal politics news was found, so News Explained cannot be made now.");
  const now = input.now ?? new Date();

  let idea: PoliticsIdea;
  const costs: CostLine[] = [];
  if (isMockAI()) {
    idea = { headline: series.needsNews ? 1 : 0, title: series.needsNews ? `Explained: ${news[0]!.title}` : PRACTICE[series.id], notes: "Practice topic (AI_PROVIDER=mock)." };
  } else if (aiProvider() === "gemini") {
    const { value, cost } = await askGeminiJson(PoliticsIdeaSchema, { system: SYSTEM, prompt: prompt(series.id, input.recentTitles, news, now) });
    idea = value;
    costs.push(cost);
  } else {
    const model = currentModel();
    const res = await claude().beta.messages.parse({
      model,
      max_tokens: 2000,
      ...fallbackOptions(),
      output_config: { effort: "low", format: betaZodOutputFormat(PoliticsIdeaSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt(series.id, input.recentTitles, news, now) }],
    });
    if (!res.parsed_output) throw new Error("Could not read the politics topic from the model.");
    idea = res.parsed_output;
    costs.push(claudeCost(model, res.usage));
  }

  const sources: TopicSource[] = [];
  let notes = idea.notes;
  if (series.needsNews) {
    const picked = news[idea.headline - 1];
    if (!picked) throw new Error(`The AI chose headline ${idea.headline}, which is not in the list. Will try again next run.`);
    sources.push({ title: picked.title, url: picked.url, publisher: picked.publisher, publishedAt: picked.publishedAt.toISOString() });
    // Other papers on the same story help the research step check the facts.
    const words = new Set(picked.title.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
    for (const n of news) {
      if (n === picked || sources.length >= 4) continue;
      const shared = n.title.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length;
      if (shared >= 2) sources.push({ title: n.title, url: n.url, publisher: n.publisher, publishedAt: n.publishedAt.toISOString() });
    }
    notes = `${notes}\nReal news this video is about: "${picked.title}" (${picked.publisher}, ${picked.publishedAt.toISOString().slice(0, 10)}).`;
  }
  return { idea: { title: idea.title.slice(0, 200), notes }, sources, costs };
}
