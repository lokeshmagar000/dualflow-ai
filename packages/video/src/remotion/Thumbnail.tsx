/**
 * The thumbnail: a picture that matches the topic, a huge headline and the Namaste Facts badge.
 *
 * One drawing, three sizes (see THUMBNAIL_SIZES): the layout follows the shape.
 *   shorts  1080x1920  tall: badge on top, headline in the lower half
 *   feed    1080x1350  4:5: same idea, a bit tighter
 *   youtube 1280x720   wide: headline on the left, picture on the right
 *
 * Made to be readable on a small phone screen:
 *   - few words, very big, in tall heavy fonts (Anton for English, Khand for Nepali),
 *     with a thick dark outline
 *   - one "key word" in a coloured box (a number with its unit, else the last word)
 *   - the logo badge, so people learn to recognise the channel
 *
 * Each language has its own look, so the two channels never look like copies:
 *   English: gold key word, gold frame       Nepali: red key word, red frame, "नेपाली" label
 */
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailProps } from "../types";
import { Background, Brand, BRAND_FONT, HEADLINE_FONT, useFonts } from "./common";
import { LOGO, SparkIcon } from "./Logo";

/**
 * Which words get the coloured box: the first word with a number (plus a short unit
 * after it, like "4 mm" or "४ मिमि"), else the last word. Returns [first, last] word index.
 */
export function keyWords(words: string[]): [number, number] {
  const n = words.findIndex((w) => /[0-9०-९]/.test(w));
  if (n < 0) return [words.length - 1, words.length - 1];
  const next = words[n + 1];
  return next && [...next].length <= 4 ? [n, n + 1] : [n, n];
}

/** Rough width of one letter, in font sizes (Anton capitals and Khand are narrow fonts). */
const LETTER_EM = { en: 0.5, ne: 0.42 } as const;
const LINE_HEIGHT = { en: 1.08, ne: 1.12 } as const;

/**
 * The biggest font size where the longest word fits on one line
 * and all the lines fit in the box.
 */
export function headlineSize(
  words: string[],
  box: { width: number; height: number },
  maxSize: number,
  language: "ne" | "en",
): number {
  const em = LETTER_EM[language];
  const len = (w: string) => [...w].length;
  const longest = Math.max(3, ...words.map(len));
  let size = Math.min(maxSize, box.width / (longest * em + 0.7));
  const lines = (s: number) => {
    // Fill lines word by word, like the browser does.
    let count = 1;
    let used = 0;
    for (const w of words) {
      const wWidth = (len(w) + 1) * em * s;
      if (used > 0 && used + wWidth > box.width) {
        count++;
        used = 0;
      }
      used += wWidth;
    }
    return count;
  };
  while (size > 40 && lines(size) * size * LINE_HEIGHT[language] * 1.08 > box.height) size -= 4;
  return Math.floor(size);
}

export function Thumbnail(props: ThumbnailProps) {
  useFonts();
  const { width, height } = useVideoConfig();
  const wide = width > height;
  const ne = props.language === "ne";
  const u = width / (wide ? 1280 : 1080); // sizes below are for 1280 (wide) or 1080 (tall) px
  const theme = ne
    ? { box: LOGO.crimson, boxText: "#fff", frame: LOGO.crimson, spark: LOGO.marigold }
    : { box: LOGO.marigold, boxText: LOGO.ink, frame: LOGO.marigold, spark: LOGO.crimson };

  const words = props.headline.trim().split(/\s+/).filter(Boolean);
  const [keyFrom, keyTo] = keyWords(words);
  // Join the key words into one piece, so they sit in one box.
  const pieces = [...words.slice(0, keyFrom), words.slice(keyFrom, keyTo + 1).join(" "), ...words.slice(keyTo + 1)];
  const key = keyFrom;

  // Where the headline goes.
  const box = wide
    ? { left: 52 * u, top: 130 * u, width: 720 * u, height: 540 * u }
    : { left: 60 * u, top: height * 0.5, width: 960 * u, height: height * 0.43 };
  const size = headlineSize(pieces, box, (wide ? 150 : 210) * u, props.language);

  return (
    <AbsoluteFill style={{ backgroundColor: LOGO.ink }}>
      {/* The picture, a little brighter and more colourful than in the video. */}
      <AbsoluteFill style={{ filter: "saturate(1.25) contrast(1.1)" }}>
        <Background media={props.media} index={ne ? 2 : 0} frames={1} />
      </AbsoluteFill>
      {/* Dark shading where the text goes. */}
      <AbsoluteFill
        style={{
          background: wide
            ? `linear-gradient(to right, rgba(7,11,23,0.94) 0%, rgba(19,32,63,0.8) 42%, rgba(7,11,23,0) 75%)`
            : `linear-gradient(to bottom, rgba(7,11,23,0.6) 0%, rgba(7,11,23,0) 16%, rgba(7,11,23,0) 36%, rgba(19,32,63,0.86) 58%, rgba(7,11,23,0.96) 100%)`,
        }}
      />
      {/* A soft red glow behind the headline (the logo's "energy"). */}
      <AbsoluteFill
        style={{
          background: wide
            ? `radial-gradient(ellipse at 24% 62%, ${LOGO.crimson}55 0%, transparent 50%)`
            : `radial-gradient(ellipse at 50% 74%, ${LOGO.crimson}55 0%, transparent 55%)`,
        }}
      />

      <Brand name={props.brand} tag={props.brandTag} scale={u * (wide ? 1.05 : 1.55)} opacity={1} />

      {/* The headline. */}
      <div
        style={{
          position: "absolute",
          ...box,
          display: "flex",
          alignItems: "center",
          justifyContent: wide ? "flex-start" : "center",
        }}
      >
        <div
          style={{
            transform: `rotate(${wide ? -2 : -3}deg)`,
            textAlign: wide ? "left" : "center",
            fontFamily: HEADLINE_FONT[props.language],
            fontWeight: ne ? 700 : 400,
            fontSize: size,
            lineHeight: LINE_HEIGHT[props.language],
            textTransform: ne ? undefined : "uppercase",
            letterSpacing: ne ? 0 : size * 0.01,
            color: "white",
            WebkitTextStroke: `${Math.max(6, size * 0.1)}px ${LOGO.ink}`,
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
                    padding: `${ne ? size * 0.04 : 0}px ${size * 0.14}px 0`,
                    margin: `${size * 0.05}px 0`,
                    borderRadius: size * 0.12,
                    transform: "rotate(2deg)",
                    boxShadow: `0 ${size * 0.08}px 0 rgba(0,0,0,0.6)`,
                  }}
                >
                  <Digits text={w} ne={ne} />
                </span>
              ) : (
                <Digits text={w} ne={ne} />
              )}
              {i < pieces.length - 1 ? " " : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Sparks next to the headline. */}
      <div style={{ position: "absolute", ...(wide ? { left: 730 * u, top: 110 * u } : { right: 70 * u, top: box.top - 70 * u }) }}>
        <SparkIcon size={(wide ? 60 : 90) * u} color={theme.spark} />
      </div>
      <div style={{ position: "absolute", ...(wide ? { left: 36 * u, top: 650 * u } : { left: 70 * u, top: height - 150 * u }) }}>
        <SparkIcon size={(wide ? 36 : 54) * u} color={LOGO.crimson} />
      </div>

      {/* Coloured frame: gold for English, red for Nepali. */}
      <AbsoluteFill style={{ boxShadow: `inset 0 0 0 ${(wide ? 10 : 14) * u}px ${theme.frame}` }} />
    </AbsoluteFill>
  );
}

/**
 * Khand draws Nepali digits (०-९) so they look like English ones,
 * so in Nepali headlines the digits use the logo font (Baloo 2) instead.
 */
function Digits({ text, ne }: { text: string; ne: boolean }) {
  if (!ne || !/[०-९]/.test(text)) return <>{text}</>;
  return (
    <>
      {text.split(/([०-९]+)/).map((part, i) =>
        /[०-९]/.test(part) ? (
          <span key={i} style={{ fontFamily: BRAND_FONT, fontWeight: 800 }}>{part}</span>
        ) : (
          part
        ),
      )}
    </>
  );
}
