/**
 * Step 2: write the script for ONE language.
 * Each language is written natively from the same research and the same
 * visual plan, so the Nepali script sounds natural, not translated.
 */
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { judgementWordsIn, NEUTRAL_RULES, videoStyle, type Language } from "@dualflow/shared";
import { claude, currentModel, fallbackOptions } from "./client";
import { claudeCost, type CostLine } from "./cost";
import type { Research } from "./research";
import { isMockAI, mockScript } from "./mock";
import { withGeminiBackup } from "./provider";
import { askGeminiJson } from "./gemini";

export const ScriptSchema = z.object({
  title: z.string().describe("Video title in the target language, max 90 characters"),
  description: z.string().describe("Video description in the target language, 2-4 short paragraphs"),
  hashtags: z
    .array(z.string())
    .describe("6-10 hashtags without the # sign that people really search for this topic, most important first; Nepali videos: mix Devanagari and romanised Nepali tags"),
  thumbnailHeadline: z.string().describe("2-5 punchy words for the thumbnail, target language"),
  scenes: z
    .array(
      z.object({
        order: z.number().int().describe("Same number as the scene in the list (1, 2, 3...)"),
        text: z.string().describe("What the narrator says in this scene, target language"),
        parts: z
          .array(
            z.object({
              text: z.string().describe("A piece of `text`, word for word, in order. All parts together = the whole `text`"),
              visualQuery: z
                .string()
                .describe("2-4 ENGLISH words for stock footage of the thing named in THIS piece, e.g. 'yak grazing', 'himalaya forest'"),
              mustShow: z
                .string()
                .default("")
                .describe("Plain English: exactly what the picture for THIS piece must clearly show, e.g. 'the national flag of Nepal' or 'red rhododendron flowers'"),
            }),
          )
          .describe("The line cut into 1-3 pieces: start a new piece where the line names a new thing to show"),
      }),
    )
    .describe("Exactly one entry per visual plan scene, same order"),
  hookLines: z
    .array(z.string())
    .default([])
    .describe("The big hook text on the first frame, target language: 1-2 short lines, 2-4 words each, e.g. ['Only 1 flag', 'breaks the rule']. A promise or shock, not the topic name"),
  hookHighlight: z.number().int().default(0).describe("Which hook line (0 or 1) gets the marigold box: the most surprising words"),
  topicChip: z.string().default("").describe("2-3 words naming the topic, target language, shown at the top after the hook, e.g. 'Nepal\'s flag'"),
  emphasis: z
    .array(z.string())
    .default([])
    .describe("Key words copied EXACTLY as they appear in the narration (one word each, no spaces): 1-2 per scene, the words that carry the surprise"),
  cards: z
    .array(
      z.object({
        order: z.number().int().describe("Scene number where the card shows"),
        kind: z
          .enum(["number", "year", "date", "time"])
          .describe("number = a count or size (counts up); year = a year (digits roll); date = a day and month (calendar flips); time = a time of day (clock hands turn)"),
        big: z
          .string()
          .describe("Short, as digits: number '1 / 193' or '8,849 m'; year '1962'; date '16 Dec 1962' (day, short month, optional year); time '5:45' (24-hour H:MM)"),
        small: z.string().describe("1-3 word label under it, target language, e.g. 'countries'"),
      }),
    )
    .default([])
    .describe("0-3 animated cards for striking numbers, years, dates or times that the narration says (at most one per scene)"),
  followText: z.string().default("").describe("Short follow message, target language, e.g. 'Follow for Part 2'"),
  newsCards: z
    .array(
      z.object({
        order: z.number().int().describe("Scene number where the card shows"),
        kind: z
          .enum(["headline", "quote", "timeline", "trip", "flags", "photo"])
          .describe(
            "headline = a real news headline as a newspaper clipping; quote = words a named person really said (from the facts); timeline = 2-4 dates in order; trip = travel from one city to another; flags = the countries involved; photo = a photo of a named public person",
          ),
        title: z
          .string()
          .default("")
          .describe("headline: the real headline, copied EXACTLY in its original language; quote: the quoted words; trip/flags/timeline: a 2-5 word label in the target language; photo: the person's role, target language, e.g. 'Prime Minister'"),
        by: z.string().default("").describe("headline: the paper's name; quote: who said it (name + role, target language); photo: the person's name, target language"),
        person: z.string().default("").describe("photo only: the person's full name in ENGLISH as written on Wikipedia, e.g. 'Narendra Modi'"),
        date: z.string().default("").describe("A date shown on the card, target language, e.g. '23 Nov 2026' (headline, quote, trip)"),
        from: z.string().default("").describe("trip only: start city, target language"),
        to: z.string().default("").describe("trip only: end city, target language"),
        countries: z.array(z.string()).default([]).describe("trip/flags: 2-letter country codes in order, e.g. ['np','in']"),
        points: z
          .array(z.object({ when: z.string().describe("A year or short date, e.g. '2015'"), label: z.string().describe("2-5 words, target language") }))
          .default([])
          .describe("timeline only: 2-4 points, oldest first"),
      }),
    )
    .default([])
    .describe("NEWS / POLITICS videos only (otherwise empty): 2-5 news graphics, at most one per scene"),
  people: z
    .array(
      z.object({
        order: z.number().int().describe("Scene number where the narration says this person's name"),
        person: z.string().describe("The person's full name in ENGLISH as written on Wikipedia, e.g. 'Narendra Modi'"),
        name: z.string().describe("The name EXACTLY as the narration says it in that scene (target language), e.g. 'मोदी' or 'Modi'"),
        role: z.string().default("").describe("1-3 word role, target language, e.g. 'प्रधानमन्त्री' / 'Prime Minister'"),
      }),
    )
    .default([])
    .describe("NEWS / POLITICS videos only: EVERY scene where a real public person (leader, official, celebrity, player) is named. Their real photo shows when the name is said."),
});
export type Script = z.infer<typeof ScriptSchema>;

/** Language-specific writing rules. The Nepali rules are what make the voice sound natural. */
const STYLE: Record<Language, string> = {
  ne: `Write in natural, everyday spoken Nepali (Devanagari script), the way a friendly Nepali YouTuber talks.
- Do NOT translate from English word by word. Think in Nepali.
- Short sentences (under 12 words). Simple words most Nepali viewers know.
- Write ALL numbers as Nepali words, because the voice reads digits badly: "३ सय" -> "तीन सय", "2025" -> "दुई हजार पच्चीस".
- English brand or technical words are fine if Nepalis really use them (मोबाइल, इन्टरनेट); write them in Devanagari.
- Use proper Unicode Devanagari with correct punctuation (।).`,
  en: `Write in clear, friendly spoken English for a global audience.
- Short sentences (under 12 words). No jargon without a quick explanation.
- Write numbers as they should be spoken ("three hundred", "twenty twenty-five").`,
};

/** Most words in one scene, so one picture never has to cover a long speech. */
export const MAX_SCENE_WORDS: Record<Language, number> = { ne: 16, en: 20 };

const CLASSIC_SCRIPT_RULES = `- Scene 1 is a strong hook (surprise or question). No greeting, no "welcome", no "in this video".
- No filler ("did you know that..." more than once, "interestingly", "let's find out").
- Each fact only once. The last scene is a short call to action (follow for more).`;

/** Style V2: hook on the first word, an open loop, the best fact near the end, and a loop line. */
const V2_SCRIPT_RULES = `- Scene 1 is the hook: one sentence under 10 words, spoken from the very first second.
  It opens a question the video answers later. No greeting, no "welcome", no "in this video", no "did you know".
- The "open_loop" scene promises more ("But that's not even the strangest part.").
- The "payoff" scene gives the biggest surprise.
- The last ("loop_back") scene leads straight back into the hook, so the video loops when it replays.
  NO call to action, no "like and follow", no goodbye.
- No filler ("interestingly", "let's find out"). Each fact only once. Energetic, curious, spoken style.`;

type ScriptInput = {
  language: Language;
  title: string;
  format: "SHORT" | "LONG";
  research: Research;
  /** Nepal Politics video: strictly neutral words (checked after writing). */
  politics?: boolean;
  /** Added at the end of the prompt (used to ask again). */
  extraNote?: string;
  /** Politics: the real headlines the topic came from (for the "headline" news card). */
  headlines?: { title: string; publisher: string }[];
};

/** The same prompt is used by Claude and by Gemini. */
function scriptPrompt(input: ScriptInput): { system: string; prompt: string } {
  const { language, research } = input;
  // Each scene shows the writer what the viewer will SEE, so the words can match the picture.
  const scenesText = research.visualPlan
    .map((s, i) => `${i + 1}. [${s.purpose}] say: ${s.idea}\n   on screen: ${s.visualQuery}`)
    .join("\n");
  const factsText = research.facts.map((f) => `- ${f.claim}`).join("\n");
  const length =
    input.format === "SHORT"
      ? videoStyle() === "v2"
        ? "The whole script must take about 30-45 seconds to speak."
        : "The whole script must take about 40-55 seconds to speak."
      : "The whole script must take about 8-12 minutes to speak.";

  return {
    system: `You are a scriptwriter for a bilingual (Nepali + English) educational video channel.
Only use facts from the research. Never invent numbers.
${STYLE[language]}${input.politics ? `\n${NEUTRAL_RULES}\n- Hooks may be curious but never sensational or one-sided. Attribute claims ("according to ...").` : ""}`,
    prompt: `Write the ${language === "ne" ? "NEPALI" : "ENGLISH"} narration for this video.
Topic: ${input.title}
${length}

Rules (the picture changes with every scene, so the words must fit the picture):
- Write exactly one narration entry for each scene, same order, numbered 1 to ${research.visualPlan.length}.
- Each entry says ONLY that scene's "say" idea, and talks about what is "on screen" at that moment.
  Never talk about the next scene's thing early, and never go back to an earlier one.
- Each entry: one or two short sentences, at most ${MAX_SCENE_WORDS[language]} words.
${videoStyle() === "v2" ? V2_SCRIPT_RULES : CLASSIC_SCRIPT_RULES}
- Plain spoken words only: no emojis, hashtags, brackets, stage directions or "Scene 1:" labels.

Pictures inside a line ("parts"):
- Cut each line into 1-3 parts, word for word, so that the picture can change the moment
  the narrator names a new thing. In Style V2 cut every line of more than 6 words into 2-3 parts, and give
  each part a DIFFERENT picture: when a line keeps talking about one thing (for example Nepal's flag),
  mix it with related on-topic pictures (Nepali people with the flag, a map of Nepal, Kathmandu, mountains).
  Never the same picture twice in a row. Example: "Yaks live in the high Himalaya, | above the forests and jungles."
  -> part 1 "Yaks live in the high Himalaya," = "yak himalaya mountain", part 2 "above the forests and jungles." = "himalayan forest valley".
- Each part has at least 4 words. Do not cut in the middle of a name.
- This works for ANY topic: whenever the line names something a viewer could see (an animal, a place,
  a food, a building, a vehicle, a body part, a kind of person, a natural thing, an action), start a part there.
- visualQuery is always in ENGLISH, and shows exactly the thing that part names.
- visualQuery STAYS ON THE TOPIC: name the subject in it ("nepal flag", never just "flag"). A line about the
  whole world or all countries shows "world map" or "globe earth".
- mustShow says exactly what that picture must show (a picture check rejects wrong pictures).
${videoStyle() === "v2" ? "" : '- The call to action is one part, visualQuery "smartphone like button".'}

On-screen text (target language):
- hookLines: 1-2 short lines for the first frame (a promise or shock, 2-4 words each). hookHighlight: the line with the surprise.
- topicChip: 2-3 words naming the topic.
- emphasis: 1-2 key words per scene, copied exactly as written in the narration.
- cards: for each striking number, year, date or time in the narration (0-3 in total), an animated card
  on that scene: kind "number" (counts up), "year" (digits roll), "date" (calendar flips), "time" (clock turns).
- followText: a short "Follow for Part 2" message.
${input.politics ? NEWS_CARD_RULES(input) : "- newsCards and people: leave empty."}

Summary:
${research.summary}

Facts you may use:
${factsText}

Scenes:
${scenesText}

${LANGUAGE_REMINDER[language]}${input.extraNote ? `\n\n${input.extraNote}` : ""}`,
  };
}

/** All the words a viewer hears or reads, for the neutral-words check. */
export function scriptText(script: Pick<Script, "title" | "description" | "scenes" | "hookLines" | "thumbnailHeadline">): string {
  return [script.title, script.description, script.thumbnailHeadline, ...(script.hookLines ?? []), ...script.scenes.map((s) => s.text)].join("\n");
}

/**
 * Said again at the very END of the prompt: the rules above are written in English, and the light
 * backup model (used when the main one is out of free quota) sometimes answered a Nepali request
 * in English (2026-11-26, banana story).
 */
const LANGUAGE_REMINDER: Record<Language, string> = {
  ne: `LANGUAGE (most important): write the narration, every part's "text", title, description, thumbnailHeadline,
hookLines, topicChip, emphasis, cards' "small" and followText in NEPALI (Devanagari script, e.g. "केराको बोट रूख होइन").
ONLY visualQuery and mustShow are in English. An answer in English is wrong.`,
  en: `LANGUAGE: write everything in English (visualQuery and mustShow too).`,
};

/** News graphics for Nepal News & Politics videos (stock sites have no pictures of politicians or events). */
function NEWS_CARD_RULES(input: ScriptInput) {
  const heads = (input.headlines ?? []).map((h) => `- "${h.title}" (${h.publisher})`).join("\n");
  return `- newsCards: 2-5 news graphics on the scenes where they help most (at most one per scene). Kinds:
  headline: on the scene that says what happened, copy one REAL headline EXACTLY (keep it in its original language):
${heads || "  (no headline: do not use this kind)"}
  quote: ONLY words a person really said that appear in quotation marks in the facts below. Never make up a quote.
  timeline: 2-4 dates from the facts, oldest first.
  trip: a visit or journey from the facts (from city, to city, the date, country codes).
  flags: the countries involved (2-letter codes, e.g. np, in, cn, us).
  Do NOT use "photo" in newsCards: people photos come from "people" below.
  All words on cards come from the facts. Same neutral rules.
- people: list EVERY scene where the narration names a real public person (leader, minister, official, celebrity, player).
  One entry per person per scene. "person" = full English name as on Wikipedia; "name" = the exact words the narration uses for them.
  Their real photo appears on screen at the moment the name is spoken.`;
}

/** Share of letters in Devanagari (0-1). Latin brand names inside a Nepali line are fine. */
export function devanagariShare(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const dev = letters.filter((ch) => /[\u0900-\u097F]/.test(ch)).length;
  return dev / letters.length;
}

/** True when a Nepali script is really in Nepali (narration mostly Devanagari). */
export function looksNepali(script: Pick<Script, "scenes">): boolean {
  return devanagariShare(script.scenes.map((s) => s.text).join(" ")) >= 0.6;
}

/**
 * Clean one spoken line: remove things a voice should never read aloud
 * (labels like "Scene 2:", stage directions in brackets, emojis, hashtags, markdown stars)
 * and tidy the spaces.
 */
export function cleanLine(text: string): string {
  return text
    .normalize("NFC")
    .replace(/^\s*(scene|दृश्य)\s*[0-9०-९]+\s*[:.\-–]\s*/i, "")
    .replace(/^\s*(narrator|voice ?over|वाचक)\s*:\s*/i, "")
    .replace(/\[[^\]]*\]|\([^)]*(music|sound|pause|visual|scene|cut)[^)]*\)/gi, "")
    .replace(/#[\p{L}\p{M}\p{N}_]+/gu, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
    .replace(/\s+([,.!?।])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Make sure every narration line sits next to ITS picture.
 * The AI sometimes skips a scene, numbers them wrongly or adds an extra one.
 * We match lines to the plan by their order number (or position), keep the
 * plan's order, drop empty or extra lines, and store the plan's scene number
 * in `order` so the video uses the right picture for each line.
 */
export function alignScenes(scenes: SceneInput[], planLength: number): Script["scenes"] {
  const byOrder = new Map<number, Script["scenes"][number]>();
  const orders = scenes.map((s) => s.order);
  const numbersOk = new Set(orders).size === orders.length && orders.every((o) => o >= 1 && o <= planLength);
  scenes.forEach((s, i) => {
    const order = numbersOk ? s.order : i + 1;
    const parts = cleanParts(s.parts ?? []);
    // The spoken text is the parts joined together (so word times and pictures line up);
    // when the parts are missing or broken, the plain text is used with one picture.
    const text = parts.length ? parts.map((p) => p.text).join(" ") : cleanLine(s.text);
    if (order >= 1 && order <= planLength && text) byOrder.set(order, { order, text, parts });
  });
  return [...byOrder.values()].sort((a, b) => a.order - b.order);
}

type PartInput = { text: string; visualQuery: string; mustShow?: string };
type SceneInput = { order: number; text: string; parts?: PartInput[] };

/** Clean the parts; drop the parts if fewer than 2 remain (one part = one picture anyway). */
function cleanParts(parts: PartInput[]): { text: string; visualQuery: string; mustShow: string }[] {
  const clean = parts
    .map((p) => ({ text: cleanLine(p.text), visualQuery: p.visualQuery.replace(/\s+/g, " ").trim(), mustShow: (p.mustShow ?? "").trim() }))
    .filter((p) => p.text);
  if (clean.length < 2 || clean.some((p) => !p.visualQuery)) return clean.length === 1 && clean[0]!.visualQuery ? clean : [];
  return clean.slice(0, 4);
}

/** Normalise Unicode (NFC) so the same word is always stored the same way. */
function normalise(script: Script): Script {
  const nfc = (s: string) => s.normalize("NFC");
  return {
    ...script,
    title: nfc(script.title),
    description: nfc(script.description),
    thumbnailHeadline: nfc(script.thumbnailHeadline),
    hashtags: script.hashtags.map(nfc),
    scenes: script.scenes.map((s) => ({ ...s, text: nfc(s.text) })),
    hookLines: script.hookLines.map((l) => nfc(l).trim()).filter(Boolean).slice(0, 2),
    topicChip: nfc(script.topicChip).trim(),
    emphasis: script.emphasis.map((w) => nfc(w).trim()).filter(Boolean),
    cards: script.cards
      .filter((c) => c.order > 0 && c.big.trim())
      .slice(0, 3)
      .map((c) => ({ ...c, big: c.big.trim(), small: nfc(c.small).trim() })),
    followText: nfc(script.followText).trim(),
    newsCards: (script.newsCards ?? [])
      .filter((c) => c.order > 0)
      .map((c) => ({
        ...c,
        title: nfc(c.title).trim(),
        by: nfc(c.by).trim(),
        date: nfc(c.date).trim(),
        from: nfc(c.from).trim(),
        to: nfc(c.to).trim(),
        person: c.person.trim(),
        countries: c.countries.map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z]{2}$/.test(x)).slice(0, 4),
        points: c.points.map((p) => ({ when: nfc(p.when).trim(), label: nfc(p.label).trim() })).filter((p) => p.when).slice(0, 4),
      })),
    people: trustedPeople(script.people ?? []),
  };
}

/**
 * Keep only news cards we can trust:
 *  - quote: only when the research really has quoted words (never an invented quote),
 *  - headline: only one of the REAL headlines this topic came from (copied exactly),
 *  - every card needs what it shows (a timeline needs 2 points, a trip 2 cities ...),
 *  - one card per scene, at most 5.
 */
export function trustedNewsCards(
  cards: Script["newsCards"],
  research: Pick<Research, "facts" | "summary">,
  headlines: { title: string; publisher: string }[] = [],
): Script["newsCards"] {
  const quoted = research.facts.some((f) => /["“”]/.test(f.claim)) || /["“”]/.test(research.summary);
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const real = new Map(headlines.map((h) => [norm(h.title), h]));
  const used = new Set<number>();
  const out: Script["newsCards"] = [];
  for (const c of cards) {
    if (used.has(c.order) || out.length >= 5) continue;
    let card = c;
    if (c.kind === "quote" && (!quoted || !c.title || !c.by)) continue;
    if (c.kind === "headline") {
      const match = real.get(norm(c.title)) ?? headlines[0];
      if (!match) continue;
      card = { ...c, title: match.title, by: match.publisher || c.by };
    }
    if (c.kind === "timeline" && c.points.length < 2) continue;
    if (c.kind === "trip" && (!c.from || !c.to)) continue;
    if (c.kind === "flags" && c.countries.length === 0) continue;
    if (c.kind === "photo" && !c.person) continue;
    used.add(c.order);
    out.push(card);
  }
  return out;
}

/**
 * People named in the narration: a full English name (2+ words) is needed to find the right photo.
 * One entry per person per scene, at most 8.
 */
export function trustedPeople(people: Script["people"]): Script["people"] {
  const seen = new Set<string>();
  const out: Script["people"] = [];
  for (const p of people) {
    const person = p.person.replace(/\s+/g, " ").trim();
    const name = p.name.normalize("NFC").trim();
    if (p.order <= 0 || person.split(" ").filter((w) => w.length > 1).length < 2 || !name) continue;
    const key = `${p.order}|${person.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ order: p.order, person, name, role: p.role.normalize("NFC").trim() });
    if (out.length >= 8) break;
  }
  return out;
}

/** Tidy the AI's answer: Unicode, clean lines, and each line matched to its picture. */
function finish(script: Script, planLength: number, language: Language): Script {
  const tidy = normalise(script);
  const scenes = alignScenes(tidy.scenes, planLength);
  if (scenes.length === 0) throw new Error(`The ${language} script came back without any narration.`);
  return { ...tidy, scenes };
}

export async function writeScript(input: ScriptInput): Promise<{ script: Script; costs: CostLine[] }> {
  const result = await writeScriptChecked(input);
  // News graphics only for news / politics videos, and only the ones we can trust.
  result.script.newsCards = input.politics && !isMockAI() ? trustedNewsCards(result.script.newsCards, input.research, input.headlines) : input.politics ? result.script.newsCards : [];
  if (!input.politics) result.script.people = [];
  return result;
}

async function writeScriptChecked(input: ScriptInput): Promise<{ script: Script; costs: CostLine[] }> {
  const first = await writeScriptOnce(input);
  if (!input.politics) return first;
  // Politics: no judgement words ("corrupt", "failed", "hero" ...). Found some? Ask once more.
  const found = judgementWordsIn(scriptText(first.script));
  if (found.length === 0) return first;
  console.warn(`Script (${input.language}): not neutral (${found.join(", ")}). Asking again.`);
  const again = await writeScriptOnce({
    ...input,
    extraNote: `Your last answer used judgement words (${found.join(", ")}). This is a NEUTRAL politics video: write it again with only facts and neutral words.`,
  });
  const still = judgementWordsIn(scriptText(again.script));
  if (still.length) throw new Error(`The ${input.language} politics script was not neutral twice (${still.join(", ")}). Will retry later.`);
  return { script: again.script, costs: [...first.costs, ...again.costs] };
}

async function writeScriptOnce(input: ScriptInput): Promise<{ script: Script; costs: CostLine[] }> {
  // Practice mode: no API call, no cost.
  if (isMockAI()) return { script: mockScript({ ...input, politics: input.politics }), costs: [] };
  const { system, prompt } = scriptPrompt(input);

  return withGeminiBackup(`Script (${input.language})`, () => scriptWithClaude(input, system, prompt), () => scriptWithGemini(input, system, prompt));
}

async function scriptWithGemini(input: ScriptInput, system: string, prompt: string): Promise<{ script: Script; costs: CostLine[] }> {
  const costs: CostLine[] = [];
  let { value, cost } = await askGeminiJson(ScriptSchema, { system, prompt });
  costs.push(cost);
  let script = finish(value, input.research.visualPlan.length, input.language);
  if (input.language === "ne" && !looksNepali(script)) {
    // The answer came back in English: ask once more, saying so plainly.
    console.warn("Script: the Nepali script came back in English. Asking again.");
    ({ value, cost } = await askGeminiJson(ScriptSchema, {
      system,
      prompt: `${prompt}\n\nYour last answer was in ENGLISH. Write it again, this time in NEPALI (Devanagari).`,
    }));
    costs.push(cost);
    script = finish(value, input.research.visualPlan.length, input.language);
    // Never make a "Nepali" video in English: fail, so the step is retried later.
    if (!looksNepali(script)) throw new Error("The Nepali script came back in English twice. Will retry later.");
  }
  return { script, costs };
}

async function scriptWithClaude(input: ScriptInput, system: string, prompt: string): Promise<{ script: Script; costs: CostLine[] }> {
  const model = currentModel();
  const costs: CostLine[] = [];
  let response = await askClaudeForScript(model, system, prompt);
  costs.push(claudeCost(model, response.usage));
  if (input.language === "ne" && response.parsed_output && !looksNepali(finish(response.parsed_output, input.research.visualPlan.length, "ne"))) {
    // The answer came back in English: ask once more, saying so plainly.
    console.warn("Script: the Nepali script came back in English. Asking Claude again.");
    response = await askClaudeForScript(model, system, `${prompt}\n\nYour last answer was in ENGLISH. Write it again, this time in NEPALI (Devanagari).`);
    costs.push(claudeCost(model, response.usage));
    // Never make a "Nepali" video in English.
    if (response.parsed_output && !looksNepali(finish(response.parsed_output, input.research.visualPlan.length, "ne"))) {
      throw new Error("The Nepali script came back in English twice.");
    }
  }
  if (response.stop_reason === "refusal") throw new Error(`Script request (${input.language}) was declined by the model.`);
  if (!response.parsed_output) throw new Error(`Could not read the ${input.language} script from the model.`);

  return { script: finish(response.parsed_output, input.research.visualPlan.length, input.language), costs };
}

function askClaudeForScript(model: string, system: string, prompt: string) {
  return claude().beta.messages.parse({
    model,
    max_tokens: 16000,
    ...fallbackOptions(),
    output_config: { effort: "high", format: betaZodOutputFormat(ScriptSchema) },
    system,
    messages: [{ role: "user", content: prompt }],
  });
}
