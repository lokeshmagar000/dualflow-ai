/**
 * Pictures for NEWS / POLITICS videos that stock sites do not have. Both are free.
 *
 *  - Flags: flagcdn.com (public-domain flag pictures, PNG, any country by its 2-letter code).
 *  - Photos of public people: Wikimedia Commons (the photo library behind Wikipedia).
 *    We only take photos with a free licence (CC BY, CC BY-SA, CC0, public domain), whose
 *    file name contains the person's first AND last name (so it is the right person),
 *    and we keep the author + licence to show as a credit on screen (the licence asks for that).
 *    First choice: the main photo of the person's Wikipedia article (it is surely the right
 *    person, even when the file name is short like "Balen Shah.jpg"). Only photos stored on
 *    Commons with a free licence are used (Wikipedia's "fair use" photos are not on Commons).
 *    Second choice: a Commons search where the file name has the person's first and last name.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const UA = { "user-agent": "NamasteFactsBot/1.0 (educational short videos; contact via repository)" };

/** Download a file into the job folder. Returns the file name, or null. */
async function download(url: string, dir: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
    return name;
  } catch {
    return null;
  }
}

/** The flag of a country ("np", "in" ...) as a PNG in the job folder. */
export async function fetchFlag(code: string, dir: string): Promise<string | null> {
  if (!/^[a-z]{2}$/.test(code)) return null;
  return download(`https://flagcdn.com/w640/${code}.png`, dir, `flag-${code}.png`);
}

export type CommonsPhoto = { file: string; credit: string; pageUrl: string };

type CommonsPage = {
  title: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
};

const stripHtml = (s = "") => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const FREE = /^(cc[ -]?by(-sa)?( \d\.\d)?|cc0|public domain|pd)/i;

/** Does the Commons file name contain every part of the person's name? */
export function nameMatches(fileTitle: string, person: string): boolean {
  const title = fileTitle.toLowerCase();
  const parts = person.toLowerCase().split(/\s+/).filter((p) => p.length > 1);
  return parts.length >= 2 && parts.every((p) => title.includes(p));
}

/** Pick the best free photo of `person` from a Commons answer (portrait first, then biggest). */
export function pickCommonsPhoto(pages: CommonsPage[], person: string): { url: string; credit: string; pageUrl: string } | null {
  const ok = pages
    .map((p) => ({ p, info: p.imageinfo?.[0] }))
    .filter(({ p, info }) => {
      if (!info?.thumburl || !nameMatches(p.title, person)) return false;
      if (/\.(svg|pdf|tif|tiff|webm|ogv)$/i.test(p.title)) return false;
      const licence = stripHtml(info.extmetadata?.LicenseShortName?.value);
      return FREE.test(licence);
    })
    .sort((a, b) => {
      const portrait = (x: typeof a) => Number((x.info!.height ?? 0) >= (x.info!.width ?? 0));
      return portrait(b) - portrait(a) || (b.info!.width ?? 0) - (a.info!.width ?? 0);
    });
  const best = ok[0];
  if (!best) return null;
  const meta = best.info!.extmetadata ?? {};
  const author = stripHtml(meta.Artist?.value).slice(0, 60) || "Unknown author";
  const licence = stripHtml(meta.LicenseShortName?.value);
  return { url: best.info!.thumburl!, credit: `Photo: ${author}, ${licence}, Wikimedia Commons`, pageUrl: best.info!.descriptionurl ?? "" };
}

/** Credit + picture for one Commons file, only when its licence is free. */
export function pickWikipediaPhoto(page: CommonsPage | undefined): { url: string; credit: string; pageUrl: string } | null {
  const info = page?.imageinfo?.[0];
  if (!page || !info?.thumburl) return null;
  if (/\.(svg|pdf|tif|tiff|webm|ogv)$/i.test(page.title)) return null;
  const meta = info.extmetadata ?? {};
  const licence = stripHtml(meta.LicenseShortName?.value);
  if (!FREE.test(licence)) return null;
  const author = stripHtml(meta.Artist?.value).slice(0, 60) || "Unknown author";
  return { url: info.thumburl, credit: `Photo: ${author}, ${licence}, Wikimedia Commons`, pageUrl: info.descriptionurl ?? "" };
}

/** The main photo of the person's English Wikipedia article (free licence only), or null. */
async function wikipediaPhoto(person: string): Promise<{ url: string; credit: string; pageUrl: string } | null> {
  const q = new URLSearchParams({ action: "query", format: "json", titles: person, prop: "pageimages|pageprops", piprop: "name", redirects: "1", origin: "*" });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { query?: { pages?: Record<string, { pageimage?: string; pageprops?: Record<string, string> }> } };
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page?.pageimage || page.pageprops?.disambiguation !== undefined) return null;
  const info = new URLSearchParams({ action: "query", format: "json", titles: `File:${page.pageimage}`, prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "900", origin: "*" });
  const res2 = await fetch(`https://commons.wikimedia.org/w/api.php?${info}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res2.ok) return null;
  const data2 = (await res2.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  return pickWikipediaPhoto(Object.values(data2.query?.pages ?? {})[0]);
}

/** Find and download a free photo of a public person. Returns null when none is safe to use. */
export async function findCommonsPhoto(person: string, dir: string, index = 0): Promise<CommonsPhoto | null> {
  if (!person.trim() || (process.env.NEWS_PHOTOS ?? "on").toLowerCase() === "off") return null;
  try {
    const wiki = await wikipediaPhoto(person);
    if (wiki) {
      const ext = path.extname(new URL(wiki.url).pathname) || ".jpg";
      const file = await download(wiki.url, dir, `person-${index}${ext}`);
      if (file) {
        console.log(`[news] Photo of "${person}" from Wikipedia (${wiki.credit}).`);
        return { file, credit: wiki.credit, pageUrl: wiki.pageUrl };
      }
    }
  } catch (err) {
    console.log(`[news] Wikipedia photo lookup failed for "${person}" (${(err as Error).message}). Trying a Commons search.`);
  }
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${person} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "15",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "900",
    origin: "*",
  });
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const picked = pickCommonsPhoto(Object.values(data.query?.pages ?? {}), person);
    if (!picked) {
      console.log(`[news] No free Wikimedia photo found for "${person}". The card is skipped.`);
      return null;
    }
    const ext = path.extname(new URL(picked.url).pathname) || ".jpg";
    const file = await download(picked.url, dir, `person-${index}${ext}`);
    if (file) console.log(`[news] Photo of "${person}" from a Commons search (${picked.credit}).`);
    return file ? { file, credit: picked.credit, pageUrl: picked.pageUrl } : null;
  } catch (err) {
    console.log(`[news] Wikimedia photo search failed for "${person}" (${(err as Error).message}).`);
    return null;
  }
}

/** A news photo found on Wikimedia Commons (for a line about the news event itself). */
export type NewsPhotoPick = { url: string; preview: string; credit: string; pageUrl: string; date: string; score: number };

/** Free licences + India's government licence (PIB / PM India photos on Commons are "GODL-India"). */
const NEWS_FREE = /^(cc[ -]?by(-sa)?( \d\.\d)?|cc0|public domain|pd|godl)/i;
const NEWS_STOP = new Set(["the", "and", "with", "from", "for", "of", "in", "on", "at", "a", "an", "to", "photo", "picture"]);

/**
 * Rank Commons answers for a news search ("Balen Shah Narendra Modi meeting"):
 * only free licences, only real photos big enough for a video, and only files whose name or
 * description has at least half of the search words (names count most). Newest first among equals.
 */
export function pickNewsPhotos(pages: CommonsPage[], query: string): NewsPhotoPick[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !NEWS_STOP.has(w));
  if (words.length === 0) return [];
  const out: NewsPhotoPick[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl || /\.(svg|pdf|tif|tiff|webm|ogv|gif)$/i.test(p.title)) continue;
    if ((info.width ?? 0) < 800) continue;
    const meta = info.extmetadata ?? {};
    const licence = stripHtml(meta.LicenseShortName?.value);
    if (!NEWS_FREE.test(licence)) continue;
    const text = `${p.title} ${stripHtml(meta.ImageDescription?.value)} ${stripHtml(meta.ObjectName?.value)}`.toLowerCase();
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits < Math.ceil(words.length / 2)) continue;
    const author = stripHtml(meta.Artist?.value).slice(0, 50) || "Unknown author";
    const date = stripHtml(meta.DateTimeOriginal?.value || meta.DateTime?.value).slice(0, 10);
    out.push({
      url: info.thumburl,
      preview: info.thumburl,
      credit: `Photo: ${author}, ${licence}, Wikimedia Commons`,
      pageUrl: info.descriptionurl ?? "",
      date,
      score: hits / words.length,
    });
  }
  return out.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

/**
 * A REAL news photo for a line about the news event (who met whom, what was signed...).
 * Searches Wikimedia Commons, which also holds many free Indian government (PIB / PM India) photos.
 * `check` (the picture check) gets the best candidates and returns the ones that show `mustShow`.
 * Returns the downloaded file name + credit, or null when nothing safe and fitting is found.
 */
export async function findNewsPhoto(
  query: string,
  dir: string,
  name: string,
  check?: (candidates: { preview: string; index: number }[]) => Promise<number[]>,
  used: Set<string> = new Set(),
): Promise<{ file: string; credit: string; pageUrl: string } | null> {
  if (!query.trim() || (process.env.NEWS_PHOTOS ?? "on").toLowerCase() === "off") return null;
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "30",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1600",
    origin: "*",
  });
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const picks = pickNewsPhotos(Object.values(data.query?.pages ?? {}), query).filter((p) => !used.has(p.pageUrl)).slice(0, 6);
    if (picks.length === 0) {
      console.log(`[news] No free news photo on Commons for "${query}".`);
      return null;
    }
    let order = picks.map((_, i) => i);
    if (check) {
      try {
        order = await check(picks.map((p, index) => ({ preview: p.preview, index })));
      } catch {
        order = []; // no check possible: a wrong "news" photo is worse than a stock picture
      }
    }
    for (const i of order) {
      const pick = picks[i];
      if (!pick) continue;
      const ext = path.extname(new URL(pick.url).pathname) || ".jpg";
      const file = await download(pick.url, dir, `${name}${ext}`);
      if (!file) continue;
      used.add(pick.pageUrl);
      console.log(`[news] Real photo for "${query}" (${pick.credit}).`);
      return { file, credit: pick.credit, pageUrl: pick.pageUrl };
    }
    console.log(`[news] Commons photos for "${query}" did not pass the picture check.`);
    return null;
  } catch (err) {
    console.log(`[news] News photo search failed for "${query}" (${(err as Error).message}).`);
    return null;
  }
}
