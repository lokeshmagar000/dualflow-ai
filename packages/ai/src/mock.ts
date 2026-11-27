/**
 * PRACTICE MODE (AI_PROVIDER=mock, or the older AI_MODE=mock)
 *
 * Fake research and scripts that cost nothing and need no API key.
 * They let you test the whole pipeline (voice, subtitles, dashboard) while
 * the real Claude key is not set up yet. The text is clearly marked as
 * practice data, so it can never be mistaken for a real video script.
 */
import type { Language } from "@dualflow/shared";
import type { Research } from "./research";
import type { Script } from "./script";
import { aiProvider } from "./provider";

/** True when the app should use fake AI answers instead of calling a real AI. */
export function isMockAI(): boolean {
  return aiProvider() === "mock";
}

export function mockResearch(input: { title: string; format: "SHORT" | "LONG" }): Research {
  const t = input.title;
  if (input.format === "LONG") return mockLongResearch(t);
  return {
    summary: `PRACTICE DATA (no AI key): a short explainer about "${t}". Real research will replace this text when AI_MODE is not "mock".`,
    facts: [
      { claim: `Practice fact 1 about ${t}.`, sourceUrl: "" },
      { claim: `Practice fact 2 about ${t}.`, sourceUrl: "" },
      { claim: `Practice fact 3 about ${t}.`, sourceUrl: "" },
    ],
    // The same 5 scenes are used by BOTH languages, like the real pipeline.
    visualPlan: [
      { purpose: "hook", idea: `Grab attention with a question about ${t}`, visualQuery: "curious person looking up", backupQuery: "curious person", altQuery: "", newsPhoto: "", mustShow: "a curious person" },
      { purpose: "point", idea: `First main point about ${t}`, visualQuery: "nepal landscape", backupQuery: "nepal", altQuery: "", newsPhoto: "", mustShow: "a landscape in Nepal" },
      { purpose: "point", idea: `Second main point about ${t}`, visualQuery: "city street kathmandu", backupQuery: "kathmandu", altQuery: "", newsPhoto: "", mustShow: "a street in Kathmandu" },
      { purpose: "example", idea: `A simple real-life example`, visualQuery: "people talking", backupQuery: "people", altQuery: "", newsPhoto: "", mustShow: "people talking" },
      { purpose: "call_to_action", idea: "Ask viewers to like and follow", visualQuery: "phone like button", backupQuery: "smartphone", altQuery: "", newsPhoto: "", mustShow: "a smartphone" },
    ],
    focus: t,
    broll: [],
    chapters: [],
    thumbnailQuery: "nepal mountains",
  };
}

/** Practice FULL VIDEO: an intro, 3 chapters of 6 scenes and an outro (so chapters and shorts can be tested). */
function mockLongResearch(t: string): Research {
  const places = ["nepal landscape", "kathmandu city street", "himalaya mountains", "nepali people market", "pokhara lake", "terai rice field"];
  const scene = (purpose: Research["visualPlan"][number]["purpose"], i: number) => ({
    purpose,
    idea: `Practice idea ${i} about ${t}`,
    visualQuery: places[i % places.length]!,
    backupQuery: places[(i + 2) % places.length]!.split(" ")[0]!,
    altQuery: places[(i + 1) % places.length]!,
    newsPhoto: "",
    mustShow: places[i % places.length]!,
  });
  const visualPlan = [scene("hook", 0), scene("point", 1)];
  const chapters: Research["chapters"] = [];
  for (let c = 0; c < 3; c++) {
    const first = visualPlan.length + 1;
    for (let k = 0; k < 6; k++) visualPlan.push(scene(k === 5 && c === 2 ? "payoff" : k % 2 ? "example" : "point", visualPlan.length));
    chapters.push({ title: ["What happened", "The main details", "What happens next"][c]!, firstScene: first, lastScene: visualPlan.length });
  }
  visualPlan.push(scene("call_to_action", visualPlan.length));
  return {
    summary: `PRACTICE DATA (no AI key): a full explainer about "${t}".`,
    facts: [1, 2, 3, 4, 5].map((n) => ({ claim: `Practice fact ${n} about ${t}.`, sourceUrl: "" })),
    visualPlan,
    chapters,
    focus: t,
    broll: places.map((q) => ({ query: q, mustShow: q })),
    thumbnailQuery: "nepal mountains",
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

export function mockScript(input: { language: Language; title: string; research: Research; politics?: boolean; format?: "SHORT" | "LONG" }): Script {
  const isNe = input.language === "ne";
  const long = input.format === "LONG";
  // A full practice video: one numbered practice sentence per scene.
  const lines = long
    ? input.research.visualPlan.map((_, i) =>
        isNe ? `यो अभ्यास वाक्य नम्बर ${i + 1} हो, जसले पूरा भिडियोको लम्बाइ जाँच गर्छ।` : `This is practice sentence number ${i + 1}, used to test the full video length.`,
      )
    : LINES[input.language](input.title);
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
      parts: [],
    })),
    hookLines: [isNe ? "अभ्यास भिडियो" : "Practice video"],
    hookHighlight: 0,
    topicChip: input.title.slice(0, 30),
    emphasis: [],
    cards: [],
    followText: isNe ? "भाग २ का लागि फलो गर्नुहोस्" : "Follow for Part 2",
    // Practice news graphics (only for news / politics videos), so the layout can be checked without a key.
    newsCards: input.politics
      ? [
          { order: 2, kind: "headline", title: "Nepal PM Balendra Shah meets PM Modi in New Delhi", by: "Practice News", person: "", date: "23 Nov 2026", from: "", to: "", countries: [], points: [] },
          { order: 3, kind: "trip", title: isNe ? "भारत भ्रमण" : "State visit", by: "", person: "", date: isNe ? "२२–२३ नोभेम्बर" : "22–23 Nov", from: isNe ? "काठमाडौँ" : "Kathmandu", to: isNe ? "नयाँ दिल्ली" : "New Delhi", countries: ["np", "in"], points: [] },
          { order: 4, kind: "timeline", title: isNe ? "मुख्य मितिहरू" : "Key dates", by: "", person: "", date: "", from: "", to: "", countries: [], points: [{ when: "2015", label: isNe ? "नयाँ संविधान" : "New constitution" }, { when: "2026", label: isNe ? "चुनाव" : "Election" }, { when: "Nov 2026", label: isNe ? "भारत भ्रमण" : "Visit to India" }] },
          { order: 5, kind: "flags", title: isNe ? "नेपाल र भारत" : "Nepal and India", by: "", person: "", date: "", from: "", to: "", countries: ["np", "in"], points: [] },
          { order: 6, kind: "quote", title: isNe ? "यो अभ्यास उद्धरण हो।" : "This is a practice quote.", by: isNe ? "अभ्यास वक्ता" : "Practice speaker", person: "", date: "", from: "", to: "", countries: [], points: [] },
        ]
      : [],
    people: input.politics ? [{ order: 3, person: "Narendra Modi", name: isNe ? "मोदी" : "Modi", role: isNe ? "भारतका प्रधानमन्त्री" : "Prime Minister of India" }] : [],
    chapterTitles: long ? (input.research.chapters ?? []).map((c, i) => (isNe ? `अभ्यास भाग ${i + 1}` : c.title)) : [],
  };
}
