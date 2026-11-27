/**
 * AI Content Director: picks the NEXT video topic by itself.
 *
 * The automatic run (apps/worker/src/auto-ideas.ts) calls this when you have
 * no unused ideas waiting. We send the titles of recent videos, so the AI
 * does not repeat a topic.
 *
 * Costs: 1 Gemini request (free) or 1 small Claude request.
 */
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, currentModel, fallbackOptions } from "./client";
import { claudeCost, type CostLine } from "./cost";
import { isMockAI } from "./mock";
import { withGeminiBackup } from "./provider";
import { askGeminiJson } from "./gemini";

export const TopicIdeaSchema = z.object({
  title: z.string().describe("The video topic in English, 4-12 words, e.g. 'Why Mount Everest grows taller every year'"),
  notes: z.string().describe("One or two sentences: the angle of the video and why viewers will care"),
});
export type TopicIdea = z.infer<typeof TopicIdeaSchema>;

/** What the channel is about. Change it with the AUTO_TOPIC_NICHE setting. */
export const DEFAULT_NICHE =
  "Surprising but true facts about science, space, nature, animals, history, the human body, technology and Nepal";

const SYSTEM = `You are the content director of "Namaste Facts", a short-video channel made in Nepali and English.
You choose ONE topic for the next 60-second vertical video.
Rules:
- The topic must be true, family friendly, and easy to check with reliable sources.
- No politics, religion fights, tragedies, medical advice, or news that may change tomorrow.
- It must interest viewers in Nepal AND worldwide. About one topic in three can be about Nepal.
- Make it curious: a question or a surprising claim works best.
- Never repeat or closely copy a recent topic.`;

function prompt(niche: string, recentTitles: string[]) {
  const recent = recentTitles.length ? recentTitles.map((t) => `- ${t}`).join("\n") : "(none yet)";
  return `Channel niche: ${niche}

Recent videos (do NOT repeat these or make something very similar):
${recent}

Pick the topic for the next video.`;
}

/** Practice mode: free topics from a fixed list, no AI call. */
const PRACTICE_TOPICS = [
  "Why Mount Everest grows a little taller every year",
  "How honey bees talk to each other with a dance",
  "Why the sky is blue but sunsets are orange",
  "The one-horned rhino of Chitwan and how it came back",
  "How octopuses can taste with their arms",
  "Why we cannot tickle ourselves",
  "How the Himalayas were made by two moving continents",
  "Why the Moon always shows us the same face",
];

export async function suggestTopic(input: {
  recentTitles: string[];
  niche?: string;
}): Promise<{ idea: TopicIdea; costs: CostLine[] }> {
  const niche = input.niche?.trim() || DEFAULT_NICHE;

  if (isMockAI()) {
    const used = new Set(input.recentTitles.map((t) => t.toLowerCase()));
    const title = PRACTICE_TOPICS.find((t) => !used.has(t.toLowerCase())) ?? `${PRACTICE_TOPICS[0]} (${Date.now()})`;
    return { idea: { title, notes: "Practice topic (AI_PROVIDER=mock)." }, costs: [] };
  }

  return withGeminiBackup(
    "Topic",
    () => topicWithClaude(niche, input.recentTitles),
    async () => {
      const { value, cost } = await askGeminiJson(TopicIdeaSchema, { system: SYSTEM, prompt: prompt(niche, input.recentTitles) });
      return { idea: value, costs: [cost] };
    },
  );
}

async function topicWithClaude(niche: string, recentTitles: string[]): Promise<{ idea: TopicIdea; costs: CostLine[] }> {
  const model = currentModel();
  const res = await claude().beta.messages.parse({
    model,
    max_tokens: 2000,
    ...fallbackOptions(),
    output_config: { effort: "low", format: betaZodOutputFormat(TopicIdeaSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt(niche, recentTitles) }],
  });
  if (!res.parsed_output) throw new Error("Could not read the topic from the model.");
  return { idea: res.parsed_output, costs: [claudeCost(model, res.usage)] };
}
