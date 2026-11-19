/**
 * The 5 subtitle styles. Each one is a small React component that Remotion
 * draws frame by frame in Chrome (the same way the real video maker draws).
 *
 * Every style gets the same input: the words, and when each word is spoken.
 * Fonts are free Google Fonts that have Nepali (Devanagari) letters.
 */
import type { CSSProperties } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type Lang = "en" | "ne";
export type Word = { text: string; startMs: number; endMs: number };
export type StyleProps = { words: Word[]; lang: Lang; scale: number };

export const STYLES = [
  { id: "1-word-pop", name: "Word Pop" },
  { id: "2-karaoke", name: "Karaoke Highlight" },
  { id: "3-neon-glow", name: "Neon Glow" },
  { id: "4-boxed-caption", name: "Boxed Caption" },
  { id: "5-typewriter", name: "Typewriter Story" },
] as const;
export type StyleId = (typeof STYLES)[number]["id"];

/** Where the subtitles sit on a tall (Shorts) video: a bit below the middle. */
const AREA: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "60%",
  display: "flex",
  justifyContent: "center",
};

function useNowMs() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, nowMs: (frame / fps) * 1000 };
}

/** Split words into small groups ("pages") so only a few words show at a time. */
function pages(words: Word[], size: number): Word[][] {
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
}
function currentPage(words: Word[], size: number, nowMs: number) {
  const all = pages(words, size);
  return all.find((p) => nowMs < p[p.length - 1]!.endMs) ?? all[all.length - 1]!;
}

/* ---------------- 1. Word Pop ---------------- */
// Big bold words, 3 at a time. The word being spoken turns yellow and pops bigger.
export function WordPop({ words, lang, scale }: StyleProps) {
  const { frame, fps, nowMs } = useNowMs();
  const page = currentPage(words, 3, nowMs);
  return (
    <div style={{ ...AREA, top: "58%" }}>
      <div
        style={{
          maxWidth: "88%",
          textAlign: "center",
          fontFamily: lang === "ne" ? "Mukta" : "Poppins",
          fontWeight: 800,
          fontSize: (lang === "ne" ? 104 : 96) * scale,
          lineHeight: 1.3,
          textTransform: lang === "en" ? "uppercase" : undefined,
        }}
      >
        {page.map((w, i) => {
          const active = nowMs >= w.startMs && nowMs < w.endMs;
          const since = frame - Math.round((w.startMs / 1000) * fps);
          const pop = active ? spring({ frame: since, fps, config: { damping: 10, mass: 0.5 } }) : 0;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: `0 ${14 * scale}px`,
                color: active ? "#FFE14D" : "white",
                transform: `scale(${1 + 0.18 * pop}) rotate(${active ? -2 * pop : 0}deg)`,
                WebkitTextStroke: `${12 * scale}px black`,
                paintOrder: "stroke fill",
                textShadow: `0 ${8 * scale}px 0 rgba(0,0,0,0.9)`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 2. Karaoke Highlight ---------------- */
// The whole line shows. Words light up (fill with colour) as they are spoken.
export function Karaoke({ words, scale }: StyleProps) {
  const { nowMs } = useNowMs();
  const line = currentPage(words, 5, nowMs);
  return (
    <div style={AREA}>
      <div
        style={{
          maxWidth: "88%",
          textAlign: "center",
          fontFamily: '"Baloo 2"',
          fontWeight: 700,
          fontSize: 88 * scale,
          lineHeight: 1.35,
          // A soft dark outline drawn around the letters (works with the colour fill below).
          filter: `drop-shadow(0 0 ${3 * scale}px black) drop-shadow(0 0 ${3 * scale}px black) drop-shadow(0 ${6 * scale}px ${10 * scale}px rgba(0,0,0,0.7))`,
        }}
      >
        {line.map((w, i) => {
          // 0 = not spoken yet, 1 = spoken. In between = being spoken now.
          const p = interpolate(nowMs, [w.startMs, w.endMs], [0, 100], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <span
              key={i}
              style={{
                display: "inline-block", // lets long lines wrap between words
                margin: `0 ${12 * scale}px`,
                // Left part green-yellow (spoken), right part white (coming).
                backgroundImage: `linear-gradient(90deg, #B6FF3B ${p}%, rgba(255,255,255,0.92) ${p}%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 3. Neon Glow ---------------- */
// Thin bright letters with a pink-blue glow. Each word fades in softly.
export function Neon({ words, lang, scale }: StyleProps) {
  const { nowMs } = useNowMs();
  const line = currentPage(words, 4, nowMs);
  return (
    <div style={AREA}>
      <div
        style={{
          maxWidth: "86%",
          textAlign: "center",
          fontFamily: lang === "ne" ? "Hind" : "Poppins",
          fontWeight: 600,
          fontSize: (lang === "ne" ? 92 : 84) * scale,
          lineHeight: 1.4,
          color: "#FFF4FD",
        }}
      >
        {line.map((w, i) => {
          const t = interpolate(nowMs, [w.startMs - 60, w.startMs + 260], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const g = 1 + 0.35 * Math.sin(nowMs / 140 + i); // gentle flicker
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: `0 ${12 * scale}px`,
                opacity: t,
                filter: `blur(${(1 - t) * 10 * scale}px)`,
                textShadow: [
                  `0 0 ${4 * scale}px #fff`,
                  `0 0 ${8 * scale}px #fff`,
                  `0 0 ${12 * scale * g}px #FF3CC7`,
                  `0 0 ${26 * scale * g}px #FF3CC7`,
                  `0 0 ${48 * scale * g}px #7B5CFF`,
                  `0 0 ${80 * scale}px #00D4FF`,
                ].join(", "),
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 4. Boxed Caption ---------------- */
// White text on a rounded coloured box that slides up for each new line.
export function Boxed({ words, scale }: StyleProps) {
  const { frame, fps, nowMs } = useNowMs();
  const line = currentPage(words, 4, nowMs);
  const since = frame - Math.round((line[0]!.startMs / 1000) * fps);
  const up = spring({ frame: since, fps, config: { damping: 14, mass: 0.7 } });
  return (
    <div style={{ ...AREA, opacity: Math.min(1, up * 1.5), transform: `translateY(${(1 - up) * 120 * scale}px)` }}>
      <div
        style={{
          maxWidth: "84%",
          padding: `${14 * scale}px ${40 * scale}px ${20 * scale}px`,
          borderRadius: 28 * scale,
          background: "#E63950",
          boxShadow: `0 ${14 * scale}px ${40 * scale}px rgba(0,0,0,0.5)`,
          textAlign: "center",
          fontFamily: '"Noto Sans Devanagari"',
          fontWeight: 700,
          fontSize: 76 * scale,
          lineHeight: 1.45,
          color: "white",
        }}
      >
        {line.map((w, i) => (
          <span key={i} style={{ display: "inline-block", margin: `0 ${10 * scale}px`, opacity: nowMs >= w.startMs - 40 ? 1 : 0.55 }}>
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 5. Typewriter Story ---------------- */
// Hand-written look. Letters appear one by one, with a blinking cursor.
// Nepali letters are typed one "letter cluster" at a time (क्षे appears whole),
// so a half-joined letter is never shown.
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function Typewriter({ words, scale }: StyleProps) {
  const { frame, nowMs } = useNowMs();
  const text = words.map((w) => w.text).join(" ");
  const parts = [...segmenter.segment(text)].map((s) => s.segment);
  const start = words[0]!.startMs;
  const end = words[words.length - 1]!.endMs;
  const shown = Math.round(interpolate(nowMs, [start, end], [0, parts.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const typed = parts.slice(0, shown).join("");
  const rest = parts.slice(shown).join("");
  const blink = Math.floor(frame / 12) % 2 === 0 || shown < parts.length;
  return (
    <div style={AREA}>
      <div
        style={{
          maxWidth: "84%",
          padding: `${22 * scale}px ${40 * scale}px`,
          borderRadius: 18 * scale,
          background: "rgba(16,14,24,0.62)",
          fontFamily: "Kalam",
          fontWeight: 700,
          fontSize: 78 * scale,
          lineHeight: 1.45,
          color: "#FFF6E0",
          textAlign: "left",
          textShadow: `0 ${3 * scale}px ${6 * scale}px rgba(0,0,0,0.6)`,
        }}
      >
        <span>{typed}</span>
        <span
          style={{
            display: "inline-block",
            width: 6 * scale,
            height: 70 * scale,
            margin: `0 ${4 * scale}px`,
            verticalAlign: "middle",
            background: "#FFC94D",
            opacity: blink ? 1 : 0,
          }}
        />
        {/* The rest is invisible: it only keeps the box the same size while typing. */}
        <span style={{ color: "transparent", textShadow: "none" }}>{rest}</span>
      </div>
    </div>
  );
}

export const COMPONENTS: Record<StyleId, (p: StyleProps) => React.ReactNode> = {
  "1-word-pop": WordPop,
  "2-karaoke": Karaoke,
  "3-neon-glow": Neon,
  "4-boxed-caption": Boxed,
  "5-typewriter": Typewriter,
};
