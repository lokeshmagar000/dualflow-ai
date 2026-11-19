/**
 * Voice package: text -> speech -> subtitles.
 *
 * Pick the provider with VOICE_PROVIDER:
 *   "mock"  (default) practice voice, free, no key needed
 *   "azure" real Azure neural voices (free F0 tier: 500,000 characters a month)
 *   "edge"  free Edge TTS voices (same voices as Azure, no key; unofficial backup)
 */
import { azureVoice, VoiceConfigError } from "./azure";
import { mockVoice } from "./mock";
import { edgeVoice } from "./edge";
import type { VoiceProvider } from "./types";

export function getVoiceProvider(): VoiceProvider {
  const choice = (process.env.VOICE_PROVIDER ?? "mock").toLowerCase();
  if (choice === "azure") return azureVoice();
  if (choice === "edge") return edgeVoice();
  if (choice === "mock") return mockVoice;
  throw new VoiceConfigError(`Unknown VOICE_PROVIDER "${choice}". Use "mock", "azure" or "edge".`);
}

export { VoiceConfigError, escapeXml } from "./azure";
export { mockVoice, estimateWords } from "./mock";
export { edgeVoice, decodeToPcm } from "./edge";
export { makeVoiceover, SCENE_GAP_MS, type Voiceover, type SceneTiming } from "./voiceover";
export { buildCues, toSrt, toVtt, formatTime, type Cue } from "./subtitles";
export { pcmToWav, wavToPcm, silence, pcmDurationMs } from "./wav";
export type { VoiceProvider, WordTiming, SpeechResult } from "./types";
