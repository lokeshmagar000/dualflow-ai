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
import { aiProvider } from "./provider";
import { askGemini, askGeminiJson } from "./gemini";
import { videoStyle } from "@dualflow/shared";

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
        mustShow: z
          .string()
          .default("")
          .describe(
            "In plain English, exactly what the picture MUST clearly show for this scene, specific enough to reject wrong pictures, e.g. 'the national flag of Nepal: two stacked crimson triangles with a blue border' or 'red rhododendron flowers'",
          ),
      }),
    )
    .describe("Ordered scenes, one spoken idea each. Shorts: 7-9 scenes. Long videos: 15-25 scenes."),
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
- "mustShow" says exactly what the picture must show; a picture check uses it to reject wrong pictures.
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

type ResearchInput = { title: string; notes?: string | null; format: "SHORT" | "LONG" };

/** The same two prompts are used by Claude and by Gemini. */
function notesPrompt(input: ResearchInput) {
  return `Research this video topic: "${input.title}".${input.notes ? `\nCreator notes: ${input.notes}` : ""}
Write research notes: key facts (each with its source URL), useful numbers, and anything specific to Nepal or Nepali viewers.`;
}
function planPrompt(input: ResearchInput, notes: string) {
  return `Topic: "${input.title}". Video format: ${input.format === "SHORT" ? (videoStyle() === "v2" ? "vertical short, 30-45 seconds" : "vertical short, about 60 seconds") : "long video, 8-12 minutes"}.
Using ONLY these research notes, produce the facts list and the visual plan.

${videoStyle() === "v2" ? V2_PLAN_RULES : CLASSIC_PLAN_RULES}
<research_notes>
${notes}
</research_notes>`;
}

/**
 * FREE research with Gemini: call 1 searches Google and writes notes,
 * call 2 turns the notes into facts + the visual plan (as checked JSON).
 * Set GEMINI_SEARCH=off if your free key does not allow Google Search.
 */
async function researchWithGemini(input: ResearchInput): Promise<{ research: Research; costs: CostLine[] }> {
  const search = (process.env.GEMINI_SEARCH ?? "on").toLowerCase() !== "off";
  const notes = await askGemini({ system: RESEARCH_SYSTEM, prompt: notesPrompt(input), search });
  const sourceList = notes.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
  const allNotes = sourceList ? `${notes.text}\n\nSources found by search:\n${sourceList}` : notes.text;

  const plan = await askGeminiJson(ResearchSchema, { system: RESEARCH_SYSTEM, prompt: planPrompt(input, allNotes) });
  return { research: plan.value, costs: [notes.cost, plan.cost] };
}

export async function researchTopic(input: ResearchInput): Promise<{ research: Research; costs: CostLine[] }> {
  // Practice mode: no API call, no cost.
  if (isMockAI()) return { research: mockResearch(input), costs: [] };
  if (aiProvider() === "gemini") return researchWithGemini(input);

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
    system: RESEARCH_SYSTEM,
    tools: [webSearchTool()],
    messages,
  });
  costs.push(claudeCost(model, notesResponse.usage));
  const textOf = (r: typeof notesResponse) =>
    r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const noteParts = [textOf(notesResponse)];

  // "pause_turn" means the server paused a long search loop. We send the
  // answer so far back and the server continues where it stopped (max 3 times).
  for (let i = 0; i < 3 && notesResponse.stop_reason === "pause_turn"; i++) {
    notesResponse = await ai.beta.messages.create({
      model,
      max_tokens: 16000,
      ...fallbackOptions(),
      output_config: { effort: "medium" },
      system: RESEARCH_SYSTEM,
      tools: [webSearchTool()],
      messages: [...messages, { role: "assistant", content: notesResponse.content }],
    });
    costs.push(claudeCost(model, notesResponse.usage));
    noteParts.push(textOf(notesResponse));
  }
  if (notesResponse.stop_reason === "refusal") throw new Error("Research request was declined by the model.");

  const notes = noteParts.join("\n").trim();
  if (!notes) throw new Error("Research found nothing. Try a clearer topic.");

  // Call 2: turn the notes into structured facts and a shared visual plan.
  const planned = await ai.beta.messages.parse({
    model,
    max_tokens: 16000,
    ...fallbackOptions(),
    output_config: { effort: "medium", format: betaZodOutputFormat(ResearchSchema) },
    system: RESEARCH_SYSTEM,
    messages: [
      {
        role: "user",
        content: planPrompt(input, notes),
      },
    ],
  });
  if (planned.stop_reason === "refusal") throw new Error("Planning request was declined by the model.");
  costs.push(claudeCost(model, planned.usage));
  if (!planned.parsed_output) throw new Error("Could not read the research plan from the model.");

  return { research: planned.parsed_output, costs };
}
