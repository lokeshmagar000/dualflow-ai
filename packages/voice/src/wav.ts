/**
 * Tiny helpers for WAV audio files.
 *
 * A WAV file = a 44-byte header (it says "16-bit, mono, 24000 samples per second")
 * followed by raw PCM samples. PCM is the simplest audio: just a list of numbers,
 * one number per tiny moment of sound. Because it is so simple, we can glue
 * scenes together and add silence without any extra library.
 */

/** All our audio uses this format (Azure's "Riff24Khz16BitMonoPcm" is the same). */
export const SAMPLE_RATE = 24_000; // samples per second
export const BYTES_PER_SAMPLE = 2; // 16-bit = 2 bytes, mono = 1 channel

/** How many milliseconds a block of PCM bytes lasts. */
export function pcmDurationMs(pcm: Buffer): number {
  return Math.round((pcm.length / BYTES_PER_SAMPLE / SAMPLE_RATE) * 1000);
}

/** A block of silence (all samples are zero). */
export function silence(ms: number): Buffer {
  const samples = Math.round((ms / 1000) * SAMPLE_RATE);
  return Buffer.alloc(samples * BYTES_PER_SAMPLE);
}

/** Put the 44-byte WAV header in front of raw PCM samples. */
export function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4); // size of the rest of the file
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // size of the "fmt " part
  header.writeUInt16LE(1, 20); // 1 = plain PCM
  header.writeUInt16LE(1, 22); // 1 channel (mono)
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28); // bytes per second
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32); // bytes per sample
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Take the raw PCM samples out of a WAV file.
 * A WAV file is made of "chunks"; we walk through them until we find "data".
 */
export function wavToPcm(wav: Buffer): Buffer {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let pos = 12;
  while (pos + 8 <= wav.length) {
    const id = wav.toString("ascii", pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    if (id === "data") return wav.subarray(pos + 8, Math.min(wav.length, pos + 8 + size));
    pos += 8 + size + (size % 2); // chunks are padded to an even size
  }
  throw new Error("WAV file has no audio data");
}
