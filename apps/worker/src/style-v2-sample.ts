/**
 * STYLE V2 SAMPLE: makes the SAME story twice, so the owner can compare:
 *   before-<lang>.mp4  the current style (logo intro, title box, Word Pop, like & follow card)
 *   after-<lang>.mp4   the proposed new style (VideoV2.tsx)
 * Both use the same voice recording and the same stock clips, so only the editing differs.
 *
 * Run: VOICE_PROVIDER=gemini PIXABAY_API_KEY=... pnpm --filter @dualflow/worker exec tsx src/style-v2-sample.ts <out folder> [en|ne]
 * (No keys: practice beeps + colour backgrounds, still useful to check the layout.)
 * Uses ONE Gemini voice request per language.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BRAND_COLORS, brandFor } from "@dualflow/shared";
import { buildCues, edgeVoice, getVoiceProvider, pcmDurationMs, pcmToWav, silence, type SpeechResult, type WordTiming } from "@dualflow/voice";
import {
  closeRenderer,
  findMedia,
  makeJobFolder,
  plain,
  prepareIntro,
  renderVideo,
  renderVideoV2,
  sfx as sounds,
  type Media,
  type V2Props,
  type V2Shot,
  type VideoProps,
} from "@dualflow/video";

const { ding, hit, musicBed, pop, riser, toWav, whoosh } = sounds;

const out = path.resolve(process.argv[2] ?? "style-v2-out");
const only = process.argv[3] as "ne" | "en" | undefined;

type Part = { text: string; q: string };
type Line = { parts: Part[] };
type Story = {
  lines: Line[];
  /** The old-style call to action (only in the "before" video). */
  oldCta: string;
  oldTitle: string;
  hook: { lines: string[]; highlight: number };
  topic: string;
  emphasis: string[];
  /** Number card: shown during this line. */
  card: { line: number; big: string; small: string };
  /** The line with the biggest surprise: a riser builds up before it. */
  payoffLine: number;
  /** The follow pill appears at the start of this line. */
  followLine: number;
  followText: string;
};

// Facts checked: Nepal's flag is the only non-rectangular national flag; its construction is
// set out step by step in Schedule 1 of the Constitution; crimson = rhododendron (national
// flower) and colour of victory; the moon and sun express the wish that the nation lasts as
// long as they do; the two pennants are commonly said to stand for the Himalayas and for
// Hinduism and Buddhism. 193 = UN member states.
const STORIES: Record<"en" | "ne", Story> = {
  en: {
    lines: [
      { parts: [{ text: "Every country's flag is a rectangle.", q: "flags of the world" }, { text: "Except one.", q: "nepal flag" }] },
      { parts: [{ text: "Out of one hundred ninety-three countries, only Nepal's flag looks like this.", q: "nepal flag waving" }] },
      { parts: [{ text: "But the shape isn't even the strangest part.", q: "flag pole sky" }] },
      {
        parts: [
          { text: "Its two triangles stand for the Himalayas,", q: "himalaya mountains snow" },
          { text: "and for Hinduism and Buddhism.", q: "boudhanath stupa" },
        ],
      },
      { parts: [{ text: "The crimson red is the colour of the rhododendron, Nepal's national flower.", q: "red rhododendron flower" }] },
      {
        parts: [
          { text: "The moon and the sun?", q: "moon night sky" },
          { text: "A wish that Nepal lasts as long as they do.", q: "sunrise mountains" },
        ],
      },
      { parts: [{ text: "And the constitution explains exactly how to draw it, step by step, like a geometry test.", q: "geometry drawing compass" }] },
      { parts: [{ text: "That's why it's the only flag on Earth that breaks the rule.", q: "nepal flag wind" }] },
    ],
    oldCta: "Like and follow for more amazing facts!",
    oldTitle: "Why Nepal's flag is so unique",
    hook: { lines: ["Only 1 flag", "breaks the rule"], highlight: 0 },
    topic: "Nepal's flag",
    emphasis: ["rectangle", "except", "nepal's", "strangest", "himalayas", "rhododendron", "moon", "sun", "constitution", "geometry", "only"],
    card: { line: 1, big: "1 / 193", small: "countries" },
    payoffLine: 6,
    followLine: 3,
    followText: "Follow for Part 2",
  },
  ne: {
    lines: [
      { parts: [{ text: "संसारका सबै देशको झण्डा चार कुने हुन्छ।", q: "flags of the world" }, { text: "एउटा बाहेक।", q: "nepal flag" }] },
      { parts: [{ text: "एक सय त्रियानब्बे देशमध्ये, यस्तो आकारको झण्डा नेपालको मात्र छ।", q: "nepal flag waving" }] },
      { parts: [{ text: "तर आकार मात्र अचम्मको कुरा होइन।", q: "flag pole sky" }] },
      {
        parts: [
          { text: "यसका दुई त्रिकोणले हिमाललाई जनाउँछन्,", q: "himalaya mountains snow" },
          { text: "अनि हिन्दू र बौद्ध धर्मलाई पनि।", q: "boudhanath stupa" },
        ],
      },
      { parts: [{ text: "यसको सिम्रिक रातो रङ राष्ट्रिय फूल लालीगुराँसको रङ हो।", q: "red rhododendron flower" }] },
      {
        parts: [
          { text: "अनि चन्द्र र सूर्य?", q: "moon night sky" },
          { text: "नेपाल तिनीहरू रहुन्जेल रहोस् भन्ने कामना।", q: "sunrise mountains" },
        ],
      },
      { parts: [{ text: "अझ अचम्म, संविधानमै यो झण्डा कसरी कोर्ने भनेर, ज्यामितिको प्रश्नजस्तै, एक एक चरण लेखिएको छ।", q: "geometry drawing compass" }] },
      { parts: [{ text: "त्यसैले यो संसारको एक मात्र झण्डा हो, जसले नियम तोड्छ।", q: "nepal flag wind" }] },
    ],
    oldCta: "भिडियो मन पर्यो भने लाइक र फलो गर्नुहोस्।",
    oldTitle: "नेपालको झण्डा किन फरक छ?",
    hook: { lines: ["एउटा मात्र झण्डा", "जसले नियम तोड्छ"], highlight: 0 },
    topic: "नेपालको झण्डा",
    emphasis: ["बाहेक", "नेपालको", "अचम्मको", "हिमाललाई", "लालीगुराँसको", "चन्द्र", "सूर्य", "संविधानमै", "ज्यामितिको", "मात्र"],
    card: { line: 1, big: "1 / 193", small: "देशमध्ये" },
    payoffLine: 6,
    followLine: 3,
    followText: "भाग २ का लागि फलो गर्नुहोस्",
  },
};

/** Join voice pieces with a gap; returns the audio and where each line and word is. */
function glue(pieces: SpeechResult[], gapMs: number) {
  const pcm: Buffer[] = [];
  const words: WordTiming[] = [];
  const lines: { startMs: number; endMs: number; words: WordTiming[] }[] = [];
  let t = 0;
  pieces.forEach((p, i) => {
    if (i > 0) {
      pcm.push(silence(gapMs));
      t += gapMs;
    }
    const ws = p.words.map((w) => ({ text: w.text, startMs: w.startMs + t, endMs: w.endMs + t }));
    words.push(...ws);
    const len = pcmDurationMs(p.pcm);
    lines.push({ startMs: t, endMs: t + len, words: ws });
    pcm.push(p.pcm);
    t += len;
  });
  const all = Buffer.concat(pcm);
  return { wav: pcmToWav(all), durationMs: pcmDurationMs(all), words, lines };
}

/** Where each part (picture) of a line starts, by its share of the words. */
function partStarts(line: Line, timing: { startMs: number; endMs: number; words: WordTiming[] }): number[] {
  const counts = line.parts.map((p) => p.text.split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const ws = timing.words;
  let done = 0;
  return counts.map((c, i) => {
    const at = i === 0 ? timing.startMs : (() => {
      const k = Math.min(ws.length - 1, Math.max(1, Math.round((done / total) * ws.length)));
      return Math.round((ws[k - 1]!.endMs + ws[k]!.startMs) / 2);
    })();
    done += c;
    return at;
  });
}

async function speak(texts: string[], language: "ne" | "en"): Promise<SpeechResult[]> {
  const provider = getVoiceProvider("style-v2");
  try {
    if (provider.speakMany) return (await provider.speakMany(texts, language)).pieces;
    const res: SpeechResult[] = [];
    for (const t of texts) res.push(await provider.speak(t, language));
    return res;
  } catch (err) {
    console.warn(`Voice ${provider.name} failed (${(err as Error).message}); using Edge TTS instead.`);
    const edge = edgeVoice();
    const res: SpeechResult[] = [];
    for (const t of texts) res.push(await edge.speak(t, language));
    return res;
  }
}

async function make(language: "ne" | "en") {
  const story = STORIES[language];
  const brand = brandFor(language);
  const job = await makeJobFolder();
  const lineTexts = story.lines.map((l) => l.parts.map((p) => p.text).join(" "));
  console.log(`[${language}] voice...`);
  const pieces = await speak([...lineTexts, story.oldCta], language);

  // ---------- Pictures (shared by both versions) ----------
  const newVoice = glue(pieces.slice(0, -1), 120); // tight pacing: 120 ms between lines
  const used = new Set<number>();
  const shotsNew: V2Shot[] = [];
  const mediaByPart: (Media | null)[] = [];
  let n = 0;
  for (const [li, line] of story.lines.entries()) {
    const starts = partStarts(line, newVoice.lines[li]!);
    for (const [pi, part] of line.parts.entries()) {
      const endMs = pi + 1 < line.parts.length ? starts[pi + 1]! : li + 1 < story.lines.length ? newVoice.lines[li + 1]!.startMs : newVoice.durationMs;
      const found = await findMedia([part.q, part.q.split(" ").slice(-1)[0]!], "SHORT", job.dir, `clip-${n}`, used, (endMs - starts[pi]!) / 1000);
      const media: Media | null = found ? { src: job.url(found.file), kind: found.kind } : null;
      mediaByPart.push(media);
      shotsNew.push({ startMs: starts[pi]!, endMs, media });
      n++;
    }
  }

  // ---------- AFTER: the new style ----------
  await writeFile(path.join(job.dir, "voice-new.wav"), newVoice.wav);
  const fx = { whoosh: whoosh(), pop: pop(), hit: hit(), riser: riser(), ding: ding() };
  for (const [name, s] of Object.entries(fx)) await writeFile(path.join(job.dir, `${name}.wav`), toWav(s));
  await writeFile(path.join(job.dir, "music.wav"), toWav(musicBed(newVoice.durationMs / 1000 + 1)));
  const emphasis = new Set(story.emphasis.map(plain));
  const cardLine = newVoice.lines[story.card.line]!;
  const payoff = newVoice.lines[story.payoffLine]!;
  const sfx: V2Props["sfx"] = [
    { atMs: 0, src: job.url("hit.wav"), volume: 0.55 },
    ...shotsNew.slice(1).map((s) => ({ atMs: s.startMs - 120, src: job.url("whoosh.wav"), volume: 0.35 })),
    ...newVoice.words.filter((w) => emphasis.has(plain(w.text)) && w.startMs > 900).map((w) => ({ atMs: w.startMs, src: job.url("pop.wav"), volume: 0.3 })),
    { atMs: cardLine.startMs + 200, src: job.url("ding.wav"), volume: 0.3 },
    { atMs: payoff.startMs - 1200, src: job.url("riser.wav"), volume: 0.3 },
    { atMs: payoff.startMs, src: job.url("hit.wav"), volume: 0.35 },
  ];
  const after: V2Props = {
    language,
    audioFile: job.url("voice-new.wav"),
    durationMs: newVoice.durationMs,
    shots: shotsNew,
    words: newVoice.words,
    emphasis: story.emphasis,
    hook: story.hook,
    topic: story.topic,
    cards: [{ startMs: cardLine.startMs + 200, endMs: cardLine.endMs + 300, big: story.card.big, small: story.card.small }],
    sfx,
    musicFile: job.url("music.wav"),
    musicVolume: 0.28,
    brand: brand.name,
    brandTag: brand.tag,
    follow: { atMs: newVoice.lines[story.followLine]!.startMs, text: story.followText },
  };
  console.log(`[${language}] rendering AFTER...`);
  const rawAfter = path.join(job.dir, "after-raw.mp4");
  await renderVideoV2(after, rawAfter);
  // Loudness: the same level platforms play at (about -14 LUFS), so we are never quieter than the next video.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", rawAfter, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", path.join(out, `after-${language}.mp4`)]);

  // ---------- BEFORE: today's style ----------
  const oldVoice = glue(pieces, 400); // today: 400 ms between lines, CTA line at the end
  await writeFile(path.join(job.dir, "voice-old.wav"), oldVoice.wav);
  const oldScenes: VideoProps["scenes"] = [];
  let m = 0;
  for (const [li, line] of story.lines.entries()) {
    const starts = partStarts(line, oldVoice.lines[li]!);
    line.parts.forEach((_, pi) => {
      const endMs = pi + 1 < line.parts.length ? starts[pi + 1]! : oldVoice.lines[li + 1]!.startMs;
      oldScenes.push({ startMs: starts[pi]!, endMs, text: "", media: mediaByPart[m++] ?? null });
    });
  }
  const ctaLine = oldVoice.lines.at(-1)!;
  oldScenes.push({ startMs: ctaLine.startMs, endMs: ctaLine.endMs, text: story.oldCta, media: mediaByPart.at(-1) ?? null });
  const before: VideoProps = {
    format: "SHORT",
    language,
    title: story.oldTitle,
    audioFile: job.url("voice-old.wav"),
    durationMs: oldVoice.durationMs,
    scenes: oldScenes,
    cues: buildCues(oldVoice.words),
    words: oldVoice.words,
    subtitleStyle: "word-pop",
    intro: await prepareIntro(language, job),
    brand: brand.name,
    brandTag: brand.tag,
    accent: BRAND_COLORS.marigold,
    ctaStartMs: ctaLine.startMs,
  };
  console.log(`[${language}] rendering BEFORE...`);
  await renderVideo(before, path.join(out, `before-${language}.mp4`));
  await job.remove();
}

await mkdir(out, { recursive: true });
for (const language of only ? [only] : (["en", "ne"] as const)) await make(language);
await closeRenderer();
console.log(`Done: ${out}`);
