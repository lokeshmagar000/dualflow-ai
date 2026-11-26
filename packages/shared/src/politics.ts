/**
 * NEPAL NEWS & POLITICS series (a category of videos, turned on from the Ideas page).
 * "News Explained" follows whatever Nepal news is TRENDING (not only politics).
 *
 * Rules for every politics video (the owner asked for these, 2026-11-26):
 *   1. Strictly NEUTRAL: say what happened, never if it was good or bad.
 *   2. Every fact comes from a reliable source (Election Commission, the constitution,
 *      parliament, major news). The sources are saved and shown small on screen.
 *   3. Balance: no party gets more praise or blame than another.
 *   4. Never uploaded by the robot: a politics video always waits for the owner's approval,
 *      even when Auto upload is "Fully automatic".
 *   5. News topics come from REAL recent news (Google News), never from the AI's memory.
 */

/** The value saved on Topic.category for politics videos. */
export const POLITICS_CATEGORY = "politics";

export type PoliticsSeriesId = "news-explained" | "today-in-history" | "pm-files" | "constitution-60" | "politics-in-numbers" | "politics-quiz";

export type PoliticsSeries = {
  id: PoliticsSeriesId;
  /** Shown on the dashboard and as the small chip at the top of the video. */
  nameEn: string;
  nameNe: string;
  /** One line for the dashboard. */
  about: string;
  /** true = the topic must come from real news of the last few days. */
  needsNews: boolean;
  /** What the AI must make for this series (added to the topic prompt). */
  brief: string;
};

export const POLITICS_SERIES: PoliticsSeries[] = [
  {
    id: "news-explained",
    nameEn: "News Explained",
    nameNe: "समाचार बुझौँ",
    about: "Nepal's most TRENDING news right now (politics or any big event): what happened, the background, the facts. No opinion.",
    needsNews: true,
    brief:
      "Pick the most TRENDING headline below that suits a neutral fact video (the list is ordered by how many papers cover it). It can be politics, foreign relations, economy, sport, weather or any big event in Nepal. Skip rumours, crime victims' details and graphic tragedies. The video explains WHAT happened (who, when, where), the background facts a viewer needs, and what official sources say happens next. Never guess anything the news does not say.",
  },
  {
    id: "today-in-history",
    nameEn: "Today in History",
    nameNe: "आजको इतिहास",
    about: "A political event in Nepal's history that happened on today's date.",
    needsNews: false,
    brief:
      "Pick ONE well-documented political event in Nepal's history that happened on TODAY'S date (day and month given below), e.g. a constitution, an election, a treaty, a change of government. Put the year and the date in the title. Only pick an event whose date you are sure of; it will be checked against sources.",
  },
  {
    id: "pm-files",
    nameEn: "PM Files",
    nameNe: "PM फाइल",
    about: "One prime minister of Nepal per video: years in office, key dates, records.",
    needsNews: false,
    brief:
      "Pick ONE prime minister of Nepal (past or present, from any party, never one used recently) and make a fact file: when and how many times they served, how they came to office, records and firsts. Facts only, no judgement of their work. Rotate across parties and eras.",
  },
  {
    id: "constitution-60",
    nameEn: "Constitution in 60s",
    nameNe: "संविधान ६० सेकेन्डमा",
    about: "One part or right in Nepal's Constitution (2015), explained simply.",
    needsNews: false,
    brief:
      "Pick ONE article, part or schedule of the Constitution of Nepal (2015) and explain what it says in simple words, with its article number. E.g. fundamental rights, the 7 provinces, how the President is elected, the national flag. Quote the article number; never interpret it politically.",
  },
  {
    id: "politics-in-numbers",
    nameEn: "Politics in Numbers",
    nameNe: "नम्बरमा राजनीति",
    about: "Surprising numbers: seats, voters, provinces, budgets, from official data.",
    needsNews: false,
    brief:
      "Pick ONE set of official numbers about Nepal's political system, e.g. seats in the House of Representatives and National Assembly, number of voters, provinces and local levels, women in parliament, voter turnout. Numbers must come from the Election Commission, parliament or the constitution.",
  },
  {
    id: "politics-quiz",
    nameEn: "Politics Quiz",
    nameNe: "राजनीति क्विज",
    about: "A quick quiz question about Nepal's political system; the answer comes at the end.",
    needsNews: false,
    brief:
      "Make ONE quiz question about Nepal's political system or history that most viewers get wrong, e.g. 'How many members does the House of Representatives have?'. The hook asks the question, the facts give clues, the payoff gives the answer. Neutral facts only.",
  },
];

export const POLITICS_SERIES_IDS = POLITICS_SERIES.map((s) => s.id);

export function politicsSeries(id: string | null | undefined): PoliticsSeries | undefined {
  return POLITICS_SERIES.find((s) => s.id === id);
}

/** Rules added to every research and script prompt of a politics video. */
export const NEUTRAL_RULES = `THIS IS A NEPAL POLITICS VIDEO. Strict rules:
- Be strictly NEUTRAL, like a public-service news explainer. Report facts; never say if something is good, bad, right, wrong, historic, shameful, brave, corrupt, failed or successful.
- Attribute every claim to its source ("according to the Election Commission", "the Kathmandu Post reported").
- Never predict, never give an opinion, never take a side, never use loaded or emotional words.
- Treat every party and every politician the same way: same tone, same kind of facts. Use official titles and full names.
- Only facts that the sources support. Never invent quotes, numbers, dates, agreements or meetings. If sources disagree, say so.
- No rumours, no "sources say", no social-media claims.`;

/**
 * Judgement words that must not appear in a politics script (lower case).
 * Checked after the script is written; a hit asks the AI to write it again, neutrally.
 */
export const JUDGEMENT_WORDS = [
  // English
  "corrupt", "shameful", "disgrace", "disaster", "brilliant", "heroic", "hero", "villain", "traitor", "betray",
  "failed", "failure", "useless", "incompetent", "best prime minister", "worst", "greatest", "terrible",
  "amazing leader", "puppet", "dictator", "liar", "scam", "historic mistake", "slammed", "blasted",
  // Nepali
  "भ्रष्ट", "लाजमर्दो", "गद्दार", "देशद्रोही", "असफल", "नालायक", "महान नेता", "उत्कृष्ट प्रधानमन्त्री", "सबैभन्दा खराब",
  "कठपुतली", "तानाशाह", "झुटो", "घोटालेबाज",
];

/** The judgement words found in a text (empty = neutral enough). */
export function judgementWordsIn(text: string): string[] {
  const t = text.toLowerCase();
  return JUDGEMENT_WORDS.filter((w) => {
    if (/[ऀ-ॿ]/.test(w)) return t.includes(w);
    return new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`, "i").test(t);
  });
}

/** Friendly names for well-known source websites (shown small in the video). */
const SOURCE_NAMES: Record<string, string> = {
  "election.gov.np": "Election Commission Nepal",
  "parliament.gov.np": "Federal Parliament of Nepal",
  "lawcommission.gov.np": "Nepal Law Commission",
  "opmcm.gov.np": "Office of the PM, Nepal",
  "mofa.gov.np": "Ministry of Foreign Affairs, Nepal",
  "mea.gov.in": "Ministry of External Affairs, India",
  "pmindia.gov.in": "PM India",
  "kathmandupost.com": "The Kathmandu Post",
  "myrepublica.nagariknetwork.com": "Republica",
  "nagariknetwork.com": "Nagarik",
  "risingnepaldaily.com": "The Rising Nepal",
  "gorkhapatraonline.com": "Gorkhapatra",
  "ekantipur.com": "Kantipur",
  "onlinekhabar.com": "Onlinekhabar",
  "english.onlinekhabar.com": "Onlinekhabar",
  "setopati.com": "Setopati",
  "nepalitimes.com": "Nepali Times",
  "himalkhabar.com": "Himal Khabar",
  "thehimalayantimes.com": "The Himalayan Times",
  "reuters.com": "Reuters",
  "apnews.com": "AP",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "aljazeera.com": "Al Jazeera",
  "thehindu.com": "The Hindu",
  "indianexpress.com": "The Indian Express",
  "hindustantimes.com": "Hindustan Times",
  "business-standard.com": "Business Standard",
  "usnews.com": "US News",
  "britannica.com": "Britannica",
  "wikipedia.org": "Wikipedia",
  "en.wikipedia.org": "Wikipedia",
};

/** "https://www.kathmandupost.com/x" or "kathmandupost.com" -> "The Kathmandu Post". */
export function sourceName(urlOrDomain: string, title?: string): string | null {
  let host = urlOrDomain.trim().toLowerCase();
  try {
    if (/^https?:\/\//.test(host)) host = new URL(host).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  // Gemini's search links go through Google ("vertexaisearch..."): the page title is the real site.
  if (/vertexaisearch|google\./.test(host)) return title ? sourceName(title) : null;
  if (SOURCE_NAMES[host]) return SOURCE_NAMES[host]!;
  const parent = host.split(".").slice(-2).join(".");
  if (SOURCE_NAMES[parent]) return SOURCE_NAMES[parent]!;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

/**
 * The small "Source:" line in the video: the 1-3 most used sources, official ones first.
 * `sources` = URLs, domains or publisher names.
 */
export function sourceLine(language: "ne" | "en", sources: { url?: string | null; title?: string | null; publisher?: string | null }[], max = 3): string {
  const count = new Map<string, number>();
  for (const s of sources) {
    const name = s.publisher?.trim() || (s.url ? sourceName(s.url, s.title ?? undefined) : null) || (s.title ? sourceName(s.title) : null);
    if (!name) continue;
    count.set(name, (count.get(name) ?? 0) + 1);
  }
  const official = (n: string) => /commission|parliament|ministry|office of the pm|pm india|law commission/i.test(n);
  const names = [...count.entries()]
    .sort((a, b) => Number(official(b[0])) - Number(official(a[0])) || b[1] - a[1])
    .slice(0, max)
    .map(([n]) => n);
  if (names.length === 0) return "";
  return `${language === "ne" ? "स्रोत" : "Source"}: ${names.join(" · ")}`;
}

/**
 * Which series comes next: the enabled one used longest ago (never used = first).
 * `lastUsed` maps series id -> when its last video was made.
 */
export function nextSeries(enabled: string[], lastUsed: Record<string, Date | undefined>, skip: string[] = []): PoliticsSeriesId | null {
  const ids = POLITICS_SERIES_IDS.filter((id) => enabled.includes(id) && !skip.includes(id));
  if (ids.length === 0) return null;
  return [...ids].sort((a, b) => (lastUsed[a]?.getTime() ?? 0) - (lastUsed[b]?.getTime() ?? 0))[0]!;
}

/** Dashboard settings (saved as AppSetting rows). */
export const POLITICS_SETTING_KEYS = {
  enabled: "politics.enabled",
  series: "politics.series",
  perDay: "politics.perDay",
} as const;

export const DEFAULT_POLITICS_SERIES: PoliticsSeriesId[] = ["news-explained", "today-in-history", "pm-files", "constitution-60", "politics-in-numbers"];
