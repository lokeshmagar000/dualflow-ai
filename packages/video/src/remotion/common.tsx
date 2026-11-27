/**
 * Pieces shared by the video and the thumbnail: fonts and backgrounds.
 */
import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Img,
  Loop,
  OffthreadVideo,
  Easing,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { Media } from "../types";
import { LOGO, Logo } from "./Logo";

/** Noto Sans Devanagari draws Nepali AND English letters correctly (joined letters too). */
export const FONT = '"Noto Sans Devanagari", sans-serif';

/** The logo font (Baloo 2): Latin and Devanagari letters, so both channel names match the logo. */
export const BRAND_FONT = '"Baloo 2", "Noto Sans Devanagari", sans-serif';

/** Thumbnail headline fonts: tall, heavy and easy to read small. Anton for English, Khand for Nepali. */
export const HEADLINE_FONT = {
  en: '"Anton", "Baloo 2", sans-serif',
  ne: '"Khand", "Baloo 2", "Noto Sans Devanagari", sans-serif',
} as const;

/** Wait until the font has loaded, so no frame is drawn with the wrong letters. */
export function useFonts() {
  const [handle] = useState(() => delayRender("Loading fonts"));
  useEffect(() => {
    Promise.all([
      document.fonts.load(`800 64px "Noto Sans Devanagari"`, "नमस्ते Hello"),
      document.fonts.load(`500 64px "Noto Sans Devanagari"`, "नमस्ते Hello"),
      document.fonts.load(`800 64px "Poppins"`, "Hello"),
      document.fonts.load(`800 64px "Mukta"`, "नमस्ते क्षेत्र"),
      document.fonts.load(`800 64px "Baloo 2"`, "नमस्ते फ्याक्ट्स Namaste Facts"),
      document.fonts.load(`600 64px "Baloo 2"`, "सानो तथ्य, ठूलो अचम्म Small facts"),
      document.fonts.load(`400 64px "Anton"`, "EVEREST 4 MM"),
      document.fonts.load(`700 64px "Khand"`, "सगरमाथा ४ मिमि बढ्छ"),
    ])
      .catch(() => undefined) // still draw, with the fallback font
      .then(() => continueRender(handle));
  }, [handle]);
}

/** Colour pairs for scenes without a picture. */
const GRADIENTS: [string, string][] = [
  ["#1d2b64", "#f8cdda"],
  ["#0f2027", "#2c5364"],
  ["#42275a", "#734b6d"],
  ["#134e5e", "#71b280"],
  ["#232526", "#414345"],
  ["#3a1c71", "#d76d77"],
];

/**
 * The background of one scene: a stock video, a photo (slowly zooming in),
 * or a moving colour gradient when we have no picture.
 */
export function Background({ media, index, frames }: { media?: Media | null; index: number; frames: number }) {
  const frame = useCurrentFrame();
  // Slow, smooth camera move ("Ken Burns" effect) on photos AND clips, so nothing feels frozen.
  // Even scenes zoom in, odd scenes zoom out, and each drifts a little sideways.
  const t = Easing.inOut(Easing.sin)(Math.min(1, frame / Math.max(1, frames)));
  const zoomIn = index % 2 === 0;
  // Photos move more than clips (a still photo must never look frozen).
  const photo = media?.kind === "image";
  const amount = photo ? 0.2 : 0.06;
  const zoom = zoomIn ? 1.04 + amount * t : 1.04 + amount * (1 - t);
  const drift = (index % 3 === 0 ? 1 : index % 3 === 1 ? -1 : 0) * (photo ? 4 : 2.5) * t; // percent
  const lift = photo ? (index % 2 === 0 ? -1.5 : 1.5) * t : 0; // percent, a slow tilt up or down
  const turn = photo ? (index % 2 === 0 ? 0.8 : -0.8) * t : 0; // degrees
  const fill = {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    transform: `scale(${zoom}) translate(${drift}%, ${lift}%) rotate(${turn}deg)`,
  };

  if (media?.kind === "video") {
    const start = Math.round((media.atSec ?? 0) * 30);
    const clip = <OffthreadVideo src={media.src} muted style={fill} startFrom={start} />;
    // A clip shorter than its scene loops (instead of stopping on its last frame).
    const usable = media.durationSec ? Math.floor(media.durationSec * 30) - start - 2 : 0;
    return <AbsoluteFill>{usable > 15 && usable < frames ? <Loop durationInFrames={usable}>{clip}</Loop> : clip}</AbsoluteFill>;
  }
  if (media?.kind === "image" && media.fit === "contain") {
    // A real news photo: the whole photo (nobody's head cut off), with a soft zoom, on a blurred
    // and darkened copy of itself that fills the rest of the screen.
    return (
      <AbsoluteFill>
        <Img src={media.src} style={{ ...fill, transform: "scale(1.15)", filter: "blur(28px) brightness(0.55)" }} />
        <AbsoluteFill style={{ padding: "4%" }}>
          <Img src={media.src} style={{ ...fill, objectFit: "contain", transform: `scale(${zoomIn ? 1 + 0.08 * t : 1.08 - 0.08 * t})` }} />
        </AbsoluteFill>
        {media.credit ? <Credit text={media.credit} /> : null}
      </AbsoluteFill>
    );
  }
  if (media?.kind === "image") {
    return (
      <AbsoluteFill>
        <Img src={media.src} style={fill} />
        {media.credit ? <Credit text={media.credit} /> : null}
      </AbsoluteFill>
    );
  }
  const [a, b] = GRADIENTS[index % GRADIENTS.length]!;
  const angle = 135 + interpolate(frame, [0, Math.max(1, frames)], [0, 40]);
  return <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${a}, ${b})` }} />;
}

/** The photo's credit (its licence asks for it): small, bottom right, readable on any picture. */
function Credit({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 18,
        bottom: 14,
        maxWidth: "60%",
        fontFamily: FONT,
        fontSize: 22,
        color: "rgba(255,255,255,0.85)",
        background: "rgba(0,0,0,0.45)",
        padding: "3px 10px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {text}
    </div>
  );
}

/** Dark shading at the top and bottom, so white text is easy to read on any picture. */
export function Shade() {
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%)",
      }}
    />
  );
}

/**
 * The channel name in logo colours: the last word in marigold,
 * like the logo ("Namaste Facts" / "नमस्ते फ्याक्ट्स").
 */
export function BrandName({ name, color = "white" }: { name: string; color?: string }) {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop()! : null;
  return (
    <span style={{ color, whiteSpace: "nowrap" }}>
      {words.join(" ")}
      {last ? <span style={{ color: LOGO.marigold }}> {last}</span> : null}
    </span>
  );
}

/**
 * The channel badge in the top-left corner: logo + channel name on a dark pill.
 * Always on screen, so a clip shared anywhere still shows where it came from.
 */
/** The small red label after the channel name ("नेपाली"), like in the final logo files. */
export function BrandTag({ text, size }: { text: string; size: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        marginLeft: size * 0.35,
        padding: `${size * 0.04}px ${size * 0.42}px 0`,
        borderRadius: 999,
        background: LOGO.crimson,
        color: "#fff",
        fontFamily: BRAND_FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.35,
        verticalAlign: "middle",
        boxShadow: `0 ${size * 0.08}px ${size * 0.3}px rgba(0,0,0,0.35)`,
      }}
    >
      {text}
    </span>
  );
}

export function Brand({ name, tag, scale, opacity = 0.95 }: { name: string; tag?: string; scale: number; opacity?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 44 * scale,
        left: 40 * scale,
        display: "flex",
        alignItems: "center",
        gap: 10 * scale,
        padding: `${6 * scale}px ${26 * scale}px ${6 * scale}px ${10 * scale}px`,
        borderRadius: 999,
        background: "rgba(19,32,63,0.72)",
        border: `${2 * scale}px solid rgba(245,166,35,0.55)`,
        boxShadow: `0 ${6 * scale}px ${24 * scale}px rgba(0,0,0,0.35), 0 0 ${18 * scale}px rgba(200,16,46,0.35)`,
        opacity,
      }}
    >
      <Logo size={64 * scale} glow={0.6} />
      <div style={{ fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 38 * scale, lineHeight: 1.1, paddingTop: 4 * scale }}>
        <BrandName name={name} />
      </div>
      {tag ? <BrandTag text={tag} size={28 * scale} /> : null}
    </div>
  );
}
