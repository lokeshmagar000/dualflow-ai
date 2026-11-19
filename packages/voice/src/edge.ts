/**
 * FREE VOICE: Edge TTS (VOICE_PROVIDER=edge).
 *
 * The same neural voices as Azure (ne-NP-HemkalaNeural, ne-NP-SagarNeural,
 * en-US-JennyNeural), from Microsoft Edge's "Read aloud" service.
 * No key and no account. It is unofficial and could stop working one day,
 * so Azure's free tier stays the main choice and this is the backup.
 *
 * How it works:
 *   1. We run the small Python helper (python/edge_speak.py). It saves an MP3
 *      and prints the time of every word.
 *   2. FFmpeg turns the MP3 into raw PCM audio (16-bit, mono, 24 kHz),
 *      the same format the rest of our voice code uses (see wav.ts).
 *
 * Needs on the machine: Python 3 with edge-tts (pip install -r python/requirements.txt)
 * and FFmpeg. GitHub Actions has both after the setup steps in pipeline.yml.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Language } from "@dualflow/shared";
import type { SpeechResult, VoiceProvider, WordTiming } from "./types";
import { VoiceConfigError } from "./azure";
import { pcmDurationMs, SAMPLE_RATE } from "./wav";

const DEFAULT_VOICES: Record<Language, string> = {
  ne: "ne-NP-HemkalaNeural", // female Nepali voice (male: ne-NP-SagarNeural)
  en: "en-US-JennyNeural",
};

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../python/edge_speak.py");

/** Run a program, send it `input`, and collect what it prints. */
function run(cmd: string, args: string[], input?: string): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e: NodeJS.ErrnoException) =>
      reject(e.code === "ENOENT" ? new VoiceConfigError(`"${cmd}" is not installed on this machine.`) : e),
    );
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: err }));
    child.stdin.end(input ?? "");
  });
}

/** Decode any audio file to raw PCM in our standard format, using FFmpeg. */
export async function decodeToPcm(file: string): Promise<Buffer> {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const r = await run(ffmpeg, ["-v", "error", "-i", file, "-f", "s16le", "-ac", "1", "-ar", String(SAMPLE_RATE), "-"]);
  if (r.code !== 0) throw new Error(`FFmpeg could not read the voice audio: ${r.stderr.slice(0, 300)}`);
  return r.stdout;
}

export function edgeVoice(): VoiceProvider {
  const python = process.env.EDGE_TTS_PYTHON || "python3";
  const voiceFor = (language: Language) =>
    (language === "ne" ? process.env.EDGE_VOICE_NE : process.env.EDGE_VOICE_EN) || DEFAULT_VOICES[language];

  return {
    name: "edge",
    voiceFor,
    costUsd: () => 0, // free

    async speak(text: string, language: Language): Promise<SpeechResult> {
      const dir = await mkdtemp(path.join(tmpdir(), "dualflow-edge-"));
      try {
        const mp3 = path.join(dir, "voice.mp3");
        const r = await run(python, [SCRIPT, mp3], JSON.stringify({ text, voice: voiceFor(language) }));
        if (r.code !== 0) {
          if (/No module named ['"]?edge_tts/.test(r.stderr)) {
            throw new VoiceConfigError("Edge TTS is not installed. Run: pip install -r packages/voice/python/requirements.txt");
          }
          throw new Error(`Edge TTS failed (will retry): ${r.stderr.slice(-300)}`); // often a network hiccup
        }
        const { words } = JSON.parse(r.stdout.toString("utf8")) as { words: WordTiming[] };
        const pcm = await decodeToPcm(mp3);
        if (pcm.length === 0) throw new Error("Edge TTS returned no audio (will retry).");
        // Edge gives one word per event; drop empty ones (punctuation).
        return { pcm, words: words.filter((w) => w.text.trim()), durationMs: pcmDurationMs(pcm) };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Exported for tests. */
export const EDGE_SCRIPT_PATH = SCRIPT;
