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

/** Noto Sans Devanagari draws Nepali AND English letters correctly (joined letters too). */
export const FONT = '"Noto Sans Devanagari", sans-serif';

/** Wait until the font has loaded, so no frame is drawn with the wrong letters. */
export function useFonts() {
  const [handle] = useState(() => delayRender("Loading Noto Sans Devanagari"));
  useEffect(() => {
    Promise.all([
      document.fonts.load(`800 64px "Noto Sans Devanagari"`, "नमस्ते Hello"),
      document.fonts.load(`500 64px "Noto Sans Devanagari"`, "नमस्ते Hello"),
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

/** Small channel name in the corner. */
export function Brand({ name, scale }: { name: string; scale: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 48 * scale,
        left: 48 * scale,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 34 * scale,
        color: "white",
        letterSpacing: 1,
        opacity: 0.9,
        textShadow: "0 2px 8px rgba(0,0,0,0.6)",
      }}
    >
      {name}
    </div>
  );
}
