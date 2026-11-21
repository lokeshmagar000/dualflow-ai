/**
 * The thumbnail: a picture from the video, a huge headline and the Namaste Facts badge.
 *
 * Made to be readable on a small phone screen:
 *   - few words, very big, thick dark outline
 *   - one "key word" in a coloured box (a word with a number, else the last word)
 *   - the logo badge, so people learn to recognise the channel
 *
 * Each language has its own look, so the two channels never look like copies:
 *   English: gold key word, gold frame       Nepali: red key word, red frame, "नेपाली" tag
 */
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailProps } from "../types";
import { Background, Brand, BRAND_FONT, useFonts } from "./common";
import { LOGO, SparkIcon } from "./Logo";

/**
 * Which words get the coloured box: the first word with a number (plus a short unit
 * after it, like "4 mm" or "३ सय"), else the last word. Returns [first, last] word index.
 */
export function keyWords(words: string[]): [number, number] {
  const n = words.findIndex((w) => /[0-9०-९]/.test(w));
  if (n < 0) return [words.length - 1, words.length - 1];
  const next = words[n + 1];
  return next && [...next].length <= 4 ? [n, n + 1] : [n, n];
}

/** Font size so the longest word fits on one line and the headline fits in about 4 lines. */
export function headlineSize(words: string[], boxWidth: number, maxSize: number, language: "ne" | "en"): number {
  const em = language === "en" ? 0.6 : 0.46; // rough width of one letter, in font sizes
  const len = (w: string) => [...w].length;
  const longest = Math.max(3, ...words.map(len));
  let size = Math.min(maxSize, boxWidth / (longest * em + 0.6));
  const total = words.reduce((n, w) => n + len(w) + 1, 0);
  while (size > 40 && (total * em * size) / boxWidth > 3.6) size -= 4;
  return Math.floor(size);
}

export function Thumbnail(props: ThumbnailProps) {
  useFonts();
  const { width, height } = useVideoConfig();
  const tall = height > width;
  const ne = props.language === "ne";
  const scale = width / (tall ? 1080 : 1280);
  const theme = ne
    ? { box: LOGO.crimson, boxText: "#fff", frame: LOGO.crimson, spark: LOGO.marigold }
    : { box: LOGO.marigold, boxText: LOGO.ink, frame: LOGO.marigold, spark: LOGO.crimson };

  const words = props.headline.trim().split(/\s+/).filter(Boolean);
  const [keyFrom, keyTo] = keyWords(words);
  // Join the key words into one piece, so they sit in one box.
  const pieces = [...words.slice(0, keyFrom), words.slice(keyFrom, keyTo + 1).join("\u00a0"), ...words.slice(keyTo + 1)];
  const key = keyFrom;
  const boxWidth = tall ? 960 * scale : 700 * scale;
  const size = headlineSize(pieces, boxWidth, (tall ? 168 : 112) * scale, props.language);

  return (
    <AbsoluteFill style={{ backgroundColor: LOGO.ink }}>
      {/* The picture, a little brighter and more colourful than in the video. */}
      <AbsoluteFill style={{ filter: "saturate(1.2) contrast(1.08)" }}>
        <Background media={props.media} index={ne ? 2 : 0} frames={1} />
      </AbsoluteFill>
      {/* Dark shading where the text goes. */}
      <AbsoluteFill
        style={{
          background: tall
            ? `linear-gradient(to bottom, rgba(7,11,23,0.6) 0%, rgba(7,11,23,0) 18%, rgba(7,11,23,0) 38%, rgba(19,32,63,0.88) 62%, rgba(7,11,23,0.96) 100%)`
            : `linear-gradient(to right, rgba(7,11,23,0.95) 0%, rgba(19,32,63,0.82) 45%, rgba(7,11,23,0.05) 78%)`,
        }}
      />
      {/* A soft red glow behind the headline (the logo's "energy"). */}
      <AbsoluteFill
        style={{
          background: tall
            ? `radial-gradient(ellipse at 50% 74%, ${LOGO.crimson}55 0%, transparent 55%)`
            : `radial-gradient(ellipse at 22% 60%, ${LOGO.crimson}55 0%, transparent 50%)`,
        }}
      />

      <Brand name={props.brand} scale={scale * (tall ? 1.55 : 1.05)} opacity={1} />
      {ne ? (
        <div
          style={{
            position: "absolute",
            top: (tall ? 64 : 40) * scale,
            right: (tall ? 48 : 36) * scale,
            padding: `${4 * scale}px ${(tall ? 30 : 20) * scale}px`,
            borderRadius: 999,
            background: LOGO.crimson,
            color: "#fff",
            fontFamily: BRAND_FONT,
            fontWeight: 800,
            fontSize: (tall ? 52 : 34) * scale,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          नेपाली
        </div>
      ) : null}

      {/* The headline. */}
      <div
        style={{
          position: "absolute",
          left: (tall ? 60 : 56) * scale,
          width: boxWidth,
          ...(tall ? { top: 1020 * scale, height: 700 * scale } : { top: 150 * scale, height: 500 * scale }),
          display: "flex",
          alignItems: "center",
          justifyContent: tall ? "center" : "flex-start",
        }}
      >
        <div
          style={{
            transform: `rotate(${tall ? -3 : -2}deg)`,
            textAlign: tall ? "center" : "left",
            fontFamily: BRAND_FONT,
            fontWeight: 800,
            fontSize: size,
            lineHeight: ne ? 1.32 : 1.08,
            textTransform: ne ? undefined : "uppercase",
            color: "white",
            WebkitTextStroke: `${Math.max(6, size * 0.09)}px ${LOGO.ink}`,
            paintOrder: "stroke fill",
            textShadow: `0 ${size * 0.07}px 0 rgba(0,0,0,0.75)`,
          }}
        >
          {pieces.map((w, i) => (
            <span key={i}>
              {i === key ? (
                <span
                  style={{
                    display: "inline-block",
                    background: theme.box,
                    color: theme.boxText,
                    WebkitTextStroke: "0",
                    textShadow: "none",
                    padding: `0 ${size * 0.16}px`,
                    margin: `${size * 0.06}px 0`,
                    borderRadius: size * 0.14,
                    transform: "rotate(2deg)",
                    boxShadow: `0 ${size * 0.08}px 0 rgba(0,0,0,0.6)`,
                  }}
                >
                  {w}
                </span>
              ) : (
                w
              )}
              {i < pieces.length - 1 ? " " : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Sparks next to the headline. */}
      <div style={{ position: "absolute", ...(tall ? { right: 70 * scale, top: 960 * scale } : { left: 700 * scale, top: 110 * scale }) }}>
        <SparkIcon size={(tall ? 90 : 60) * scale} color={theme.spark} />
      </div>
      <div style={{ position: "absolute", ...(tall ? { left: 80 * scale, top: 1730 * scale } : { left: 40 * scale, top: 640 * scale }) }}>
        <SparkIcon size={(tall ? 54 : 36) * scale} color={LOGO.crimson} />
      </div>

      {/* Coloured frame: gold for English, red for Nepali. */}
      <AbsoluteFill style={{ boxShadow: `inset 0 0 0 ${(tall ? 14 : 10) * scale}px ${theme.frame}` }} />
    </AbsoluteFill>
  );
}
