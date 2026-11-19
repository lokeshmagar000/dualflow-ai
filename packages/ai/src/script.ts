/**
 * Step 2: write the script for ONE language.
 * Each language is written natively from the same research and the same
 * visual plan, so the Nepali script sounds natural, not translated.
 */
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Language } from "@dualflow/shared";
import { claude, currentModel, fallbackOptions } from "./client";
import { claudeCost, type CostLine } from "./cost";
import type { Research } from "./research";
import { isMockAI, mockScript } from "./mock";
import { aiProvider } from "./provider";
import { askGeminiJson } from "./gemini";

export const ScriptSchema = z.object({
  title: z.string().describe("Video title in the target language, max 90 characters"),
  description: z.string().describe("Video description in the target language, 2-4 short paragraphs"),
  hashtags: z.array(z.string()).describe("5-8 hashtags without the # sign"),
  thumbnailHeadline: z.string().describe("2-5 punchy words for the thumbnail, target language"),
  scenes: z
    .array(
      z.object({
        order: z.number().int().describe("Same order number as the visual plan scene"),
        text: z.string().describe("What the narrator says in this scene, target language"),
      }),
    )
    .describe("Exactly one entry per visual plan scene, same order"),
});
export type Script = z.infer<typeof ScriptSchema>;

/** Language-specific writing rules. The Nepali rules are what make the voice sound natural. */
const STYLE: Record<Language, string> = {
  ne: `Write in natural, everyday spoken Nepali (Devanagari script), the way a friendly Nepali YouTuber talks.
- Do NOT translate from English word by word. Think in Nepali.
- Short sentences (under 15 words). Simple words most Nepali viewers know.
- Write ALL numbers as Nepali words, because the voice reads digits badly: "३ सय" -> "तीन सय", "2025" -> "दुई हजार पच्चीस".
- English brand or technical words are fine if Nepalis really use them (मोबाइल, इन्टरनेट); write them in Devanagari.
- Use proper Unicode Devanagari with correct punctuation (।).`,
  en: `Write in clear, friendly spoken English for a global audience.
- Short sentences (under 15 words). No jargon without a quick explanation.
- Write numbers as they should be spoken ("three hundred", "twenty twenty-five").`,
};

type ScriptInput = { language: Language; title: string; format: "SHORT" | "LONG"; research: Research };

/** The same prompt is used by Claude and by Gemini. */
function scriptPrompt(input: ScriptInput): { system: string; prompt: string } {
  const { language, research } = input;
  const scenesText = research.visualPlan
    .map((s, i) => `${i + 1}. [${s.purpose}] ${s.idea}`)
    .join("\n");
  const factsText = research.facts.map((f) => `- ${f.claim}`).join("\n");
  const length =
    input.format === "SHORT"
      ? "The whole script must take about 45-60 seconds to speak."
      : "The whole script must take about 8-12 minutes to speak.";

  return {
    system: `You are a scriptwriter for a bilingual (Nepali + English) educational video channel.
Only use facts from the research. Never invent numbers.
${STYLE[language]}`,
    prompt: `Write the ${language === "ne" ? "NEPALI" : "ENGLISH"} narration for this video.
Topic: ${input.title}
${length}
Start with a strong hook in the first scene. End with a short call to action (like, follow, comment).

Summary:
${research.summary}

Facts you may use:
${factsText}

Scenes (write exactly one narration entry for each, same order, numbered 1 to ${research.visualPlan.length}):
${scenesText}`,
  };
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
  };
}

export async function writeScript(input: ScriptInput): Promise<{ script: Script; costs: CostLine[] }> {
  // Practice mode: no API call, no cost.
  if (isMockAI()) return { script: mockScript(input), costs: [] };
  const { system, prompt } = scriptPrompt(input);

  // Free plan: Gemini.
  if (aiProvider() === "gemini") {
    const { value, cost } = await askGeminiJson(ScriptSchema, { system, prompt });
    return { script: normalise(value), costs: [cost] };
  }

  const model = currentModel();
  const response = await claude().beta.messages.parse({
    model,
    max_tokens: 32000,
    ...fallbackOptions(),
    output_config: { effort: "high", format: betaZodOutputFormat(ScriptSchema) },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") throw new Error(`Script request (${input.language}) was declined by the model.`);
  if (!response.parsed_output) throw new Error(`Could not read the ${input.language} script from the model.`);

  return { script: normalise(response.parsed_output), costs: [claudeCost(model, response.usage)] };
}
