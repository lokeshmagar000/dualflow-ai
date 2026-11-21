/**
 * Pieces shared by the video and the thumbnail: fonts and backgrounds.
 */
import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
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
  // Slow zoom ("Ken Burns" effect) makes still pictures feel alive.
  const zoom = interpolate(frame, [0, Math.max(1, frames)], [1, 1.12], { extrapolateRight: "clamp" });
  const fill = { width: "100%", height: "100%", objectFit: "cover" as const, transform: `scale(${zoom})` };

  if (media?.kind === "video") {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={media.src} muted style={fill} />
      </AbsoluteFill>
    );
  }
  if (media?.kind === "image") {
    return (
      <AbsoluteFill>
        <Img src={media.src} style={fill} />
      </AbsoluteFill>
    );
  }
  const [a, b] = GRADIENTS[index % GRADIENTS.length]!;
  const angle = 135 + interpolate(frame, [0, Math.max(1, frames)], [0, 40]);
  return <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${a}, ${b})` }} />;
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
export function Brand({ name, scale, opacity = 0.95 }: { name: string; scale: number; opacity?: number }) {
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
    </div>
  );
}
