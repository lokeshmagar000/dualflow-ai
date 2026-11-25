/**
 * STYLE V2 (sample only, not used by the real pipeline yet).
 *
 * Sound effects and a soft music bed, all made by this code (like the intro sound),
 * so we own them: no licence, no Content ID claims, safe for monetised videos.
 *
 *   whoosh  air rushing past: plays on every picture change ("swish" transition)
 *   pop     short bubbly click: plays when a big word or a number card appears
 *   hit     deep punch: plays when the hook text slams in (frame 1)
 *   riser   noise that climbs for ~1.2 s: builds tension before the biggest fact
 *   ding    bright bell: the "reveal" moment
 *   music   a calm, curious loop (soft chords + light pulse), played quietly under the voice
 */
const RATE = 44100;

/** Fixed "random" numbers, so a sound is the same every time. */
function noiseMaker(seed = 7) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x3fffffff - 1;
  };
}

/** Float samples (-1..1) -> 16-bit mono WAV file. */
export function toWav(samples: Float32Array): Buffer {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.98 ? 0.98 / peak : 1; // never clip
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const buf = (seconds: number) => new Float32Array(Math.round(RATE * seconds));

/** Whoosh: filtered noise that swells and fades, with the "colour" sweeping up then down. */
export function whoosh(seconds = 0.45): Float32Array {
  const out = buf(seconds);
  const noise = noiseMaker(11);
  let low = 0;
  let band = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
    const cutoff = 0.03 + 0.35 * Math.sin(Math.PI * p);
    low += cutoff * (noise() - low);
    band += 0.5 * (low - band); // remove some low rumble
    out[i] = (low - band * 0.6) * env * 1.4;
  }
  return out;
}

/** Pop: a quick downward "bloop" plus a tiny click. */
export function pop(seconds = 0.14): Float32Array {
  const out = buf(seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const freq = 380 + 900 * Math.exp(-t * 45);
    phase += (2 * Math.PI * freq) / RATE;
    out[i] = Math.sin(phase) * Math.exp(-t * 32) * 0.9 + (i < 60 ? (1 - i / 60) * 0.4 : 0);
  }
  return out;
}

/** Hit: a deep boom (falling pitch) with a short noisy "crack" on top. */
export function hit(seconds = 0.7): Float32Array {
  const out = buf(seconds);
  const noise = noiseMaker(3);
  let phase = 0;
  let low = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const freq = 42 + 110 * Math.exp(-t * 20);
    phase += (2 * Math.PI * freq) / RATE;
    low += 0.3 * (noise() - low);
    out[i] = Math.sin(phase) * Math.exp(-t * 5) * 1.0 + low * Math.exp(-t * 40) * 0.6;
  }
  return out;
}

/** Riser: noise + a rising tone that get louder and brighter, then stop sharply. */
export function riser(seconds = 1.2): Float32Array {
  const out = buf(seconds);
  const noise = noiseMaker(5);
  let low = 0;
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const cutoff = 0.01 + 0.4 * p * p;
    low += cutoff * (noise() - low);
    phase += (2 * Math.PI * (200 + 900 * p * p)) / RATE;
    const env = p * p * (p > 0.97 ? (1 - p) / 0.03 : 1);
    out[i] = (low * 0.9 + Math.sin(phase) * 0.25) * env;
  }
  return out;
}

/** Ding: a bright bell (two notes a fifth apart, with overtones). */
export function ding(seconds = 1.2): Float32Array {
  const out = buf(seconds);
  for (const [start, f] of [
    [0, 1318.5],
    [0.07, 1975.5],
  ] as const) {
    for (let i = Math.round(start * RATE); i < out.length; i++) {
      const t = i / RATE - start;
      const a = Math.min(1, t / 0.004);
      out[i]! +=
        a * Math.exp(-t * 4.5) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6)) * 0.45;
    }
  }
  return out;
}

/**
 * Music bed: a calm, curious loop. Four soft chords (Am - F - C - G), a warm bass,
 * a gentle plucked arpeggio and a very light kick on every beat (100 BPM).
 * It is mixed LOW and gets quieter while the voice talks ("ducking", done in the video).
 */
export function musicBed(seconds: number): Float32Array {
  const out = buf(seconds);
  const bpm = 100;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
  const chords = [
    [57, 60, 64], // A minor
    [53, 57, 60], // F
    [48, 55, 60], // C
    [55, 59, 62], // G
  ];
  const bass = [45, 41, 36, 43];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const barIndex = Math.floor(t / bar) % 4;
    const inBar = t % bar;
    const chord = chords[barIndex]!;
    // Pad: soft sines, gentle swell each bar.
    const swell = 0.6 + 0.4 * Math.sin((Math.PI * inBar) / bar);
    let s = 0;
    for (const n of chord) s += Math.sin(2 * Math.PI * midi(n) * t) * 0.07 * swell;
    // Bass: one note per bar.
    s += Math.sin(2 * Math.PI * midi(bass[barIndex]!) * t) * 0.16 * Math.exp(-(inBar % (beat * 2)) * 1.2);
    // Pluck arpeggio on 8th notes (chord notes one octave up).
    const eighth = beat / 2;
    const step = Math.floor(inBar / eighth);
    const since = inBar % eighth;
    const note = chord[step % 3]! + 12;
    s += Math.sin(2 * Math.PI * midi(note) * t) * Math.exp(-since * 9) * 0.09;
    // Light kick on every beat.
    const sinceBeat = t % beat;
    s += Math.sin(2 * Math.PI * (50 + 60 * Math.exp(-sinceBeat * 30)) * sinceBeat) * Math.exp(-sinceBeat * 14) * 0.22;
    out[i] = s;
  }
  // Fade in and out so it never starts or stops with a click.
  const fade = Math.round(RATE * 0.6);
  for (let i = 0; i < fade && i < out.length; i++) {
    out[i]! *= i / fade;
    out[out.length - 1 - i]! *= i / fade;
  }
  return out;
}
