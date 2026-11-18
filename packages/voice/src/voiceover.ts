/**
 * Make the full voiceover for one video (one language).
 *
 * We speak each scene separately, then glue the pieces together with a short
 * pause between scenes. Speaking scene by scene tells us exactly when each
 * scene starts and ends, which the video renderer (Phase 1C) needs to show
 * the right picture at the right time.
 */
import type { Language } from "@dualflow/shared";
import type { VoiceProvider, WordTiming } from "./types";
import { pcmDurationMs, pcmToWav, silence } from "./wav";
import { buildCues, toSrt, toVtt, type Cue } from "./subtitles";

/** Pause between two scenes. */
export const SCENE_GAP_MS = 400;

export interface SceneTiming {
  order: number;
  startMs: number;
  endMs: number;
}

export interface Voiceover {
  wav: Buffer;
  durationMs: number;
  words: WordTiming[];
  scenes: SceneTiming[];
  cues: Cue[];
  srt: string;
  vtt: string;
  /** Characters sent to the voice provider (that is what Azure charges for). */
  characters: number;
}

export async function makeVoiceover(
  provider: VoiceProvider,
  language: Language,
  scenes: { order: number; text: string }[],
): Promise<Voiceover> {
  const pieces: Buffer[] = [];
  const words: WordTiming[] = [];
  const sceneTimings: SceneTiming[] = [];
  let offsetMs = 0; // where the next scene starts in the final audio
  let characters = 0;

  for (const scene of scenes) {
    if (pieces.length > 0) {
      pieces.push(silence(SCENE_GAP_MS));
      offsetMs += SCENE_GAP_MS;
    }
    const result = await provider.speak(scene.text, language);
    characters += scene.text.length;
    // Move this scene's word times forward to their place in the full audio.
    for (const w of result.words) {
      words.push({ text: w.text, startMs: w.startMs + offsetMs, endMs: w.endMs + offsetMs });
    }
    // Use the real length of the audio (not the provider's guess) so times never drift.
    const length = pcmDurationMs(result.pcm);
    sceneTimings.push({ order: scene.order, startMs: offsetMs, endMs: offsetMs + length });
    pieces.push(result.pcm);
    offsetMs += length;
  }

  const pcm = Buffer.concat(pieces);
  const cues = buildCues(words);
  return {
    wav: pcmToWav(pcm),
    durationMs: pcmDurationMs(pcm),
    words,
    scenes: sceneTimings,
    cues,
    srt: toSrt(cues),
    vtt: toVtt(cues),
    characters,
  };
}
