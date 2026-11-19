/**
 * The full video: background for each scene, the voice, the title at the start,
 * Nepali/English subtitles, and a progress bar.
 */
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type VideoProps } from "../types";
import { Background, Brand, FONT, Shade, useFonts } from "./common";

const FADE = 8; // frames of cross-fade between scenes
const ms = (t: number) => Math.round((t / 1000) * FPS);

export function Video(props: VideoProps) {
  useFonts();
  const { durationInFrames, width } = useVideoConfig();
  const scale = width / 1080; // sizes below are designed for 1080 px wide
  const tall = props.format === "SHORT";

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {props.scenes.map((scene, i) => {
        // The first scene starts at 0; the last one lasts until the end.
        const from = i === 0 ? 0 : ms(scene.startMs);
        const to = i === props.scenes.length - 1 ? durationInFrames : ms(props.scenes[i + 1]!.startMs) + FADE;
        const frames = Math.max(1, to - from);
        return (
          <Sequence key={i} from={from} durationInFrames={frames}>
            <SceneFade fadeIn={i > 0}>
              <Background media={scene.media} index={i} frames={frames} />
            </SceneFade>
          </Sequence>
        );
      })}
      <Shade />
      {props.audioFile ? <Audio src={props.audioFile} /> : null}
      <Brand name={props.brand} scale={scale} />
      <Title text={props.title} accent={props.accent} scale={scale} tall={tall} />
      <Subtitles props={props} scale={tall ? scale : scale * 0.9} tall={tall} />
      <Progress accent={props.accent} />
    </AbsoluteFill>
  );
}

function SceneFade({ fadeIn, children }: { fadeIn: boolean; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = fadeIn ? interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

/** The title pops in at the start and fades out after about 3 seconds. */
function Title({ text, accent, scale, tall }: { text: string; accent: string; scale: number; tall: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14 } });
  const out = interpolate(frame, [fps * 2.6, fps * 3.2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (out <= 0 || !text) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: (tall ? 260 : 120) * scale,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: out,
        transform: `scale(${0.8 + 0.2 * pop})`,
      }}
    >
      <div
        style={{
          maxWidth: "86%",
          padding: `${18 * scale}px ${36 * scale}px`,
          borderRadius: 24 * scale,
          background: accent,
          color: "#111",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: (tall ? 70 : 64) * scale,
          lineHeight: 1.35,
          textAlign: "center",
          boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

/** The subtitle line for the current moment, with a small "pop" when it changes. */
function Subtitles({ props, scale, tall }: { props: VideoProps; scale: number; tall: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const cue = props.cues.find((c) => nowMs >= c.startMs && nowMs < c.endMs + 150);
  if (!cue) return null;
  const sinceStart = frame - ms(cue.startMs);
  const pop = spring({ frame: sinceStart, fps, config: { damping: 12, mass: 0.6 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // Shorts: a bit below the middle (YouTube's buttons cover the bottom). Wide: near the bottom.
        top: tall ? "62%" : undefined,
        bottom: tall ? undefined : 90 * scale,
        display: "flex",
        justifyContent: "center",
        transform: `scale(${0.85 + 0.15 * pop})`,
      }}
    >
      <div
        style={{
          maxWidth: "84%",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: (tall ? 76 : 60) * scale,
          lineHeight: 1.45,
          color: "white",
          textAlign: "center",
          // A thick dark outline keeps the letters readable on bright pictures.
          WebkitTextStroke: `${10 * scale}px rgba(0,0,0,0.85)`,
          paintOrder: "stroke fill",
          textShadow: "0 6px 18px rgba(0,0,0,0.6)",
        }}
      >
        {cue.text}
      </div>
    </div>
  );
}

function Progress({ accent }: { accent: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 10,
        width: `${(frame / Math.max(1, durationInFrames - 1)) * 100}%`,
        background: accent,
      }}
    />
  );
}
