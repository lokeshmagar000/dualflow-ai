/**
 * REAL TRENDING NEWS for the "News Explained" series. FREE, no key.
 *
 * Google News gives an RSS feed (a simple XML list of headlines) for any search.
 * We read the newest Nepal headlines, keep only the last few days, rank them by how
 * many papers cover the same story (= trending), and
 * the AI must pick one of THESE: it can never invent an event.
 *
 * Change the searches with POLITICS_NEWS_QUERIES (separate them with "|").
 */

export type NewsItem = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: Date;
  /** How many different papers wrote about the same story (more = more trending). */
  coverage?: number;
};

const DEFAULT_QUERIES = [
  "Nepal",
  "Kathmandu",
  "Nepal prime minister",
  "Nepal government parliament",
  "Nepal India relations",
  "Nepal China relations",
  "Nepal election commission",
];

/** Turn the XML special signs (&amp; ...) back into normal characters. */
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]!) : "";
}

/** Read the <item> entries of a Google News RSS feed. */
export function parseNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!;
    const publisher = tag(block, "source");
    let title = tag(block, "title");
    // Google adds " - Publisher" at the end of the title: remove it.
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    const url = tag(block, "link");
    const date = new Date(tag(block, "pubDate"));
    if (!title || !url || Number.isNaN(date.getTime())) continue;
    items.push({ title, url, publisher, publishedAt: date });
  }
  return items;
}

/** Same story from many papers: keep one per (almost) identical headline. */
export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, "").split(/\s+/).slice(0, 7).join(" ");
  return items.filter((i) => {
    const k = key(i.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * TRENDING: a story that many different papers write about is what people talk about.
 * For each headline, count the papers whose headline shares at least 2 key words with it
 * (e.g. "Shah", "Modi", "Delhi"). Most covered first, newest first when equal.
 */
const STOP = new Set(["nepal", "nepals", "nepali", "kathmandu", "about", "after", "their", "there", "which", "would", "could", "says", "said", "with", "from", "over", "into", "amid", "will", "what", "when", "year", "years", "today", "news", "government"]);
export function keyWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/['’]s\b/g, "")
      .split(/[^a-z0-9\u0900-\u097f]+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}
export function rankTrending(items: NewsItem[]): NewsItem[] {
  const words = items.map((i) => keyWords(i.title));
  const ranked = items.map((item, i) => {
    const papers = new Set<string>([item.publisher || item.url]);
    items.forEach((other, j) => {
      if (j === i) return;
      let shared = 0;
      for (const w of words[j]!) if (words[i]!.has(w)) shared++;
      if (shared >= 2) papers.add(other.publisher || other.url);
    });
    return { ...item, coverage: papers.size };
  });
  return ranked.sort((a, b) => b.coverage - a.coverage || b.publishedAt.getTime() - a.publishedAt.getTime());
}

/**
 * The most TRENDING Nepal headlines (politics and any other big news) from the last
 * `days` days: most covered first.
 * Returns [] when Google News cannot be reached (the caller then picks another series).
 */
export async function fetchNepalPoliticsNews(opts: { days?: number; max?: number } = {}): Promise<NewsItem[]> {
  const days = opts.days ?? Number(process.env.POLITICS_NEWS_DAYS ?? 5);
  const queries = (process.env.POLITICS_NEWS_QUERIES || DEFAULT_QUERIES.join("|")).split("|").map((q) => q.trim()).filter(Boolean);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const all: NewsItem[] = [];
  for (const q of queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=en-NP&gl=NP&ceid=NP:en`;
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (news reader)" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`News: Google News said ${res.status} for "${q}".`);
        continue;
      }
      all.push(...parseNewsRss(await res.text()));
    } catch (err) {
      console.warn(`News: could not read Google News for "${q}" (${(err as Error).message}).`);
    }
  }
  const recent = all.filter((i) => i.publishedAt.getTime() >= since);
  // Count coverage on ALL headlines first (duplicates are the trend signal), then keep one per story.
  return dedupeNews(rankTrending(recent)).slice(0, opts.max ?? 25);
}
