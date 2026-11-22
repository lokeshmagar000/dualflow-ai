/**
 * Shots: the pieces of the video that each show ONE picture.
 *
 * Normally one scene (one spoken line) = one shot. When a line is long
 * (more than LONG_SCENE_MS), we split it into two shots at the end of a
 * sentence, using the time of every spoken word. The picture then changes
 * exactly when the voice starts the next sentence, never in the middle of a word.
 */
import type { WordTiming } from "@dualflow/voice";

/** A line longer than this gets a second picture (if it has two sentences). */
export const LONG_SCENE_MS = Number(process.env.LONG_SCENE_SECONDS ?? 7) * 1000;
/** A shot shorter than this looks like a flicker, so we never make one. */
const MIN_SHOT_MS = 2500;
/** Ends a sentence: English . ! ? and the Nepali danda । */
const SENTENCE_END = /[.!?।]["'”’)]*$/;

export type SceneTime = { order: number; text: string; startMs: number; endMs: number };
export type Shot = SceneTime & { /** 0 = first shot of the scene, 1 = second. */ part: number };

export function planShots(scenes: SceneTime[], words: WordTiming[]): Shot[] {
  const shots: Shot[] = [];
  for (const scene of scenes) {
    const length = scene.endMs - scene.startMs;
    const split = length > LONG_SCENE_MS ? splitPoint(scene, words) : null;
    if (split === null) {
      shots.push({ ...scene, part: 0 });
      continue;
    }
    const inside = words.filter((w) => w.startMs >= scene.startMs && w.startMs < scene.endMs);
    shots.push({ ...scene, endMs: split, text: textBetween(inside, scene.startMs, split), part: 0 });
    shots.push({ ...scene, startMs: split, text: textBetween(inside, split, scene.endMs), part: 1 });
  }
  return shots;
}

/**
 * Where to change the picture inside a long scene: in the quiet moment after the
 * sentence end closest to the middle. Null when there is no good place.
 */
function splitPoint(scene: SceneTime, words: WordTiming[]): number | null {
  const inside = words.filter((w) => w.startMs >= scene.startMs && w.startMs < scene.endMs);
  const middle = (scene.startMs + scene.endMs) / 2;
  let best: number | null = null;
  for (let i = 0; i < inside.length - 1; i++) {
    if (!SENTENCE_END.test(inside[i]!.text)) continue;
    // Halfway between the end of this sentence and the start of the next one.
    const at = Math.round((inside[i]!.endMs + inside[i + 1]!.startMs) / 2);
    if (at - scene.startMs < MIN_SHOT_MS || scene.endMs - at < MIN_SHOT_MS) continue;
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
