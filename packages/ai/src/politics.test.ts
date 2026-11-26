import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { judgementWordsIn, nextSeries, sourceLine, sourceName } from "@dualflow/shared";
import { dedupeNews, fetchNepalPoliticsNews, parseNewsRss, rankTrending, type NewsItem } from "./news";
import { suggestPoliticsTopic } from "./politics";
import { checkPoliticsSources } from "./research";

const realFetch = globalThis.fetch;
const realMode = process.env.AI_MODE;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realMode === undefined) delete process.env.AI_MODE;
  else process.env.AI_MODE = realMode;
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toUTCString();
const rss = (items: [string, string, string, string][]) =>
  `<?xml version="1.0"?><rss><channel>${items
    .map(([title, link, date, source]) => `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>${date}</pubDate><source url="https://x">${source}</source></item>`)
    .join("")}</channel></rss>`;

test("parseNewsRss reads headlines and removes the paper's name from the title", () => {
  const items = parseNewsRss(rss([["PM Shah meets Modi in Delhi &amp; signs deals", "https://a/1", hoursAgo(5), "The Kathmandu Post"]]));
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "PM Shah meets Modi in Delhi & signs deals");
  assert.equal(items[0]!.publisher, "The Kathmandu Post");
});

test("rankTrending puts the story many papers cover first", () => {
  const n = (title: string, publisher: string, h = 2): NewsItem => ({ title, publisher, url: `https://${publisher}/${title.length}`, publishedAt: new Date(Date.now() - h * 3600_000) });
  const ranked = rankTrending([
    n("Kathmandu traffic rules change on Sunday", "Republica", 1),
    n("Nepal PM Balendra Shah meets Modi in New Delhi", "Kathmandu Post"),
    n("Balendra Shah, Modi hold talks on energy trade", "The Hindu"),
    n("Shah and Modi sign energy deals", "Reuters"),
  ]);
  assert.match(ranked[0]!.title, /Shah/);
  assert.ok((ranked[0]!.coverage ?? 0) >= 2);
  assert.equal(ranked.at(-1)!.coverage, 1);
});

test("dedupeNews keeps one copy of the same headline", () => {
  const d = new Date();
  assert.equal(dedupeNews([{ title: "Same news here today", url: "a", publisher: "x", publishedAt: d }, { title: "Same news here today!", url: "b", publisher: "y", publishedAt: d }]).length, 1);
});

test("fetchNepalPoliticsNews keeps only recent news, and returns [] when Google cannot be reached", async () => {
  globalThis.fetch = (async () => new Response(rss([["Fresh Nepal budget news", "https://a/1", hoursAgo(3), "Republica"], ["Old Nepal news item", "https://a/2", hoursAgo(24 * 30), "Republica"]]))) as typeof fetch;
  const fresh = await fetchNepalPoliticsNews({ days: 5 });
  assert.deepEqual(fresh.map((f) => f.title), ["Fresh Nepal budget news"]);
  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  assert.deepEqual(await fetchNepalPoliticsNews(), []);
});

test("News Explained must use a REAL headline: its link and paper are saved as sources", async () => {
  process.env.AI_MODE = "mock";
  const news: NewsItem[] = [{ title: "Nepal PM meets India PM in Delhi", url: "https://news/1", publisher: "Reuters", publishedAt: new Date() }];
  const r = await suggestPoliticsTopic({ series: "news-explained", recentTitles: [], news });
  assert.equal(r.sources[0]!.url, "https://news/1");
  assert.match(r.idea.notes, /Reuters/);
  await assert.rejects(suggestPoliticsTopic({ series: "news-explained", recentTitles: [], news: [] }), /No recent/);
});

test("politics research needs at least 3 sources, and facts without a source are dropped", () => {
  const facts = (n: number) => Array.from({ length: n }, (_, i) => ({ claim: `fact ${i}`, sourceUrl: `https://s/${i}` }));
  assert.throws(() => checkPoliticsSources({ facts: facts(2) }), /at least 3/);
  const r = { facts: [...facts(3), { claim: "no source", sourceUrl: "" }] };
  checkPoliticsSources(r);
  assert.equal(r.facts.length, 3);
});

test("judgementWordsIn finds loaded words in English and Nepali, not inside other words", () => {
  assert.deepEqual(judgementWordsIn("The minister was corrupt"), ["corrupt"]);
  assert.deepEqual(judgementWordsIn("यो सरकार असफल भयो"), ["असफल"]);
  assert.deepEqual(judgementWordsIn("The heroine of the story"), []); // "hero" inside another word is fine
});

test("sourceName and sourceLine give short, official-first names", () => {
  assert.equal(sourceName("https://www.kathmandupost.com/national/x"), "The Kathmandu Post");
  assert.equal(sourceName("https://vertexaisearch.cloud.google.com/abc", "election.gov.np"), "Election Commission Nepal");
  const line = sourceLine("en", [{ url: "https://kathmandupost.com/a" }, { url: "https://kathmandupost.com/b" }, { url: "https://election.gov.np/x" }]);
  assert.equal(line, "Source: Election Commission Nepal · The Kathmandu Post");
  assert.match(sourceLine("ne", [{ publisher: "Reuters" }]), /^स्रोत: Reuters$/);
  assert.equal(sourceLine("en", []), "");
});

test("nextSeries picks the ticked series used longest ago", () => {
  const old = new Date("2026-11-01"), recent = new Date("2026-11-25");
  assert.equal(nextSeries(["pm-files", "news-explained"], { "news-explained": recent, "pm-files": old }), "pm-files");
  assert.equal(nextSeries(["pm-files", "news-explained"], { "news-explained": recent }), "pm-files"); // never used = first
  assert.equal(nextSeries(["pm-files", "news-explained"], {}), "news-explained"); // all new: the list order
  assert.equal(nextSeries([], {}), null);
});
