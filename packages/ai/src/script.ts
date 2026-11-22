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
            }),
          )
          .describe("The line cut into 1-3 pieces: start a new piece where the line names a new thing to show"),
      }),
    )
    .describe("Exactly one entry per visual plan scene, same order"),
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

type ScriptInput = { language: Language; title: string; format: "SHORT" | "LONG"; research: Research };

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
      ? "The whole script must take about 40-55 seconds to speak."
      : "The whole script must take about 8-12 minutes to speak.";

  return {
    system: `You are a scriptwriter for a bilingual (Nepali + English) educational video channel.
Only use facts from the research. Never invent numbers.
${STYLE[language]}`,
    prompt: `Write the ${language === "ne" ? "NEPALI" : "ENGLISH"} narration for this video.
Topic: ${input.title}
${length}

Rules (the picture changes with every scene, so the words must fit the picture):
- Write exactly one narration entry for each scene, same order, numbered 1 to ${research.visualPlan.length}.
- Each entry says ONLY that scene's "say" idea, and talks about what is "on screen" at that moment.
  Never talk about the next scene's thing early, and never go back to an earlier one.
- Each entry: one or two short sentences, at most ${MAX_SCENE_WORDS[language]} words.
- Scene 1 is a strong hook (surprise or question). No greeting, no "welcome", no "in this video".
- No filler ("did you know that..." more than once, "interestingly", "let's find out").
- Each fact only once. The last scene is a short call to action (follow for more).
- Plain spoken words only: no emojis, hashtags, brackets, stage directions or "Scene 1:" labels.

Pictures inside a line ("parts"):
- Cut each line into 1-3 parts, word for word, so that the picture can change the moment
  the narrator names a new thing. Example: "Yaks live in the high Himalaya, | above the forests and jungles."
  -> part 1 "Yaks live in the high Himalaya," = "yak himalaya mountain", part 2 "above the forests and jungles." = "himalayan forest valley".
- Each part has at least 4 words. Do not cut in the middle of a name.
- This works for ANY topic: whenever the line names something a viewer could see (an animal, a place,
  a food, a building, a vehicle, a body part, a kind of person, a natural thing, an action), start a part there.
- visualQuery is always in ENGLISH, and shows exactly the thing that part names.
- The call to action is one part, visualQuery "smartphone like button".

Summary:
${research.summary}

Facts you may use:
${factsText}

Scenes:
${scenesText}`,
  };
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

type SceneInput = { order: number; text: string; parts?: { text: string; visualQuery: string }[] };

/** Clean the parts; drop the parts if fewer than 2 remain (one part = one picture anyway). */
function cleanParts(parts: { text: string; visualQuery: string }[]): { text: string; visualQuery: string }[] {
  const clean = parts
    .map((p) => ({ text: cleanLine(p.text), visualQuery: p.visualQuery.replace(/\s+/g, " ").trim() }))
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
  };
}

/** Tidy the AI's answer: Unicode, clean lines, and each line matched to its picture. */
function finish(script: Script, planLength: number, language: Language): Script {
  const tidy = normalise(script);
  const scenes = alignScenes(tidy.scenes, planLength);
  if (scenes.length === 0) throw new Error(`The ${language} script came back without any narration.`);
  return { ...tidy, scenes };
}

export async function writeScript(input: ScriptInput): Promise<{ script: Script; costs: CostLine[] }> {
  // Practice mode: no API call, no cost.
  if (isMockAI()) return { script: mockScript(input), costs: [] };
  const { system, prompt } = scriptPrompt(input);

  // Free plan: Gemini.
  if (aiProvider() === "gemini") {
    const { value, cost } = await askGeminiJson(ScriptSchema, { system, prompt });
    return { script: finish(value, input.research.visualPlan.length, input.language), costs: [cost] };
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

  return {
    script: finish(response.parsed_output, input.research.visualPlan.length, input.language),
    costs: [claudeCost(model, response.usage)],
  };
}
