/**
 * The animated intro (about 2 seconds) at the start of every video: the Namaste Facts
 * logo, the channel name in the video's language, and the tagline.
 *
 * What happens, frame by frame (30 frames = 1 second):
 *   0-14   a light streak sweeps across the screen (you hear a "whoosh")
 *   3-13   the logo (Palm Bulb) pops in, its red sparks start to twinkle
 *   ~13    the channel name pops in, two red rings burst out (you hear the "hit" and a chime)
 *   18-30  a red-to-gold bar grows under the name, then the tagline slides up
 *   last 9 the whole intro zooms forward and fades, and the story appears behind it
 *
 * English names pop in letter by letter. Nepali names pop in word by word, because
 * cutting a Devanagari word into pieces can break joined letters.
 */
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, INTRO_OVERLAP_MS, type IntroProps } from "../types";
import { BRAND_FONT } from "./common";
import { LOGO, Logo, SparkIcon } from "./Logo";

const HIT = 13; // the frame where the name lands (matches the "hit" in the intro sound)

export function Intro({
  intro,
  language,
  frames,
}: {
  intro: IntroProps;
  language: "ne" | "en";
  accent?: string;
  frames: number;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height) / 1080;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // Exit: zoom forward and fade during the last frames (the story is already playing behind).
  const exitStart = frames - Math.round((INTRO_OVERLAP_MS / 1000) * FPS) - 3;
  const exit = interpolate(frame, [exitStart, frames], [0, 1], clamp);

  // Pieces that pop in one after another. The last word is marigold, like the logo.
  const words = intro.text.trim().split(/\s+/);
  const lastWord = words.length > 1 ? words.length - 1 : -1;
  const pieces: { text: string; gold: boolean }[] = [];
  words.forEach((w, wi) => {
    if (wi > 0) pieces.push({ text: " ", gold: false });
    const parts = language === "en" ? [...w] : [w];
    for (const p of parts) pieces.push({ text: p, gold: wi === lastWord });
  });
  const letters = [...intro.text].length;
  const nameSize = Math.min(132, (Math.min(width, 1080) * 0.86) / Math.max(4, letters * (language === "en" ? 0.5 : 0.43))) * unit;

  const streakX = interpolate(frame, [0, 14], [-0.6, 1.4], clamp);
  const logoIn = spring({ frame: frame - 3, fps, config: { damping: 10, mass: 0.7 } });
  const bar = spring({ frame: frame - 18, fps, config: { damping: 16 } });
  const tag = spring({ frame: frame - 24, fps, config: { damping: 14 } });
  const logoSize = 360 * unit;

  return (
    <AbsoluteFill style={{ opacity: 1 - exit, transform: `scale(${1 + 0.18 * exit})` }}>
      {intro.soundFile ? <Audio src={intro.soundFile} /> : null}

      {/* Logo navy background with a red glow behind the logo. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 36%, ${LOGO.crimson}88 0%, ${LOGO.ink} 38%, #070b17 82%)`,
        }}
      />

      {/* The light streak (whoosh). */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(105deg, transparent ${streakX * 100 - 12}%, rgba(255,255,255,0.5) ${streakX * 100}%, transparent ${streakX * 100 + 12}%)`,
          opacity: interpolate(frame, [0, 3, 12, 15], [0, 1, 1, 0], clamp),
        }}
      />

      {/* Small sparks flying out from the logo. */}
      {[
        [-1, -0.7, LOGO.crimson],
        [1, -0.9, LOGO.marigold],
        [1.2, 0.3, LOGO.crimson],
        [-1.25, 0.25, LOGO.marigold],
        [0.15, -1.3, LOGO.crimson],
      ].map(([dx, dy, color], i) => {
        const t = interpolate(frame, [HIT - 2 + i, HIT + 22 + i], [0, 1], clamp);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: width / 2 + (dx as number) * 300 * unit * t - 18 * unit,
              top: height * 0.36 + (dy as number) * 300 * unit * t - 18 * unit,
              opacity: t > 0 ? 1 - t * t : 0,
              transform: `scale(${0.4 + t}) rotate(${t * 90}deg)`,
            }}
          >
            <SparkIcon size={36 * unit} color={color as string} />
          </div>
        );
      })}

      {/* Two red rings burst out when the name lands. */}
      {[0, 5].map((delay) => {
        const t = interpolate(frame, [HIT + delay, HIT + delay + 22], [0, 1], clamp);
        return (
          <div
            key={delay}
            style={{
              position: "absolute",
              left: "50%",
              top: "36%",
              width: 420 * unit,
              height: 420 * unit,
              marginLeft: -210 * unit,
              marginTop: -210 * unit,
              borderRadius: "50%",
              border: `${10 * unit * (1 - t) + 1}px solid ${delay ? LOGO.marigold : LOGO.crimson}`,
              transform: `scale(${0.3 + 2.4 * t})`,
              opacity: t > 0 ? 1 - t : 0,
            }}
          />
        );
      })}

      {/* Logo, channel name, bar and tagline. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", top: "-6%" }}>
        <div style={{ opacity: Math.min(1, logoIn * 2), transform: `scale(${0.2 + 0.8 * logoIn}) rotate(${(1 - logoIn) * -25}deg)` }}>
          <Logo size={logoSize} twinkle={frame / 20} glow={0.9} />
        </div>
        <div
          style={{
            marginTop: 18 * unit,
            fontFamily: BRAND_FONT,
            fontWeight: 800,
            fontSize: nameSize,
            lineHeight: 1.2,
            color: "white",
            whiteSpace: "pre",
            textShadow: `0 ${7 * unit}px 0 rgba(0,0,0,0.55), 0 0 ${36 * unit}px ${LOGO.crimson}aa`,
          }}
        >
          {pieces.map((piece, i) => {
            const delay = HIT - 3 + i * (language === "en" ? 1 : 3);
            const s = spring({ frame: frame - delay, fps, config: { damping: 9, mass: 0.6 } });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color: piece.gold ? LOGO.marigold : "white",
                  opacity: Math.min(1, s * 2),
                  transform: `translateY(${(1 - s) * 70 * unit}px) scale(${0.3 + 0.7 * s})`,
                }}
              >
                {piece.text}
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
            background: `linear-gradient(90deg, ${LOGO.crimson}, ${LOGO.marigold})`,
            marginTop: 6 * unit,
            boxShadow: `0 0 ${24 * unit}px ${LOGO.crimson}`,
          }}
        />
        {intro.tagline ? (
          <div
            style={{
              marginTop: 22 * unit,
              fontFamily: BRAND_FONT,
              fontWeight: 600,
              fontSize: 54 * unit,
              color: LOGO.snow,
              opacity: tag * 0.92,
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
