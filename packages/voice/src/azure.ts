/**
 * REAL VOICE: Azure neural text-to-speech (VOICE_PROVIDER=azure).
 *
 * Budget: Azure's free "F0" tier gives 500,000 neural characters per month.
 * A 60-second short is about 800-1,000 characters per language, so roughly
 * 250 Nepali + English pairs a month cost $0.
 *
 * Azure tells us the exact time of every word ("word boundary" events).
 * We use those times for subtitles that match the voice perfectly.
 */
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { Language } from "@dualflow/shared";
import type { SpeechResult, VoiceProvider, WordTiming } from "./types";
import { pcmDurationMs, wavToPcm } from "./wav";

/** Default voices. Change them with AZURE_VOICE_NE / AZURE_VOICE_EN. */
const DEFAULT_VOICES: Record<Language, string> = {
  ne: "ne-NP-HemkalaNeural", // female Nepali voice (male: ne-NP-SagarNeural)
  en: "en-US-JennyNeural",
};
const LOCALES: Record<Language, string> = { ne: "ne-NP", en: "en-US" };

/** Azure gives times in "ticks": 1 tick = 100 nanoseconds, so 10,000 ticks = 1 ms. */
const TICKS_PER_MS = 10_000;

/** Paid price per 1 million characters (check the Azure pricing page if it changes). */
const PAID_USD_PER_MILLION_CHARS = 15;

/** Make text safe to put inside SSML (which is XML): & < > must be escaped. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A setup problem (missing key) that retrying will never fix. */
export class VoiceConfigError extends Error {}

export function azureVoice(): VoiceProvider {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new VoiceConfigError(
      "VOICE_PROVIDER=azure needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION. Or set VOICE_PROVIDER=mock to practise for free.",
    );
  }
  const voiceFor = (language: Language) =>
    (language === "ne" ? process.env.AZURE_VOICE_NE : process.env.AZURE_VOICE_EN) || DEFAULT_VOICES[language];
  const freeTier = (process.env.AZURE_SPEECH_TIER ?? "F0").toUpperCase() === "F0";

  return {
    name: "azure",
    voiceFor,
    costUsd: (chars) => (freeTier ? 0 : (chars / 1_000_000) * PAID_USD_PER_MILLION_CHARS),

    speak(text, language) {
      const config = sdk.SpeechConfig.fromSubscription(key, region);
      config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
      // null = keep the audio in memory (do not play it on a speaker).
      const synth = new sdk.SpeechSynthesizer(config, null);

      // Collect the time of every word while Azure speaks.
      const words: WordTiming[] = [];
      synth.wordBoundary = (_s, e) => {
        if (e.boundaryType !== sdk.SpeechSynthesisBoundaryType.Word) return; // skip punctuation
        const startMs = Math.round(e.audioOffset / TICKS_PER_MS);
        words.push({ text: e.text, startMs, endMs: startMs + Math.round(e.duration / TICKS_PER_MS) });
      };

      // SSML = a small XML document that says which voice reads which text.
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LOCALES[language]}">` +
        `<voice name="${voiceFor(language)}">${escapeXml(text)}</voice></speak>`;

      // The SDK uses callbacks; we wrap them in a Promise so we can "await" it.
      return new Promise<SpeechResult>((resolve, reject) => {
        synth.speakSsmlAsync(
          ssml,
          (result) => {
            synth.close();
            if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
              const details = sdk.CancellationDetails.fromResult(result);
              reject(new Error(`Azure voice failed: ${details.errorDetails || result.errorDetails || "unknown error"}`));
              return;
            }
            const pcm = wavToPcm(Buffer.from(result.audioData));
            resolve({ pcm, words, durationMs: pcmDurationMs(pcm) });
          },
          (error) => {
            synth.close();
            reject(new Error(`Azure voice failed: ${error}`));
          },
        );
      });
    },
  };
}
