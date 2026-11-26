/**
 * Pictures for NEWS / POLITICS videos that stock sites do not have. Both are free.
 *
 *  - Flags: flagcdn.com (public-domain flag pictures, PNG, any country by its 2-letter code).
 *  - Photos of public people: Wikimedia Commons (the photo library behind Wikipedia).
 *    We only take photos with a free licence (CC BY, CC BY-SA, CC0, public domain), whose
 *    file name contains the person's first AND last name (so it is the right person),
 *    and we keep the author + licence to show as a credit on screen (the licence asks for that).
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

/** Find and download a free photo of a public person. Returns null when none is safe to use. */
export async function findCommonsPhoto(person: string, dir: string, index = 0): Promise<CommonsPhoto | null> {
  if (!person.trim() || (process.env.NEWS_PHOTOS ?? "on").toLowerCase() === "off") return null;
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
    return file ? { file, credit: picked.credit, pageUrl: picked.pageUrl } : null;
  } catch (err) {
    console.log(`[news] Wikimedia photo search failed for "${person}" (${(err as Error).message}).`);
    return null;
  }
}
