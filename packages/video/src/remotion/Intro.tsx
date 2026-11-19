/**
 * The animated intro (about 2 seconds) at the start of every video.
 *
 * What happens, frame by frame (30 frames = 1 second):
 *   0-14   a light streak sweeps across the screen (you hear a "whoosh")
 *   ~13    the channel name pops in, two rings burst out (you hear the "hit" and a chime)
 *   18-30  a coloured bar grows under the name, then the tagline slides up
 *   last 9 the whole intro zooms forward and fades, and the story appears behind it
 *
 * English names pop in letter by letter. Nepali names pop in word by word, because
 * cutting a Devanagari word into pieces can break joined letters.
 */
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, INTRO_OVERLAP_MS, type IntroProps } from "../types";
import { WORD_POP_FONT } from "./WordPop";

const HIT = 13; // the frame where the name lands (matches the "hit" in the intro sound)

export function Intro({
  intro,
  language,
  accent,
  frames,
}: {
  intro: IntroProps;
  language: "ne" | "en";
  accent: string;
  frames: number;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height) / 1080;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // Exit: zoom forward and fade during the last frames (the story is already playing behind).
  const exitStart = frames - Math.round((INTRO_OVERLAP_MS / 1000) * FPS) - 3;
  const exit = interpolate(frame, [exitStart, frames], [0, 1], clamp);

  // Pieces that pop in one after another.
  const pieces = language === "en" ? [...intro.text] : intro.text.split(/(\s+)/);
  const letters = [...intro.text].length;
  const nameSize = Math.min(150, (Math.min(width, 1080) * 0.85) / Math.max(4, letters * (language === "en" ? 0.68 : 0.55))) * unit;

  const streakX = interpolate(frame, [0, 14], [-0.6, 1.4], clamp);
  const bar = spring({ frame: frame - 18, fps, config: { damping: 16 } });
  const tag = spring({ frame: frame - 24, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ opacity: 1 - exit, transform: `scale(${1 + 0.18 * exit})` }}>
      {intro.soundFile ? <Audio src={intro.soundFile} /> : null}

      {/* Dark background with a soft glow in the accent colour. */}
      <AbsoluteFill
        style={{ background: `radial-gradient(circle at 50% 46%, ${accent}66 0%, #14141f 45%, #050508 80%)` }}
      />

      {/* The light streak (whoosh). */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(105deg, transparent ${streakX * 100 - 12}%, rgba(255,255,255,0.55) ${streakX * 100}%, transparent ${streakX * 100 + 12}%)`,
          opacity: interpolate(frame, [0, 3, 12, 15], [0, 1, 1, 0], clamp),
        }}
      />

      {/* Two rings burst out when the name lands. */}
      {[0, 5].map((delay) => {
        const t = interpolate(frame, [HIT + delay, HIT + delay + 22], [0, 1], clamp);
        return (
          <div
            key={delay}
            style={{
              position: "absolute",
              left: "50%",
              top: "46%",
              width: 420 * unit,
              height: 420 * unit,
              marginLeft: -210 * unit,
              marginTop: -210 * unit,
              borderRadius: "50%",
              border: `${10 * unit * (1 - t) + 1}px solid ${accent}`,
              transform: `scale(${0.3 + 2.4 * t})`,
              opacity: t > 0 ? 1 - t : 0,
            }}
          />
        );
      })}

      {/* Channel name, tagline and the bar between them. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", top: "-8%" }}>
        <div
          style={{
            fontFamily: WORD_POP_FONT[language],
            fontWeight: 800,
            fontSize: nameSize,
            lineHeight: 1.25,
            color: "white",
            whiteSpace: "pre",
            textShadow: `0 ${8 * unit}px 0 rgba(0,0,0,0.6), 0 0 ${40 * unit}px ${accent}99`,
          }}
        >
          {pieces.map((piece, i) => {
            const delay = HIT - 3 + i * (language === "en" ? 1.2 : 3);
            const s = spring({ frame: frame - delay, fps, config: { damping: 9, mass: 0.6 } });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: Math.min(1, s * 2),
                  transform: `translateY(${(1 - s) * 70 * unit}px) scale(${0.3 + 0.7 * s})`,
                }}
              >
                {piece}
              </span>
            );
          })}
        </div>
        <div
          style={{
            height: 12 * unit,
            width: `${Math.min(70, letters * 5) * bar}%`,
            maxWidth: 760 * unit,
            borderRadius: 6 * unit,
            background: accent,
            marginTop: 14 * unit,
            boxShadow: `0 0 ${24 * unit}px ${accent}`,
          }}
        />
        {intro.tagline ? (
          <div
            style={{
              marginTop: 26 * unit,
              fontFamily: WORD_POP_FONT[language],
              fontWeight: 800,
              fontSize: 54 * unit,
              color: accent,
              letterSpacing: language === "en" ? 4 * unit : 0,
              textTransform: language === "en" ? "uppercase" : undefined,
              opacity: tag,
              transform: `translateY(${(1 - tag) * 40 * unit}px)`,
            }}
          >
            {intro.tagline}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
