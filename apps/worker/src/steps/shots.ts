/**
 * Shots: the pieces of the video that each show ONE picture.
 *
 * 1. If the script cut a line into parts ("Yaks live in the high Himalaya, | above the
 *    forests and jungles."), each part gets its own picture, and the picture changes
 *    at the exact word where the next part starts (we know when every word is spoken).
 * 2. Otherwise, a long line (more than LONG_SCENE_MS) is split at a sentence end.
 * 3. Otherwise, one line = one picture.
 * A shot is never shorter than MIN_SHOT_MS: a too-short part joins its neighbour,
 * because a picture that flashes by is worse than no change.
 */
import type { WordTiming } from "@dualflow/voice";

/** A line longer than this gets a second picture (if it has two sentences). */
export const LONG_SCENE_MS = Number(process.env.LONG_SCENE_SECONDS ?? 7) * 1000;
/** A shot shorter than this looks like a flicker, so we never make one. */
export const MIN_SHOT_MS = 1500;
const MIN_SENTENCE_SHOT_MS = 2500;
/** Ends a sentence: English . ! ? and the Nepali danda । */
const SENTENCE_END = /[.!?।]["'”’)]*$/;

export type ScenePart = { text: string; visualQuery: string };
export type SceneTime = { order: number; text: string; startMs: number; endMs: number; parts?: ScenePart[] | null };
export type Shot = Omit<SceneTime, "parts"> & {
  /** 0 = first shot of the scene, 1 = second, ... */
  part: number;
  /** The picture words for this shot (from the script's parts), if any. */
  visualQuery?: string;
};

const tokens = (text: string) => text.trim().split(/\s+/).filter(Boolean);

export function planShots(scenes: SceneTime[], words: WordTiming[]): Shot[] {
  const shots: Shot[] = [];
  for (const scene of scenes) {
    const { parts, ...base } = scene;
    const inside = words.filter((w) => w.startMs >= scene.startMs && w.startMs < scene.endMs);

    if (parts && parts.length > 1 && inside.length > 1) {
      shots.push(...shotsFromParts(base, parts, inside));
      continue;
    }
    const single = parts?.length === 1 ? parts[0]!.visualQuery : undefined;
    const length = scene.endMs - scene.startMs;
    const split = length > LONG_SCENE_MS ? splitPoint(scene, inside) : null;
    if (split === null) {
      shots.push({ ...base, part: 0, visualQuery: single });
      continue;
    }
    shots.push({ ...base, endMs: split, text: textBetween(inside, scene.startMs, split), part: 0, visualQuery: single });
    shots.push({ ...base, startMs: split, text: textBetween(inside, split, scene.endMs), part: 1 });
  }
  return shots;
}

/**
 * One shot per part. The voice's words may be counted a little differently from the
 * script (punctuation, joined words), so we find each part's first word by its share
 * of the line: part 2 starting at word 6 of 12 in the script starts at word 6 of 12 spoken.
 */
function shotsFromParts(scene: Omit<SceneTime, "parts">, parts: ScenePart[], inside: WordTiming[]): Shot[] {
  const counts = parts.map((p) => Math.max(1, tokens(p.text).length));
  const total = counts.reduce((a, b) => a + b, 0);
  let done = 0;
  const starts: number[] = []; // time each part starts
  counts.forEach((count, i) => {
    if (i === 0) starts.push(scene.startMs);
    else {
      const index = Math.min(inside.length - 1, Math.max(1, Math.round((done / total) * inside.length)));
      // Change the picture in the tiny gap just before the part's first word.
      starts.push(Math.round((inside[index - 1]!.endMs + inside[index]!.startMs) / 2));
    }
    done += count;
  });

  // Build the shots, joining any that would be too short onto the one before.
  const shots: Shot[] = [];
  parts.forEach((p, i) => {
    const startMs = starts[i]!;
    const endMs = i + 1 < parts.length ? starts[i + 1]! : scene.endMs;
    const last = shots.at(-1);
    if (last && (endMs - startMs < MIN_SHOT_MS || last.endMs - last.startMs < MIN_SHOT_MS)) {
      last.endMs = endMs;
      last.text = `${last.text} ${p.text}`;
      return;
    }
    shots.push({ ...scene, startMs, endMs, text: p.text, part: shots.length, visualQuery: p.visualQuery });
  });
  return shots;
}

/**
 * Where to change the picture inside a long scene: in the quiet moment after the
 * sentence end closest to the middle. Null when there is no good place.
 */
function splitPoint(scene: SceneTime, inside: WordTiming[]): number | null {
  const middle = (scene.startMs + scene.endMs) / 2;
  let best: number | null = null;
  for (let i = 0; i < inside.length - 1; i++) {
    if (!SENTENCE_END.test(inside[i]!.text)) continue;
    // Halfway between the end of this sentence and the start of the next one.
    const at = Math.round((inside[i]!.endMs + inside[i + 1]!.startMs) / 2);
    if (at - scene.startMs < MIN_SENTENCE_SHOT_MS || scene.endMs - at < MIN_SENTENCE_SHOT_MS) continue;
    if (best === null || Math.abs(at - middle) < Math.abs(best - middle)) best = at;
  }
  return best;
}

function textBetween(words: WordTiming[], fromMs: number, toMs: number): string {
  return words
    .filter((w) => w.startMs >= fromMs && w.startMs < toMs)
    .map((w) => w.text)
    .join(" ");
}
