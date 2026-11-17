/**
 * Step 1: research a topic on the web, then turn the notes into
 * (a) a list of checked facts with sources and
 * (b) one shared visual plan that BOTH language videos will use.
 */
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, currentModel, fallbackOptions, maxWebSearches } from "./client";
import { claudeCost, type CostLine } from "./cost";

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
        idea: z.string().describe("What this scene says, in one English sentence"),
        visualQuery: z.string().describe("Short English search phrase for stock footage, e.g. 'tea garden Ilam morning'"),
      }),
    )
    .describe("Ordered scenes. Shorts: 5-7 scenes. Long videos: 12-20 scenes."),
});
export type Research = z.infer<typeof ResearchSchema>;

const RESEARCH_SYSTEM = `You are the research desk for a Nepali + English educational video channel.
Find accurate, recent information. Prefer official, academic and established news sources.
Only keep facts you can support with a source. If sources disagree, say so in the summary.`;

export async function researchTopic(input: {
  title: string;
  notes?: string | null;
  format: "SHORT" | "LONG";
}): Promise<{ research: Research; costs: CostLine[] }> {
  const ai = claude();
  const model = currentModel();
  const costs: CostLine[] = [];

  // Call 1: search the web and write research notes (free text with sources).
  const notesResponse = await ai.beta.messages.create({
    model,
    max_tokens: 16000,
    ...fallbackOptions(),
    output_config: { effort: "medium" },
    system: RESEARCH_SYSTEM,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxWebSearches() }],
    messages: [
      {
        role: "user",
        content: `Research this video topic: "${input.title}".${input.notes ? `\nCreator notes: ${input.notes}` : ""}
Write research notes: key facts (each with its source URL), useful numbers, and anything specific to Nepal or Nepali viewers.`,
      },
    ],
  });
  if (notesResponse.stop_reason === "refusal") throw new Error("Research request was declined by the model.");
  costs.push(claudeCost(model, notesResponse.usage));

  const notes = notesResponse.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

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
        content: `Topic: "${input.title}". Video format: ${input.format === "SHORT" ? "vertical short, about 60 seconds" : "long video, 8-12 minutes"}.
Using ONLY these research notes, produce the facts list and the visual plan.

<research_notes>
${notes}
</research_notes>`,
      },
    ],
  });
  if (planned.stop_reason === "refusal") throw new Error("Planning request was declined by the model.");
  costs.push(claudeCost(model, planned.usage));
  if (!planned.parsed_output) throw new Error("Could not read the research plan from the model.");

  return { research: planned.parsed_output, costs };
}
