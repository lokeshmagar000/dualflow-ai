/**
 * The thumbnail: a picture from the video with a big, bold headline.
 */
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailProps } from "../types";
import { Background, Brand, FONT, useFonts } from "./common";

export function Thumbnail(props: ThumbnailProps) {
  useFonts();
  const { width, height } = useVideoConfig();
  const scale = width / 1080;
  const tall = height > width;
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Background media={props.media} index={0} frames={1} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.1) 70%)" }} />
      <Brand name={props.brand} scale={scale * (tall ? 1.2 : 1.5)} />
      <div
        style={{
          position: "absolute",
          left: 60 * scale,
          right: 60 * scale,
          bottom: (tall ? 260 : 70) * scale,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: (tall ? 120 : 115) * scale,
          lineHeight: 1.5,
          color: "white",
          WebkitTextStroke: `${12 * scale}px black`,
          paintOrder: "stroke fill",
        }}
      >
        <span style={{ background: props.accent, color: "#111", WebkitTextStroke: "0", padding: `0 ${20 * scale}px`, borderRadius: 16 * scale, WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}>
          {props.headline}
        </span>
      </div>
    </AbsoluteFill>
  );
}
