/**
 * PRACTICE MODE (AI_MODE=mock)
 *
 * Fake research and scripts that cost nothing and need no API key.
 * They let you test the whole pipeline (voice, subtitles, dashboard) while
 * the real Claude key is not set up yet. The text is clearly marked as
 * practice data, so it can never be mistaken for a real video script.
 */
import type { Language } from "@dualflow/shared";
import type { Research } from "./research";
import type { Script } from "./script";

/** True when the app should use fake AI answers instead of calling Claude. */
export function isMockAI(): boolean {
  return (process.env.AI_MODE ?? "").toLowerCase() === "mock";
}

export function mockResearch(input: { title: string; format: "SHORT" | "LONG" }): Research {
  const t = input.title;
  return {
    summary: `PRACTICE DATA (no AI key): a short explainer about "${t}". Real research will replace this text when AI_MODE is not "mock".`,
    facts: [
      { claim: `Practice fact 1 about ${t}.`, sourceUrl: "" },
      { claim: `Practice fact 2 about ${t}.`, sourceUrl: "" },
      { claim: `Practice fact 3 about ${t}.`, sourceUrl: "" },
    ],
    // The same 5 scenes are used by BOTH languages, like the real pipeline.
    visualPlan: [
      { purpose: "hook", idea: `Grab attention with a question about ${t}`, visualQuery: "curious person looking up" },
      { purpose: "point", idea: `First main point about ${t}`, visualQuery: "nepal landscape" },
      { purpose: "point", idea: `Second main point about ${t}`, visualQuery: "city street kathmandu" },
      { purpose: "example", idea: `A simple real-life example`, visualQuery: "people talking" },
      { purpose: "call_to_action", idea: "Ask viewers to like and follow", visualQuery: "phone like button" },
    ],
  };
}

/** Sentences for each scene, written in each language (not translated word by word). */
const LINES: Record<Language, (t: string) => string[]> = {
  ne: (t) => [
    `आजको विषय: "${t}"। के तपाईंलाई यसबारे थाहा छ?`,
    `पहिलो कुरा, यो विषय हाम्रो दैनिक जीवनसँग जोडिएको छ।`,
    `दोस्रो कुरा, धेरै मानिसहरूले यसबारे अझै राम्ररी बुझेका छैनन्।`,
    `उदाहरणका लागि, गाउँ र सहर दुवै ठाउँमा यसको असर देखिन्छ।`,
    `भिडियो मन पर्यो भने लाइक र फलो गर्नुहोस्। धन्यवाद!`,
  ],
  en: (t) => [
    `Today's topic: "${t}". How much do you know about it?`,
    `First, this topic is connected to our daily life.`,
    `Second, many people still do not understand it well.`,
    `For example, you can see its effect in villages and cities.`,
    `If you liked this video, please like and follow. Thank you!`,
  ],
};

export function mockScript(input: { language: Language; title: string; research: Research }): Script {
  const lines = LINES[input.language](input.title);
  const isNe = input.language === "ne";
  return {
    title: isNe ? `${input.title} — अभ्यास भिडियो` : `${input.title} (practice video)`,
    description: isNe
      ? "यो अभ्यास (practice) स्क्रिप्ट हो। AI कुञ्जी (key) थपेपछि वास्तविक स्क्रिप्ट बन्छ।"
      : "This is a PRACTICE script. A real script is written once the AI key is added.",
    hashtags: isNe ? ["नेपाल", "अभ्यास", "DualFlow"] : ["Nepal", "Practice", "DualFlow"],
    thumbnailHeadline: isNe ? "अभ्यास भिडियो" : "Practice video",
    // One line per visual plan scene, in the same order.
    scenes: input.research.visualPlan.map((_, i) => ({
      order: i + 1,
      text: (lines[i] ?? lines[lines.length - 1]!).normalize("NFC"),
    })),
  };
}
