/**
 * Trending hashtags for one video, in its language.
 *
 * How it works:
 *   1. Gemini searches Google for what people use RIGHT NOW on YouTube Shorts,
 *      TikTok and Instagram Reels for this topic (Google Search grounding, free tier).
 *   2. We mix those with the script's own hashtags and the channel's brand tags.
 *   3. We clean them (no spaces or symbols), remove repeats and keep 15 at most.
 *
 * Order matters: YouTube shows the FIRST 3 hashtags above the title, so the
 * strongest topic tags go first, then the brand, then the rest.
 * If the search fails or today's free limit is used up, the video still gets
 * the script's hashtags + brand tags (it never stops a video).
 *
 * Setting: HASHTAG_SEARCH=off turns the Google search off (saves 1 Gemini request per video).
 */
import { brandFor, type Language } from "@dualflow/shared";
import type { CostLine } from "./cost";
import { askGemini } from "./gemini";
import { aiProvider } from "./provider";

export const MAX_HASHTAGS = 15;

/** Common, always-useful tags for each language (used last, to fill up). */
const EVERGREEN: Record<Language, string[]> = {
  en: ["facts", "didyouknow", "learnsomethingnew"],
  ne: ["nepal", "नेपाल", "nepalifacts", "रोचकतथ्य"],
};

/** Make one hashtag safe: no "#", no spaces or symbols (letters of any script, digits and _ only). */
export function cleanTag(tag: string): string {
  return tag.normalize("NFC").replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
}

/** Find all #hashtags in Gemini's answer. */
export function parseHashtags(text: string): string[] {
  return [...text.normalize("NFC").matchAll(/#([\p{L}\p{M}\p{N}_]+)/gu)].map((m) => m[1]!);
}

/**
 * Join the lists in this order: 2 best trending tags, brand tags, other trending tags,
 * script tags, evergreen tags. No repeats (ignoring capital letters), 15 at most.
 */
export function mergeHashtags(opts: {
  language: Language;
  format: "SHORT" | "LONG";
  trending: string[];
  script: string[];
  brand: string[];
  max?: number;
}): string[] {
  const { trending } = opts;
  const order = [
    ...trending.slice(0, 2),
    ...opts.brand,
    ...(opts.format === "SHORT" ? ["shorts"] : []),
    ...trending.slice(2),
    ...opts.script,
    ...EVERGREEN[opts.language],
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of order) {
    const tag = cleanTag(raw);
    const key = tag.toLowerCase();
    if (tag.length < 2 || tag.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= (opts.max ?? MAX_HASHTAGS)) break;
  }
  return out;
}

const SYSTEM = `You are a social media growth expert for a Nepali + English facts channel.
You know which hashtags are trending right now on YouTube Shorts, TikTok, Instagram Reels and Facebook Reels.
Only suggest hashtags that real people use and search. No made-up or spammy tags.`;

function prompt(language: Language, title: string, summary: string) {
  const audience =
    language === "ne"
      ? `Nepali-speaking viewers (Nepal and Nepalis abroad). Mix Devanagari hashtags (like #नेपाल) with romanised Nepali or English ones that Nepalis really use (like #nepal, #nepalitiktok).`
      : `English-speaking viewers worldwide.`;
  return `Search the web for hashtags that are trending or popular RIGHT NOW for this video topic.
Topic: "${title}"
About: ${summary}
Audience: ${audience}

Give 12 hashtags: about 8 specific to this topic (the words people search for it) and 4 broad trending ones for this kind of video.
Answer with ONLY the hashtags on one line, separated by spaces, each starting with #, best first.`;
}

export async function findHashtags(input: {
  language: Language;
  format: "SHORT" | "LONG";
  title: string;
  summary: string;
  scriptHashtags: string[];
  /** false = do not call Gemini (for example: today's free limit is almost used up). */
  allowSearch?: boolean;
}): Promise<{ hashtags: string[]; costs: CostLine[] }> {
  const brand = brandFor(input.language).hashtags;
  const merge = (trending: string[]) =>
    mergeHashtags({ language: input.language, format: input.format, trending, script: input.scriptHashtags, brand });

  const searchOn = (process.env.HASHTAG_SEARCH ?? "on").toLowerCase() !== "off";
  if (aiProvider() !== "gemini" || !searchOn || input.allowSearch === false) return { hashtags: merge([]), costs: [] };

  try {
    const res = await askGemini({ system: SYSTEM, prompt: prompt(input.language, input.title, input.summary), search: true });
    const trending = parseHashtags(res.text);
    return { hashtags: merge(trending), costs: [res.cost] };
  } catch (err) {
    console.warn(`Trending hashtags: search failed (${(err as Error).message.slice(0, 200)}), using the script's hashtags.`);
    return { hashtags: merge([]), costs: [] };
  }
}
