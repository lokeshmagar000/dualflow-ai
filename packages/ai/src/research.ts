/**
 * Step 1: research a topic on the web, then turn the notes into
 * (a) a list of checked facts with sources and
 * (b) one shared visual plan that BOTH language videos will use.
 */
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, currentModel, fallbackOptions, webSearchTool } from "./client";
import { claudeCost, type CostLine } from "./cost";
import { isMockAI, mockResearch } from "./mock";
import { withGeminiBackup } from "./provider";
import { askGemini, askGeminiJson } from "./gemini";
import { NEUTRAL_RULES, videoStyle } from "@dualflow/shared";
import type { TopicSource } from "./politics";

export const ResearchSchema = z.object({
  summary: z.string().describe("3-5 sentence summary of what the video should explain"),
  facts: z
    .array(
      z.object({
        claim: z.string().describe("One clear, checkable fact in English"),
        sourceUrl: z.string().describe("URL of the page that supports the fact, or empty string"),
      }),
    )
    .describe("5-10 facts, each supported by a source"),
  visualPlan: z
    .array(
      z.object({
        purpose: z.enum(["hook", "point", "example", "open_loop", "payoff", "loop_back", "call_to_action"]),
        idea: z
          .string()
          .describe("The ONE thing the narrator says in this scene, as one short English sentence with the real fact or number"),
        visualQuery: z
          .string()
          .describe(
            "2-4 English words for stock footage that SHOWS what this scene says: a concrete thing a camera can film, e.g. 'yak walking snow', 'climbers on ice ridge'. Never abstract words, text, maps, charts or famous people",
          ),
        backupQuery: z
          .string()
          .describe("1-2 simpler English words for the same picture, used if nothing is found, e.g. 'yak', 'mountain climber'"),
        altQuery: z
          .string()
          .default("")
          .describe(
            "2-4 English words for a SECOND, different view of the SAME subject (shown when the line is long), e.g. visualQuery 'hydropower dam nepal' -> altQuery 'river water turbine'; 'everest snowy peak' -> 'himalaya aerial view'",
          ),
        mustShow: z
          .string()
          .default("")
          .describe(
            "In plain English, exactly what the picture MUST clearly show for this scene, specific enough to reject wrong pictures, e.g. 'the national flag of Nepal: two stacked crimson triangles with a blue border' or 'red rhododendron flowers'",
          ),
      }),
    )
    .describe("Ordered scenes, one spoken idea each. Shorts: 7-9 scenes. Full videos (4-5 minutes): 45-60 scenes."),
  chapters: z
    .array(
      z.object({
        title: z.string().describe("2-5 English words naming this part, e.g. 'What was signed'"),
        firstScene: z.number().int().describe("Number of the first scene of this part (1, 2, 3...)"),
        lastScene: z.number().int().describe("Number of the last scene of this part"),
      }),
    )
    .default([])
    .describe("FULL VIDEOS only (shorts: empty): 4-6 parts in order, each 35-60 seconds, together covering every scene after the hook"),
  broll: z
    .array(
      z.object({
        query: z.string().describe("2-4 English words for stock footage, always naming the topic's place or subject, e.g. 'nepali people festival', 'kathmandu durbar square', 'nepal map'"),
        mustShow: z.string().describe("Plain English: what that picture must clearly show, e.g. 'Nepali people at a festival in Nepal'"),
      }),
    )
    .default([])
    .describe(
      "6-10 extra ON-TOPIC pictures that mix things around the subject: its people, places, daily life, culture, nature, a map of the country. Used between the main pictures so the video never stays on one thing",
    ),
  focus: z
    .string()
    .default("")
    .describe("The exact subject of the whole video in a few English words, e.g. 'Nepal\'s national flag'. Used to keep every picture on topic"),
  thumbnailQuery: z
    .string()
    .describe(
      "Short English stock PHOTO search phrase for the thumbnail: the main subject of the video, striking and easy to recognise, e.g. 'mount everest summit sunrise'",
    ),
});
export type Research = z.infer<typeof ResearchSchema>;

const RESEARCH_SYSTEM = `You are the research desk for a Nepali + English educational video channel.
Find accurate, recent information. Prefer official, academic and established news sources.
Only keep facts you can support with a source. If sources disagree, say so in the summary.`;

/** Rules for pictures, both styles. */
const PICTURE_RULES = `- "idea" must say the actual fact (with its number), not just "talk about the history".
- "visualQuery" must show exactly what that scene talks about, as something a camera can film.
  If the fact is abstract (a number, a date, a record), show the thing it is about:
  "Everest grows 4 mm a year" -> "everest snowy peak", not "growth" or "number".
- STAY ON THE TOPIC. When the video is about one country, place or thing, put its name in every
  visualQuery that shows it: "nepal flag" (never just "flag"), "kathmandu temple" (never just "temple").
  When a line talks about the whole world or all countries, show "world map" or "globe earth",
  never one random country's flag or city.
- SUBJECT FIRST: every scene's picture shows the SUBJECT of its own sentence, so viewers see what they hear.
  Hydropower -> "hydropower dam river"; heritage -> "kathmandu durbar square temple"; mountains -> "himalaya peaks";
  water -> "river water"; sea -> "ocean waves"; trade -> "cargo trucks border"; rail -> "railway train tracks".
  When the sentence is about a person or a meeting, show the place or thing it is about
  ("new delhi parliament", "nepal india border gate", "government building flags") - never an unrelated scene.
- "altQuery" is another view of the same subject (another angle or detail), never a different subject.
- Make it beautiful: prefer lively, cinematic shots (aerial views, moving water, golden light, busy streets)
  over plain or static ones, as long as they show the subject.
- "mustShow" names the subject of the sentence exactly; a picture check uses it to reject wrong pictures.
- VARIETY: the viewer must never watch the same thing for long. Also list "broll": 6-10 extra pictures
  around the subject (its people, places, daily life, culture, nature, a map), all clearly on the topic.
  Example for Nepal's flag: "nepali people holding flag", "kathmandu durbar square", "nepal map",
  "himalaya village nepal", "nepali festival dance". Never another country's things.
- Always prefer real places and real people. Never pictures of one object alone on a plain background.
- Stock sites have no famous people, logos or charts: never ask for them.
- Use different pictures for different scenes (no two scenes with the same visualQuery).

`;

/** Older style: hook, facts, then a call to action at the end. */
const CLASSIC_PLAN_RULES = `How to build the visual plan (the pictures must match the words):
- Each scene is ONE spoken idea: one or two short sentences, about 4-7 seconds of speech.
- Scene 1 is the hook: the most surprising fact or a question. No greeting, no "in this video".
- Then the facts, one per scene, in an order that tells a little story. The last fact is the best "wow".
- The last scene is a short call to action (follow for more facts).
${PICTURE_RULES}`;

/**
 * Style V2: a story shape that keeps people watching (see the style guide):
 * hook -> first fact fast -> open loop -> facts -> payoff (the biggest wow) -> loop line.
 */
const V2_PLAN_RULES = `How to build the visual plan (the pictures must match the words). Shorts: 7-9 scenes, 30-45 seconds in total:
- Each scene is ONE spoken idea: one short sentence, about 3-5 seconds of speech.
- Scene 1 (purpose "hook"): ONE sentence under 10 words that opens a question the video answers later.
  Use one of these shapes: break a rule ("Every flag is a rectangle. Except one."), a shocking number,
  "you were told wrong", a hidden secret, "only one / the first", or a direct "why" question.
  Never give the answer in the hook. No greeting, no "in this video", no "did you know".
- Scene 2 (purpose "point"): the first fact, fast.
- One scene in the middle (purpose "open_loop") promises more: "But that's not even the strangest part."
- Then the other facts (purpose "point" or "example").
- The second-to-last scene (purpose "payoff") is the biggest surprise: save the best fact for here.
- The last scene (purpose "loop_back") ends the story so that it leads straight back into the hook
  when the video replays (e.g. hook "Every flag is a rectangle. Except one." -> last line
  "That's why it's the only flag on Earth that breaks the rule."). NO "like and follow", no goodbye.
${PICTURE_RULES}`;

/**
 * NEWS / POLITICS story shape (overrides the hook and ending rules above).
 * Tested ideas: a curious "why?" question as the hook, then 3 clear parts, and a neutral question at the end.
 */
function NEWS_STORY_RULES(seriesName: string) {
  const news = /news/i.test(seriesName);
  return `NEWS VIDEO SHAPE (these override the hook, open loop and ending rules above). 7-9 scenes, 30-45 seconds:
- Scene 1 (purpose "hook"): a curious, neutral "why / what / how" question under 10 words that the video answers,
  e.g. "Why did Nepal's Prime Minister fly to Delhi this week?". No hype words ("shocking", "you won't believe").
${
  news
    ? `- Then 3 parts, in order: WHAT HAPPENED (who, what, where, when: 2-3 scenes, purpose "point"),
  WHY IT MATTERS (background and numbers from the facts: 2 scenes, purpose "example"; the strongest fact is purpose "payoff"),
  WHAT HAPPENS NEXT (only what official sources or the news say: 1 scene, purpose "point").`
    : `- Then "3 things you probably didn't know" about the topic: say "number one", "number two", "number three"
  (purpose "point", "example", and "payoff" for the third and most surprising one), each with its fact and date or number.`
}
- No "open_loop" scene.
- The last scene (purpose "loop_back") asks viewers ONE neutral question for the comments, with no opinion in it,
  e.g. "Which agreement should we explain next? Tell us in the comments."
- Pictures (visualQuery): real places and things only: "kathmandu city", "nepal parliament building singha durbar",
  "new delhi india gate", "nepal flag waving", "ballot box voting", "hydropower dam nepal". Never ask for a politician.`;
}

/**
 * FULL VIDEO (4-5 minutes, wide 16:9 for YouTube): the same picture rules, a longer story shape,
 * and CHAPTERS. Each chapter is one complete idea of 35-60 seconds, so it can also be cut out
 * of the full video as a short later (no new AI writing needed).
 */
const LONG_PLAN_RULES = `How to build the visual plan for a FULL VIDEO (4-5 minutes, about 600-700 spoken English words):
- 45-60 scenes. Each scene is ONE spoken idea: one or two short sentences, about 4-6 seconds of speech.
- Scene 1 (purpose "hook"): ONE curious sentence under 12 words that the video answers. No greeting, no "in this video".
- Scene 2 (purpose "point"): in one sentence, what the viewer will learn ("Here is what was agreed, and why it matters").
- Then 4-6 CHAPTERS ("chapters" list). Each chapter is 6-11 scenes (35-60 seconds) and is ONE complete idea that would
  make sense on its own as a short: its first scene opens the idea with a mini-hook, its last scene closes it.
  Give each chapter a 2-5 word title.
- Inside chapters use purposes "point" and "example"; the most surprising fact of the whole video is purpose "payoff".
- One scene in the first half (purpose "open_loop") promises something that comes later ("And the biggest number is still to come.").
- The last 1-2 scenes (purpose "call_to_action"): a one-line summary, then ONE neutral question for the comments
  and an invitation to subscribe. They are not part of any chapter.
- Every chapter has at least 3 facts with numbers, names, places or dates. Never repeat a fact.
- broll: 12-16 extra pictures (a long video needs more variety).
${PICTURE_RULES}`;

/** FULL VIDEO about the news: what happened, the details, why it matters, what next. Neutral. */
const LONG_NEWS_RULES = `NEWS FULL VIDEO SHAPE (overrides the hook rule above):
- Scene 1 (purpose "hook"): a curious, neutral "why / what / how" question under 12 words. No hype words.
- Suggested chapters (adapt them to the facts): WHAT HAPPENED (who, where, when) -> THE MAIN DETAILS (numbers, agreements,
  projects; this may be 2 chapters) -> THE BACKGROUND (history and earlier numbers that explain it) ->
  WHY IT MATTERS FOR NEPALI PEOPLE (jobs, travel, prices, daily life, only from the facts) -> WHAT HAPPENS NEXT (only what official sources or the news say).
- Say who said or reported each claim ("according to India's foreign ministry").
- Pictures (visualQuery): real places and things only: "kathmandu city", "nepal parliament building singha durbar",
  "new delhi india gate", "nepal flag waving", "railway train nepal", "hydropower dam nepal". Never ask for a politician.`;

type ResearchInput = {
  title: string;
  notes?: string | null;
  format: "SHORT" | "LONG";
  /** Nepal Politics videos: the series and the real news the topic came from. */
  politics?: { seriesName: string; sources: TopicSource[] } | null;
};

/** The research system prompt; politics videos add the neutral rules. */
function systemFor(input: ResearchInput) {
  return input.politics ? `${RESEARCH_SYSTEM}\n${NEUTRAL_RULES}` : RESEARCH_SYSTEM;
}

/** Politics: the facts the video may use must come with sources. */
export const MIN_POLITICS_SOURCES = 3;
export function checkPoliticsSources(research: Pick<Research, "facts">, found: { url: string }[] = []) {
  const withSource = research.facts.filter((f) => f.sourceUrl.trim()).length;
  if (Math.max(withSource, found.length) < MIN_POLITICS_SOURCES) {
    throw new Error(
      `Politics video stopped: only ${Math.max(withSource, found.length)} source(s) were found (at least ${MIN_POLITICS_SOURCES} needed). Nothing is made without sources.`,
    );
  }
  // Facts without a source are dropped: a politics video only says what a source supports.
  research.facts = research.facts.filter((f) => f.sourceUrl.trim());
}

/** The same two prompts are used by Claude and by Gemini. */
function notesPrompt(input: ResearchInput) {
  const p = input.politics;
  const news = p?.sources.length
    ? `\nThis topic comes from this REAL news (read it and other reports of the same event; never add events that are not reported):\n${p.sources
        .map((s) => `- ${s.title} (${s.publisher}${s.publishedAt ? `, ${s.publishedAt.slice(0, 10)}` : ""}) ${s.url}`)
        .join("\n")}`
    : "";
  const politics = p
    ? `\nThis is a "${p.seriesName}" video of a Nepal politics series. Use official sources first (Election Commission, parliament, the constitution, government press releases), then major news. Only write facts that a source states.`
    : "";
  const long = input.format === "LONG"
    ? "\nThis is for a FULL 4-5 minute video: collect 15-25 facts (numbers, names, dates, places, background and what happens next), each with its source."
    : "";
  return `Research this video topic: "${input.title}".${input.notes ? `\nCreator notes: ${input.notes}` : ""}${news}${politics}${long}
Write research notes: key facts (each with its source URL), useful numbers, and anything specific to Nepal or Nepali viewers.`;
}
function planPrompt(input: ResearchInput, notes: string) {
  const long = input.format === "LONG";
  const shape = long ? LONG_PLAN_RULES : videoStyle() === "v2" ? V2_PLAN_RULES : CLASSIC_PLAN_RULES;
  const news = input.politics ? `\n${long ? LONG_NEWS_RULES : NEWS_STORY_RULES(input.politics.seriesName)}` : "";
  return `Topic: "${input.title}". Video format: ${input.format === "SHORT" ? (videoStyle() === "v2" ? "vertical short, 30-45 seconds" : "vertical short, about 60 seconds") : "FULL VIDEO, 4-5 minutes, wide 16:9 for YouTube"}.
Using ONLY these research notes, produce the facts list${long ? " (12-20 facts for a full video)" : ""}, the visual plan${long ? " and the chapters" : ""}.

${shape}${input.politics ? `${news}\n${NEUTRAL_RULES}\n- Every fact MUST have its sourceUrl. Drop any fact without one.\n- Pictures: no photos of politicians (stock sites do not have them); show places, buildings, flags, maps, documents, ballot boxes, people voting.\n` : ""}
<research_notes>
${notes}
</research_notes>`;
}

/**
 * FREE research with Gemini: call 1 searches Google and writes notes,
 * call 2 turns the notes into facts + the visual plan (as checked JSON).
 * Set GEMINI_SEARCH=off if your free key does not allow Google Search.
 */
async function researchWithGemini(input: ResearchInput): Promise<ResearchResult> {
  const search = (process.env.GEMINI_SEARCH ?? "on").toLowerCase() !== "off";
  const notes = await askGemini({ system: systemFor(input), prompt: notesPrompt(input), search });
  const sourceList = notes.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
  const allNotes = sourceList ? `${notes.text}\n\nSources found by search:\n${sourceList}` : notes.text;

  const plan = await askGeminiJson(ResearchSchema, { system: systemFor(input), prompt: planPrompt(input, allNotes) });
  return { research: plan.value, costs: [notes.cost, plan.cost], sources: notes.sources };
}

/** `sources` = the web pages the search really used (saved for the on-screen "Source:" line). */
type ResearchResult = { research: Research; costs: CostLine[]; sources: { url: string; title: string }[] };

export async function researchTopic(input: ResearchInput): Promise<ResearchResult> {
  const result = await researchAny(input);
  if (input.politics) {
    // Practice mode has no real sources: only the real AI must pass this check.
    if (!isMockAI()) checkPoliticsSources(result.research, result.sources);
    // Keep the news the topic came from too.
    for (const s of input.politics.sources) result.sources.unshift({ url: s.url, title: s.publisher || s.title });
  }
  return result;
}

async function researchAny(input: ResearchInput): Promise<ResearchResult> {
  // Practice mode: no API call, no cost.
  if (isMockAI()) return { research: mockResearch(input), costs: [], sources: [] };
  return withGeminiBackup("Research", () => researchWithClaude(input), () => researchWithGemini(input));
}

/** Research with Claude: call 1 searches the web and writes notes, call 2 makes the checked plan. */
async function researchWithClaude(input: ResearchInput): Promise<ResearchResult> {
  const ai = claude();
  const model = currentModel();
  const costs: CostLine[] = [];

  // Call 1: search the web and write research notes (free text with sources).
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: notesPrompt(input),
    },
  ];
  let notesResponse = await ai.beta.messages.create({
    model,
    max_tokens: 16000,
    ...fallbackOptions(),
    output_config: { effort: "medium" },
    system: systemFor(input),
    tools: [webSearchTool(input.format === "LONG" ? 5 : undefined)],
    messages,
  });
  costs.push(claudeCost(model, notesResponse.usage));
  const textOf = (r: typeof notesResponse) =>
    r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const noteParts = [textOf(notesResponse)];
  // The web pages the search really found (for the on-screen "Source:" line).
  const sources: { url: string; title: string }[] = [];
  const keepSources = (r: typeof notesResponse) => {
    for (const block of r.content) {
      // A failed search returns an error object instead of a list: skip it.
      if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
      for (const hit of block.content) {
        if (hit.type === "web_search_result" && hit.url && !sources.some((s) => s.url === hit.url)) sources.push({ url: hit.url, title: hit.title ?? "" });
      }
    }
  };
  keepSources(notesResponse);

  // "pause_turn" means the server paused a long search loop. We send the
  // answer so far back and the server continues where it stopped (max 3 times).
  for (let i = 0; i < 3 && notesResponse.stop_reason === "pause_turn"; i++) {
    notesResponse = await ai.beta.messages.create({
      model,
      max_tokens: 16000,
      ...fallbackOptions(),
      output_config: { effort: "medium" },
      system: systemFor(input),
      tools: [webSearchTool(input.format === "LONG" ? 5 : undefined)],
      messages: [...messages, { role: "assistant", content: notesResponse.content }],
    });
    costs.push(claudeCost(model, notesResponse.usage));
    noteParts.push(textOf(notesResponse));
    keepSources(notesResponse);
  }
  if (notesResponse.stop_reason === "refusal") throw new Error("Research request was declined by the model.");

  const notes = noteParts.join("\n").trim();
  if (!notes) throw new Error("Research found nothing. Try a clearer topic.");

  // Call 2: turn the notes into structured facts and a shared visual plan.
  // A full video's plan (45-60 scenes) needs more room. Above ~21,000 tokens the SDK wants either
  // streaming or a timeout of our own, so we give one (the answer comes in one piece, as before).
  const long = input.format === "LONG";
  const planned = await ai.beta.messages.parse(
    {
      model,
      max_tokens: long ? 48000 : 16000,
      ...fallbackOptions(),
      output_config: { effort: "medium", format: betaZodOutputFormat(ResearchSchema) },
      system: systemFor(input),
      messages: [
        {
          role: "user",
          content: planPrompt(input, notes),
        },
      ],
    },
    long ? { timeout: 30 * 60_000 } : undefined,
  );
  if (planned.stop_reason === "refusal") throw new Error("Planning request was declined by the model.");
  costs.push(claudeCost(model, planned.usage));
  if (!planned.parsed_output) throw new Error("Could not read the research plan from the model.");

  return { research: planned.parsed_output, costs, sources: sources.slice(0, 12) };
}
