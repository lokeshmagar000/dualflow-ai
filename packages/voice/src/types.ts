import type { Language } from "@dualflow/shared";

/** When one spoken word starts and ends, in milliseconds from the start of the audio. */
export interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

/** What a voice provider gives back for one piece of text. */
export interface SpeechResult {
  /** Raw 16-bit mono 24 kHz PCM samples (see wav.ts). */
  pcm: Buffer;
  words: WordTiming[];
  durationMs: number;
}

/**
 * A "provider" is one way of turning text into speech.
 * Every provider has the same shape, so the worker does not care which one it uses.
 */
export interface VoiceProvider {
  /** Short name saved in the database, e.g. "azure" or "mock". */
  name: string;
  /** The voice used for a language, e.g. "ne-NP-HemkalaNeural". */
  voiceFor(language: Language): string;
  speak(text: string, language: Language): Promise<SpeechResult>;
  /** Price in US dollars for this many characters (0 on a free tier). */
  costUsd(characters: number): number;
  /**
   * Optional: read many scenes in as few requests as possible (Gemini uses this
   * to save its small free daily limit). Gives one result per scene, in order.
   */
  speakMany?(texts: string[], language: Language): Promise<{ pieces: SpeechResult[]; requests: number }>;
}
