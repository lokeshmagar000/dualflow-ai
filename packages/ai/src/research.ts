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
        purpose: z.enum(["hook", "point", "example", "call_to_action"]),
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
      }),
    )
    .describe("Ordered scenes, one spoken idea each. Shorts: 7-9 scenes. Long videos: 15-25 scenes."),
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

type ResearchInput = { title: string; notes?: string | null; format: "SHORT" | "LONG" };

/** The same two prompts are used by Claude and by Gemini. */
function notesPrompt(input: ResearchInput) {
  return `Research this video topic: "${input.title}".${input.notes ? `\nCreator notes: ${input.notes}` : ""}
Write research notes: key facts (each with its source URL), useful numbers, and anything specific to Nepal or Nepali viewers.`;
}
function planPrompt(input: ResearchInput, notes: string) {
  return `Topic: "${input.title}". Video format: ${input.format === "SHORT" ? "vertical short, about 60 seconds" : "long video, 8-12 minutes"}.
Using ONLY these research notes, produce the facts list and the visual plan.

How to build the visual plan (the pictures must match the words):
- Each scene is ONE spoken idea: one or two short sentences, about 4-7 seconds of speech.
- Scene 1 is the hook: the most surprising fact or a question. No greeting, no "in this video".
- Then the facts, one per scene, in an order that tells a little story. The last fact is the best "wow".
- The last scene is a short call to action (follow for more facts).
- "idea" must say the actual fact (with its number), not just "talk about the history".
- "visualQuery" must show exactly what that scene talks about, as something a camera can film.
  If the fact is abstract (a number, a date, a record), show the thing it is about:
  "Everest grows 4 mm a year" -> "snowy mountain peak", not "growth" or "number".
- Stock sites have no famous people, logos, maps or charts: never ask for them.
- Use different pictures for different scenes (no two scenes with the same visualQuery).

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
