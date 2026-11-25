/**
 * STYLE V2 (sample only, the real pipeline still uses Video.tsx).
 *
 * What is different from the current video, and why:
 *   1. NO logo intro. Frame 1 already shows the hook text on a strong picture and the voice
 *      starts at once. (Most viewers decide in the first 1-3 seconds whether to swipe away.)
 *   2. Hook text SLAMS in with a "hit" sound and a tiny camera shake, then shrinks into a
 *      topic chip at the top, so people who join late still know what the video is about.
 *   3. Fast "whip" transitions with motion blur and a whoosh on every picture change.
 *   4. Key words get a marigold sticker box + a quick camera "punch" zoom + a pop sound.
 *   5. Number cards: big numbers count up on screen (with a ding).
 *   6. Quiet code-made music under the voice; it ducks (gets quieter) while the voice talks.
 *   7. A small "follow for part 2" pill in the MIDDLE, not a like/follow card at the end:
 *      the end flows straight back into the start, so the video loops.
 */
import { useMemo } from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS } from "../types";
import { plain, type V2Card, type V2Props } from "../v2types";
import { Background, Brand, HEADLINE_FONT, useFonts } from "./common";
import { LOGO } from "./Logo";
import { WORD_POP_FONT, buildPages } from "./WordPop";

const ms = (t: number) => Math.round((t / 1000) * FPS);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const WHIP = 7; // frames of a whip transition
const HOOK_HOLD = 2.6; // seconds the big hook text stays before it shrinks into the topic chip


export function VideoV2(props: V2Props) {
  useFonts();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const emphasis = useMemo(() => new Set(props.emphasis.map(plain)), [props.emphasis]);

  // Camera punch: a quick zoom-in each time a key word starts, easing back out.
  const punchFrames = useMemo(
    () => props.words.filter((w) => emphasis.has(plain(w.text))).map((w) => ms(w.startMs)),
    [props.words, emphasis],
  );
  const lastPunch = punchFrames.filter((f) => f <= frame).at(-1);
  const punch = lastPunch == null ? 0 : interpolate(frame - lastPunch, [0, 3, 14], [0, 1, 0], { ...clamp, easing: Easing.out(Easing.quad) });

  // Hook shake on the first frames.
  const shake = frame < 8 ? Math.sin(frame * 2.3) * (8 - frame) * 1.6 : 0;

  // Last frames: a quick flash, so the loop back to frame 1 feels like a cut, not an end.
  const endFlash = interpolate(frame, [durationInFrames - 6, durationInFrames - 1], [0, 0.85], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill style={{ transform: `scale(${1 + 0.07 * punch}) translate(${shake}px, ${shake * 0.6}px)` }}>
        {props.shots.map((shot, i) => {
          const from = i === 0 ? 0 : Math.max(0, ms(shot.startMs) - Math.round(WHIP / 2));
          const to = i === props.shots.length - 1 ? durationInFrames : ms(props.shots[i + 1]!.startMs) + WHIP;
          const length = Math.max(1, to - from);
          return (
            <Sequence key={i} from={from} durationInFrames={length}>
              <Whip index={i}>
                <AbsoluteFill style={{ filter: "saturate(1.18) contrast(1.06)" }}>
                  <Background media={shot.media} index={i} frames={length} />
                </AbsoluteFill>
              </Whip>
            </Sequence>
          );
        })}
      </AbsoluteFill>

      {/* Darker top and bottom + a soft vignette: text pops, eyes go to the middle. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.45) 100%), linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <Brand name={props.brand} tag={props.brandTag} scale={0.95} opacity={0.88} />
      <Hook props={props} />
      {props.cards.map((card, i) => (
        <Sequence key={i} from={ms(card.startMs)} durationInFrames={Math.max(1, ms(card.endMs - card.startMs))}>
          <NumberCard card={card} language={props.language} frames={Math.max(1, ms(card.endMs - card.startMs))} />
        </Sequence>
      ))}
      <Captions props={props} emphasis={emphasis} />
      {props.follow ? (
        <Sequence from={ms(props.follow.atMs)} durationInFrames={ms(2600)}>
          <FollowPill text={props.follow.text} language={props.language} />
        </Sequence>
      ) : null}

      <AbsoluteFill style={{ background: "white", opacity: endFlash }} />

      {/* Sound: voice, music bed (ducked under the voice), and the effects. */}
      <Audio src={props.audioFile} />
      {props.musicFile ? <Music props={props} /> : null}
      {props.sfx.map((s, i) => (
        <Sequence key={i} from={Math.max(0, ms(s.atMs))} durationInFrames={ms(1600)}>
          <Audio src={s.src} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/** Whip transition: the new picture flies in sideways with motion blur. Directions take turns. */
function Whip({ index, children }: { index: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  if (index === 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  const p = interpolate(frame, [0, WHIP], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const dir = index % 2 === 0 ? -1 : 1;
  const vertical = index % 3 === 0;
  const off = (1 - p) * 100 * dir;
  return (
    <AbsoluteFill
      style={{
        transform: vertical ? `translateY(${off}%)` : `translateX(${off}%)`,
        filter: `blur(${(1 - p) * 18}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** The hook: big text on frame 1 that slams in, then shrinks into a topic chip at the top. */
function Hook({ props }: { props: V2Props }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const font = HEADLINE_FONT[props.language];
  const slam = spring({ frame, fps, config: { damping: 11, mass: 0.6, stiffness: 180 } });
  // 0 = big hook, 1 = small topic chip.
  const shrink = interpolate(frame, [fps * HOOK_HOLD, fps * HOOK_HOLD + 9], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const big = props.language === "en" ? 150 : 140;

  if (shrink < 1) {
    return (
      <div
        style={{
          position: "absolute",
          top: 330,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `translateY(${-220 * shrink}px) scale(${(1.25 - 0.25 * slam) * (1 - 0.7 * shrink)})`,
          opacity: 1 - shrink,
        }}
      >
        {props.hook.lines.map((line, i) => {
          const gold = i === props.hook.highlight;
          return (
            <div key={i} style={{ marginBottom: 10 }}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: font,
                  fontWeight: props.language === "en" ? 400 : 700,
                  fontSize: big * (gold ? 1 : 0.78),
                  lineHeight: props.language === "en" ? 1.02 : 1.15,
                  letterSpacing: props.language === "en" ? 1 : 0,
                  textTransform: props.language === "en" ? "uppercase" : undefined,
                  color: gold ? "#13203F" : "white",
                  background: gold ? LOGO.marigold : "transparent",
                  padding: gold ? "2px 28px 0" : 0,
                  borderRadius: 18,
                  transform: gold ? "rotate(-2deg)" : undefined,
                  WebkitTextStroke: gold ? undefined : "10px black",
                  paintOrder: "stroke fill",
                  textShadow: gold ? undefined : "0 8px 0 rgba(0,0,0,0.85)",
                  boxShadow: gold ? "0 12px 0 rgba(0,0,0,0.55)" : undefined,
                }}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Topic chip, pinned top-centre for the rest of the video.
  const chipIn = spring({ frame: frame - Math.round(fps * HOOK_HOLD + 6), fps, config: { damping: 14 } });
  return (
    <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: chipIn }}>
      <div
        style={{
          transform: `scale(${0.7 + 0.3 * chipIn})`,
          fontFamily: font,
          fontWeight: props.language === "en" ? 400 : 700,
          fontSize: 50,
          lineHeight: 1.2,
          letterSpacing: props.language === "en" ? 1 : 0,
          textTransform: props.language === "en" ? "uppercase" : undefined,
          padding: "10px 30px 6px",
          borderRadius: 999,
          background: "rgba(19,32,63,0.82)",
          border: `3px solid ${LOGO.marigold}`,
          color: "white",
          boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
        }}
      >
        {props.topic}
      </div>
    </div>
  );
}

/** Captions: 1-3 words at a time. Key words become a marigold sticker; the spoken word glows yellow. */
function Captions({ props, emphasis }: { props: V2Props; emphasis: Set<string> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => buildPages(props.words), [props.words]);
  const nowMs = (frame / fps) * 1000;
  const page = pages.find((p, i) => {
    const next = pages[i + 1];
    const until = next ? Math.min(next.startMs - 40, p.endMs + 400) : p.endMs + 400;
    return nowMs >= p.startMs - 80 && nowMs < until;
  });
  if (!page) return null;
  const enter = spring({ frame: frame - ms(page.startMs - 80), fps, config: { damping: 12, mass: 0.45 } });
  const size = props.language === "ne" ? 100 : 92;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: "60%",
        textAlign: "center",
        transform: `translateY(${(1 - enter) * 40}px) scale(${0.8 + 0.2 * enter})`,
        opacity: Math.min(1, enter * 1.6),
        fontFamily: WORD_POP_FONT[props.language],
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.3,
        textTransform: props.language === "en" ? "uppercase" : undefined,
      }}
    >
      {page.words.map((w, i) => {
        const next = page.words[i + 1];
        const said = nowMs >= w.startMs;
        const active = said && nowMs < (next ? next.startMs : w.endMs + 200);
        const key = emphasis.has(plain(w.text));
        const pop = said ? spring({ frame: frame - ms(w.startMs), fps, config: { damping: 9, mass: 0.45 } }) : 0;
        if (key) {
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "6px 12px",
                padding: "0 22px",
                borderRadius: 16,
                background: said ? LOGO.marigold : "rgba(255,255,255,0.15)",
                color: said ? "#13203F" : "white",
                fontSize: size * 1.12,
                transform: `scale(${0.9 + 0.22 * pop - (said ? 0.12 * Math.max(0, pop - 1) : 0)}) rotate(${-3 * pop}deg)`,
                boxShadow: said ? "0 10px 0 rgba(0,0,0,0.6)" : undefined,
              }}
            >
              {w.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              margin: "0 12px",
              color: active ? "#FFE14D" : "white",
              opacity: said ? 1 : 0.55,
              transform: `scale(${1 + 0.12 * (active ? pop : 0)})`,
              WebkitTextStroke: "12px black",
              paintOrder: "stroke fill",
              textShadow: "0 8px 0 rgba(0,0,0,0.9)",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
}

/** Big number card: the number counts up, the label slides in under it. */
function NumberCard({ card, language, frames }: { card: V2Card; language: "ne" | "en"; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame, fps, config: { damping: 11, mass: 0.6 } });
  const out = interpolate(frame, [frames - 7, frames], [1, 0], clamp);
  // Count up any number inside "big" (e.g. "1 / 193" counts the 193).
  const count = interpolate(frame, [2, 20], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const shown = card.big.replace(/[0-9]+/g, (n) => (Number(n) > 9 ? String(Math.round(Number(n) * count)) : n));
  const font = HEADLINE_FONT[language];
  return (
    <div style={{ position: "absolute", top: 420, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: out }}>
      <div
        style={{
          transform: `scale(${0.4 + 0.6 * inn}) rotate(${(1 - inn) * -8}deg)`,
          padding: "26px 60px 30px",
          borderRadius: 36,
          background: "rgba(10,16,34,0.78)",
          border: `5px solid ${LOGO.marigold}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.55), 0 0 60px ${LOGO.crimson}55`,
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: font, fontSize: 210, lineHeight: 1, color: LOGO.marigold, fontWeight: language === "en" ? 400 : 700 }}>
          {shown}
        </div>
        <div
          style={{
            fontFamily: font,
            fontSize: 64,
            color: "white",
            fontWeight: language === "en" ? 400 : 700,
            textTransform: language === "en" ? "uppercase" : undefined,
            letterSpacing: language === "en" ? 2 : 0,
            marginTop: 6,
            transform: `translateY(${(1 - inn) * 30}px)`,
          }}
        >
          {card.small}
        </div>
      </div>
    </div>
  );
}

/** "Follow for part 2" pill: slides in, wiggles once, slides out. */
function FollowPill({ text, language }: { text: string; language: "ne" | "en" }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inn = spring({ frame, fps, config: { damping: 13 } });
  const out = interpolate(frame, [ms(2600) - 8, ms(2600)], [0, 1], clamp);
  const wiggle = frame > 18 && frame < 34 ? Math.sin((frame - 18) * 0.9) * 4 : 0;
  void durationInFrames;
  return (
    <div style={{ position: "absolute", top: 1040, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          transform: `translateX(${(1 - inn) * -700 + out * 700}px) rotate(${wiggle}deg)`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 34px 14px 18px",
          borderRadius: 999,
          background: LOGO.crimson,
          color: "white",
          fontFamily: WORD_POP_FONT[language],
          fontWeight: 800,
          fontSize: 46,
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        }}
      >
        <span
          style={{
            width: 58,
            height: 58,
            borderRadius: 999,
            background: "white",
            color: LOGO.crimson,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 50,
            lineHeight: 1,
          }}
        >
          +
        </span>
        {text}
      </div>
    </div>
  );
}

/** Music bed: quiet, and quieter still while the voice talks (smooth "ducking"). */
function Music({ props }: { props: V2Props }) {
  const talking = useMemo(() => {
    const frames = Math.ceil(((props.durationMs + 300) / 1000) * FPS) + 2;
    const on = new Float32Array(frames);
    for (const w of props.words) for (let f = ms(w.startMs - 120); f <= ms(w.endMs + 250); f++) if (f >= 0 && f < frames) on[f] = 1;
    // Smooth it (about 0.2 s), so the music glides down and up instead of jumping.
    const smooth = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      let n = 0;
      for (let k = -6; k <= 6; k++) if (f + k >= 0 && f + k < frames) (sum += on[f + k]!), n++;
      smooth[f] = sum / n;
    }
    return smooth;
  }, [props.words, props.durationMs]);
  return (
    <Audio
      src={props.musicFile!}
      volume={(f) => {
        const t = talking[Math.min(talking.length - 1, f)] ?? 0;
        return props.musicVolume * (1 - 0.6 * t);
      }}
    />
  );
}
