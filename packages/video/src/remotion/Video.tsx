/**
 * The full video: a short animated intro (channel name + sound), then the story:
 * background for each scene, the voice, the title, Word Pop subtitles and a progress bar.
 */
import { useMemo } from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, introFrames, storyFrames, storyStartFrame, type VideoProps } from "../types";
import { Background, Brand, FONT, Shade, useFonts } from "./common";
import { Intro } from "./Intro";
import { WordPop, buildPages, wordsFromCues } from "./WordPop";
import { FollowCard } from "./FollowCard";

const FADE = 14; // frames of the smooth change from one picture to the next (about half a second)
const ms = (t: number) => Math.round((t / 1000) * FPS);

export function Video(props: VideoProps) {
  useFonts();
  const intro = introFrames(props);
  const start = storyStartFrame(props);
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Inside a Sequence, frame 0 is where the Sequence starts, so all story timings stay the same. */}
      <Sequence from={start} durationInFrames={storyFrames(props)} name="Story">
        <Story props={props} frames={storyFrames(props)} />
      </Sequence>
      {props.intro && intro > 0 ? (
        <Sequence durationInFrames={intro} name="Intro">
          <Intro intro={props.intro} language={props.language} frames={intro} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
}

function Story({ props, frames }: { props: VideoProps; frames: number }) {
  const { width } = useVideoConfig();
  const scale = width / 1080; // sizes below are designed for 1080 px wide
  const tall = props.format === "SHORT";
  const pages = useMemo(
    () => buildPages(props.words?.length ? props.words : wordsFromCues(props.cues)),
    [props.words, props.cues],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {props.scenes.map((scene, i) => {
        // The first scene starts at 0; the last one lasts until the end.
        // Each new picture starts fading in a moment BEFORE its words, in the short
        // pause between lines, so it is fully there when the voice starts talking about it.
        const changeAt = (t: number) => Math.max(0, ms(t) - Math.round(FADE / 2));
        const from = i === 0 ? 0 : changeAt(scene.startMs);
        const to = i === props.scenes.length - 1 ? frames : changeAt(props.scenes[i + 1]!.startMs) + FADE;
        const length = Math.max(1, to - from);
        return (
          <Sequence key={i} from={from} durationInFrames={length}>
            <SceneIn index={i}>
              <Background media={scene.media} index={i} frames={length} />
            </SceneIn>
          </Sequence>
        );
      })}
      <Shade />
      {props.audioFile ? <Audio src={props.audioFile} /> : null}
      <Brand name={props.brand} tag={props.brandTag} scale={scale * 1.2} />
      <Title text={props.title} accent={props.accent} scale={scale} tall={tall} />
      {props.subtitleStyle === "classic" ? (
        <Subtitles props={props} scale={tall ? scale : scale * 0.9} tall={tall} />
      ) : (
        <WordPop pages={pages} language={props.language} tall={tall} />
      )}
      {props.ctaStartMs != null && ms(props.ctaStartMs) < frames ? (
        <Sequence from={ms(props.ctaStartMs)} durationInFrames={Math.max(1, frames - ms(props.ctaStartMs))} name="Like and follow">
          <FollowCard
            language={props.language}
            frames={Math.max(1, frames - ms(props.ctaStartMs))}
            scale={tall ? scale : scale * 0.7}
            tall={tall}
          />
        </Sequence>
      ) : null}
      <Progress accent={props.accent} frames={frames} />
    </AbsoluteFill>
  );
}

/**
 * How a new picture comes in. The styles take turns, so the video feels edited by hand:
 *   0 soft cross-fade with a gentle zoom
 *   1 slide in from the right
 *   2 circle reveal from the middle
 *   3 blur to sharp
 *   4 slide up from below
 * All of them use an "ease out" curve: fast at first, then gently settling (fluid, not robotic).
 */
function SceneIn({ index, children }: { index: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  if (index === 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  const p = interpolate(frame, [0, FADE], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const style = (index - 1) % 5;
  let css: React.CSSProperties = {};
  if (style === 0) css = { opacity: p, transform: `scale(${1.08 - 0.08 * p})` };
  if (style === 1) css = { transform: `translateX(${(1 - p) * 100}%)`, boxShadow: "-30px 0 60px rgba(0,0,0,0.5)" };
  if (style === 2) css = { clipPath: `circle(${p * 75}% at 50% 50%)` };
  if (style === 3) css = { opacity: Math.min(1, p * 1.6), filter: `blur(${(1 - p) * 24}px)`, transform: `scale(${1.05 - 0.05 * p})` };
  if (style === 4) css = { transform: `translateY(${(1 - p) * 100}%)`, boxShadow: "0 -30px 60px rgba(0,0,0,0.5)" };
  return <AbsoluteFill style={css}>{children}</AbsoluteFill>;
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

/** "Classic" subtitles: the whole line for the current moment, with a small "pop" when it changes. */
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

function Progress({ accent, frames }: { accent: string; frames: number }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 10,
        width: `${(frame / Math.max(1, frames - 1)) * 100}%`,
        background: accent,
      }}
    />
  );
}
