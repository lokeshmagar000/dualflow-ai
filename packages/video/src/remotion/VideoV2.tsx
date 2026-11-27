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
 *   5. Cards (with a ding): numbers count up, years roll like a meter, dates flip like a
 *      desk calendar, times turn the hands of a clock. Cards, stickers, the topic chip and
 *      the follow pill all keep moving a little (nothing on screen is ever frozen).
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
import { NewsCardView } from "./NewsV2";

const ms = (t: number) => Math.round((t / 1000) * FPS);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const WHIP = 7; // frames of a whip transition
const HOOK_HOLD = 2.6; // seconds the big hook text stays before it shrinks into the topic chip

/**
 * Where things go on screen. Shorts are tall (1080x1920); the FULL VIDEO is wide (1920x1080),
 * so there everything sits higher, a bit smaller, and the captions have more room left and right.
 */
export function useLayout() {
  const { width, height } = useVideoConfig();
  const wide = width > height;
  return wide
    ? { wide, hookTop: 230, hookScale: 0.85, hookRise: 180, chipTop: 46, chipSize: 44, sourceTop: 126, capTop: "72%", capSide: 220, capScale: 0.8, cardTop: 190, cardScale: 0.74, followTop: 560, brandScale: 0.85 }
    : { wide, hookTop: 330, hookScale: 1, hookRise: 220, chipTop: 150, chipSize: 50, sourceTop: 250, capTop: "60%", capSide: 60, capScale: 1, cardTop: 400, cardScale: 1, followTop: 1040, brandScale: 0.95 };
}


export function VideoV2(props: V2Props) {
  useFonts();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const layout = useLayout();
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
  // (A full video does not loop: no flash.)
  const endFlash = layout.wide ? 0 : interpolate(frame, [durationInFrames - 6, durationInFrames - 1], [0, 0.85], clamp);

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

      <Brand name={props.brand} tag={props.brandTag} scale={layout.brandScale} opacity={0.88} />
      <Hook props={props} />
      <SourceRow props={props} />
      {props.cards.map((card, i) => (
        <Sequence key={i} from={ms(card.startMs)} durationInFrames={Math.max(1, ms(card.endMs - card.startMs))}>
          <Card card={card} language={props.language} frames={Math.max(1, ms(card.endMs - card.startMs))} />
        </Sequence>
      ))}
      {(props.news?.cards ?? []).map((card, i) => (
        <Sequence key={`n${i}`} from={ms(card.startMs)} durationInFrames={Math.max(1, ms(card.endMs - card.startMs))}>
          <NewsCardView card={card} language={props.language} frames={Math.max(1, ms(card.endMs - card.startMs))} />
        </Sequence>
      ))}
      {(props.chapters ?? []).map((c, i) => (
        <Sequence key={`c${i}`} from={ms(c.startMs)} durationInFrames={ms(3200)}>
          <ChapterTitle chapter={c} language={props.language} />
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
  const layout = useLayout();
  const big = (props.language === "en" ? 150 : 140) * layout.hookScale;

  if (shrink < 1) {
    return (
      <div
        style={{
          position: "absolute",
          top: layout.hookTop,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `translateY(${-layout.hookRise * shrink}px) scale(${(1.25 - 0.25 * slam) * (1 - 0.7 * shrink)})`,
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
    <div style={{ position: "absolute", top: layout.chipTop, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: chipIn }}>
      <div
        style={{
          transform: `scale(${0.7 + 0.3 * chipIn}) translateY(${Math.sin(frame / 20) * 4}px) rotate(${Math.sin(frame / 31) * 0.8}deg)`,
          fontFamily: font,
          fontWeight: props.language === "en" ? 400 : 700,
          fontSize: layout.chipSize,
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

/**
 * Politics videos: a small row under the topic chip with the series label (red pill)
 * and the sources ("Source: Election Commission Nepal · The Kathmandu Post").
 * Shows after the hook, for the rest of the video. Nothing when both are empty.
 */
function SourceRow({ props }: { props: V2Props }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();
  const label = props.news?.label || props.series;
  if (!props.source && !label) return null;
  const appear = interpolate(frame, [fps * HOOK_HOLD + 10, fps * HOOK_HOLD + 22], [0, 1], clamp);
  const font = props.language === "ne" ? WORD_POP_FONT.ne : "Inter, Arial, sans-serif";
  const pill = { padding: "5px 14px 3px", borderRadius: 8, whiteSpace: "nowrap" } as const;
  return (
    <div
      style={{
        position: "absolute",
        top: layout.sourceTop,
        left: 50,
        right: 50,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        opacity: appear,
        fontFamily: font,
        fontSize: 28,
        lineHeight: 1.2,
      }}
    >
      {label ? (
        // News look: a red label (with a blinking "live" dot) and the date, like a TV news bar.
        <span style={{ ...pill, background: LOGO.crimson, color: "white", fontWeight: 800, letterSpacing: 0.5, display: "inline-flex", alignItems: "center", gap: 10 }}>
          {props.news ? <span style={{ width: 12, height: 12, borderRadius: 6, background: "white", opacity: 0.55 + 0.45 * Math.sin(frame / 5) }} /> : null}
          {label}
        </span>
      ) : null}
      {props.news?.date ? <span style={{ ...pill, background: "white", color: "#13203F", fontWeight: 800 }}>{props.news.date}</span> : null}
      {props.source ? (
        <span style={{ color: "rgba(255,255,255,0.92)", background: "rgba(0,0,0,0.5)", padding: "5px 14px 3px", borderRadius: 8, fontWeight: 600, textAlign: "center", maxWidth: 820 }}>
          {props.source}
        </span>
      ) : null}
    </div>
  );
}

/** Captions: 1-3 words at a time. Key words become a marigold sticker; the spoken word glows yellow. */
function Captions({ props, emphasis }: { props: V2Props; emphasis: Set<string> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();
  const pages = useMemo(() => buildPages(props.words), [props.words]);
  const nowMs = (frame / fps) * 1000;
  const page = pages.find((p, i) => {
    const next = pages[i + 1];
    const until = next ? Math.min(next.startMs - 40, p.endMs + 400) : p.endMs + 400;
    return nowMs >= p.startMs - 80 && nowMs < until;
  });
  if (!page) return null;
  const enter = spring({ frame: frame - ms(page.startMs - 80), fps, config: { damping: 12, mass: 0.45 } });
  const size = (props.language === "ne" ? 100 : 92) * layout.capScale;
  return (
    <div
      style={{
        position: "absolute",
        left: layout.capSide,
        right: layout.capSide,
        top: layout.capTop,
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
                transform: `scale(${0.9 + 0.22 * pop - (said ? 0.12 * Math.max(0, pop - 1) : 0) + (said ? 0.025 * Math.sin(frame / 4) : 0)}) rotate(${-3 * pop + (said ? 2 * Math.sin(frame / 6) : 0)}deg)`,
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

/* ---------- Animated cards ---------- */

const DEVA = "०१२३४५६७८९";
/** "२०१९" -> "2019" (so we can count with it). */
const toAscii = (t: string) => t.replace(/[०-९]/g, (d) => String(DEVA.indexOf(d)));
/** Show digits in the same script the script writer used. */
const digitsLike = (sample: string, t: string) => (/[०-९]/.test(sample) ? t.replace(/[0-9]/g, (d) => DEVA[Number(d)]!) : t);

/** Khand draws Nepali digits (१९६२) like English ones, so Nepali digits use Baloo 2. */
const numFont = (language: "ne" | "en", sample: string) =>
  /[०-९]/.test(sample) ? '"Baloo 2", "Noto Sans Devanagari", sans-serif' : HEADLINE_FONT[language];

/** The box every card sits in: springs in with a little turn, floats gently, fades out. */
function CardShell({ frames, children, small, language }: { frames: number; children: React.ReactNode; small: string; language: "ne" | "en" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame, fps, config: { damping: 11, mass: 0.6 } });
  const out = interpolate(frame, [frames - 7, frames], [1, 0], clamp);
  const float = Math.sin(frame / 11) * 8; // idle: never stands still
  const font = HEADLINE_FONT[language];
  const layout = useLayout();
  return (
    <div style={{ position: "absolute", top: layout.cardTop, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: out }}>
      <div
        style={{
          transformOrigin: "50% 0",
          transform: `translateY(${float}px) scale(${layout.cardScale * (0.4 + 0.6 * inn) * (1 - 0.15 * (1 - out))}) rotate(${(1 - inn) * -8 + Math.sin(frame / 17) * 0.8}deg)`,
          padding: "26px 56px 30px",
          borderRadius: 36,
          background: "rgba(10,16,34,0.8)",
          border: `5px solid ${LOGO.marigold}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.55), 0 0 60px ${LOGO.crimson}55`,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {children}
        {small ? (
          <div
            style={{
              fontFamily: font,
              fontSize: 60,
              color: "white",
              fontWeight: language === "en" ? 400 : 700,
              textTransform: language === "en" ? "uppercase" : undefined,
              letterSpacing: language === "en" ? 2 : 0,
              marginTop: 10,
              opacity: interpolate(frame, [6, 14], [0, 1], clamp),
              transform: `translateY(${(1 - inn) * 30}px)`,
            }}
          >
            {small}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Pick the right animation for the card. Anything we cannot read falls back to the count-up. */
function Card({ card, language, frames }: { card: V2Card; language: "ne" | "en"; frames: number }) {
  const kind = card.kind ?? "number";
  let body: React.ReactNode = null;
  if (kind === "time") body = <ClockFace big={card.big} language={language} />;
  if (kind === "date") body = <CalendarFlip big={card.big} language={language} />;
  if (kind === "year") body = <YearRoll big={card.big} language={language} />;
  return (
    <CardShell frames={frames} small={card.small} language={language}>
      {body ?? <CountUp big={card.big} language={language} />}
    </CardShell>
  );
}

/** NUMBER: every number in the text counts up from 0 ("8849" -> 0, 1203 ... 8849). */
function CountUp({ big, language }: { big: string; language: "ne" | "en" }) {
  const frame = useCurrentFrame();
  const count = interpolate(frame, [2, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const shown = toAscii(big).replace(/[0-9][0-9,]*/g, (raw) => {
    const n = Number(raw.replace(/,/g, ""));
    if (!(n > 9)) return raw;
    const v = Math.round(n * count);
    return raw.includes(",") ? v.toLocaleString("en-US") : String(v);
  });
  return (
    <div style={{ fontFamily: numFont(language, big), fontSize: 200, lineHeight: 1, color: LOGO.marigold, fontWeight: language === "en" ? 400 : 700 }}>
      {digitsLike(big, shown)}
    </div>
  );
}

/** One rolling digit, like the distance meter in a car. */
function RollDigit({ digit, delay, spins, size, sample }: { digit: number; delay: number; spins: number; size: number; sample: string }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 22], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.9, 0.25, 1.06) });
  const pos = p * (spins * 10 + digit); // how many digits have rolled past
  const strip = Array.from({ length: spins * 10 + digit + 2 }, (_, i) => i % 10);
  return (
    <span style={{ display: "inline-block", height: size, overflow: "hidden", verticalAlign: "top" }}>
      <span style={{ display: "flex", flexDirection: "column", transform: `translateY(${-pos * size}px)`, filter: `blur(${Math.min(6, Math.abs(1 - p) * 10)}px)` }}>
        {strip.map((d, i) => (
          <span key={i} style={{ height: size, lineHeight: `${size}px` }}>
            {digitsLike(sample, String(d))}
          </span>
        ))}
      </span>
    </span>
  );
}

/** YEAR: the four digits roll into place one after the other. */
function YearRoll({ big, language }: { big: string; language: "ne" | "en" }) {
  const m = toAscii(big).match(/\d{3,4}/);
  if (!m) return null;
  const size = 210;
  const [before, after] = [toAscii(big).slice(0, m.index), toAscii(big).slice(m.index! + m[0].length)];
  return (
    <div style={{ fontFamily: numFont(language, big), fontSize: size * 0.95, color: LOGO.marigold, fontWeight: language === "en" ? 400 : 700, display: "flex", alignItems: "flex-start" }}>
      {before.trim() ? <span style={{ lineHeight: `${size}px`, marginRight: 20, fontSize: size * 0.4 }}>{before.trim()}</span> : null}
      {m[0].split("").map((d, i) => (
        <RollDigit key={i} digit={Number(d)} delay={2 + i * 4} spins={1 + i} size={size} sample={big} />
      ))}
      {after.trim() ? <span style={{ lineHeight: `${size}px`, marginLeft: 20, fontSize: size * 0.4 }}>{after.trim()}</span> : null}
    </div>
  );
}

/** Read "16 December 1962", "December 16, 1962", "१६ पुस २०१९" into day / month / year. */
export function parseDate(big: string): { day: number; month: string; year: string } | null {
  const t = toAscii(big).replace(/,/g, " ");
  const nums = [...t.matchAll(/\d+/g)].map((x) => x[0]);
  const day = nums.find((n) => n.length <= 2 && Number(n) >= 1 && Number(n) <= 32);
  const year = nums.find((n) => n.length === 4) ?? "";
  const month = t.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  if (!day || !month) return null;
  return { day: Number(day), month, year };
}

/** DATE: a desk calendar. Pages tear off and flip down, day after day, until the right date. */
function CalendarFlip({ big, language }: { big: string; language: "ne" | "en" }) {
  const frame = useCurrentFrame();
  const d = parseDate(big);
  if (!d) return null;
  const font = HEADLINE_FONT[language];
  const pages = Math.min(6, d.day - 1); // how many pages flip before the right day
  const per = 4; // frames per page flip
  const step = Math.min(pages, Math.max(0, (frame - 4) / per));
  const current = Math.floor(step); // pages already gone
  const flipP = step - current; // 0..1 of the page flipping now
  const dayAt = (k: number) => d.day - pages + k;
  const settle = spring({ frame: frame - (4 + pages * per), fps: FPS, config: { damping: 8, mass: 0.5 } });
  const W = 380;
  const pageStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "white",
    color: "#13203F",
    fontFamily: numFont(language, big),
    fontSize: 190,
    fontWeight: language === "en" ? 400 : 700,
    borderRadius: "0 0 24px 24px",
    backfaceVisibility: "hidden",
  };
  const num = (k: number) => digitsLike(big, String(dayAt(k)));
  return (
    <div style={{ width: W, display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${1 + 0.06 * Math.sin(settle * Math.PI)})` }}>
      {/* Red header with the month, two rings on top */}
      <div style={{ position: "relative", width: W, background: LOGO.crimson, borderRadius: "24px 24px 0 0", padding: "18px 0 10px", color: "white", fontFamily: font, fontSize: 58, textTransform: language === "en" ? "uppercase" : undefined, fontWeight: language === "en" ? 400 : 700 }}>
        {[0.27, 0.73].map((x) => (
          <span key={x} style={{ position: "absolute", top: -18, left: `${x * 100}%`, width: 22, height: 40, marginLeft: -11, borderRadius: 12, background: "#d8d8d8", border: "4px solid #555" }} />
        ))}
        {d.month}
      </div>
      {/* Pages: the next day waits underneath, the current page flips down over the bottom edge */}
      <div style={{ position: "relative", width: W, height: 250, perspective: 900 }}>
        <div style={pageStyle}>{num(Math.min(pages, current + 1))}</div>
        {current < pages ? (
          <div style={{ ...pageStyle, transformOrigin: "50% 100%", transform: `rotateX(${-flipP * 100}deg)`, filter: `brightness(${1 - 0.35 * flipP})` }}>{num(current)}</div>
        ) : null}
      </div>
      {d.year ? (
        <div style={{ marginTop: 12, fontFamily: numFont(language, big), fontSize: 80, color: LOGO.marigold, display: "flex", fontWeight: language === "en" ? 400 : 700, opacity: interpolate(frame, [pages * per, 4 + pages * per], [0, 1], clamp) }}>
          {d.year.split("").map((n, i) => (
            <RollDigit key={i} digit={Number(n)} delay={4 + pages * per + i * 3} spins={1} size={92} sample={big} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Read "10:30", "4:05 PM", "१०:३०" into hours and minutes. */
export function parseTime(big: string): { h: number; m: number } | null {
  const t = toAscii(big);
  const x = t.match(/(\d{1,2})[:.](\d{2})/);
  if (!x) return null;
  let h = Number(x[1]);
  if (/pm/i.test(t) && h < 12) h += 12;
  if (/am/i.test(t) && h === 12) h = 0;
  return { h, m: Number(x[2]) };
}

/** TIME: a clock. The hands spin from 12:00 to the time, then the digital time types under it. */
function ClockFace({ big, language }: { big: string; language: "ne" | "en" }) {
  const frame = useCurrentFrame();
  const time = parseTime(big);
  if (!time) return null;
  const p = interpolate(frame, [3, 30], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const totalMin = ((time.h % 12) * 60 + time.m) * p;
  const minuteDeg = (totalMin / 60) * 360 + 360 * p; // the minute hand also does one extra lap
  const hourDeg = (totalMin / 720) * 360;
  const tick = frame > 30 ? Math.sin((frame - 30) * 0.8) * Math.max(0, 1 - (frame - 30) / 12) * 4 : 0; // little bounce when it lands
  const R = 150;
  const shownMin = Math.round(totalMin);
  const digital = `${Math.floor(shownMin / 60) || 12}:${String(shownMin % 60).padStart(2, "0")}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={R * 2 + 20} height={R * 2 + 20} viewBox={`${-R - 10} ${-R - 10} ${R * 2 + 20} ${R * 2 + 20}`}>
        <circle r={R} fill="white" stroke={LOGO.marigold} strokeWidth={10} />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={0} y1={-R + 14} x2={0} y2={-R + (i % 3 === 0 ? 40 : 28)} stroke="#13203F" strokeWidth={i % 3 === 0 ? 8 : 4} strokeLinecap="round" transform={`rotate(${i * 30})`} />
        ))}
        <line x1={0} y1={14} x2={0} y2={-R * 0.5} stroke="#13203F" strokeWidth={14} strokeLinecap="round" transform={`rotate(${hourDeg + tick})`} />
        <line x1={0} y1={18} x2={0} y2={-R * 0.78} stroke={LOGO.crimson} strokeWidth={8} strokeLinecap="round" transform={`rotate(${minuteDeg + tick})`} />
        <circle r={12} fill={LOGO.marigold} stroke="#13203F" strokeWidth={4} />
      </svg>
      <div style={{ marginTop: 8, fontFamily: numFont(language, big), fontSize: 96, color: LOGO.marigold, fontWeight: language === "en" ? 400 : 700 }}>
        {p < 1 ? digitsLike(big, digital) : big}
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
  const wiggle = (frame > 18 && frame < 34 ? Math.sin((frame - 18) * 0.9) * 4 : 0) + Math.sin(frame / 7) * 1.2;
  void durationInFrames;
  const layout = useLayout();
  return (
    <div style={{ position: "absolute", top: layout.followTop, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          transform: `translateX(${(1 - inn) * -700 + out * 700}px) translateY(${Math.sin(frame / 9) * 5}px) scale(${1 + 0.03 * Math.sin(frame / 5)}) rotate(${wiggle}deg)`,
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

/**
 * FULL VIDEO: the chapter title slides in from the left under the channel badge when a new
 * part starts ("2 | What was signed"), stays about 3 seconds, then slides out.
 */
function ChapterTitle({ chapter, language }: { chapter: { n: number; title: string }; language: "ne" | "en" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useLayout();
  const inn = spring({ frame, fps, config: { damping: 14 } });
  const out = interpolate(frame, [ms(3200) - 10, ms(3200)], [0, 1], clamp);
  const font = HEADLINE_FONT[language];
  const num = language === "ne" ? String(chapter.n).replace(/[0-9]/g, (d) => "०१२३४५६७८९"[Number(d)]!) : String(chapter.n);
  return (
    <div
      style={{
        position: "absolute",
        top: layout.wide ? 196 : 330,
        left: layout.wide ? 40 : 50,
        display: "flex",
        alignItems: "stretch",
        transform: `translateX(${(1 - inn) * -900 - out * 900}px)`,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div style={{ background: LOGO.crimson, color: "white", fontFamily: numFont(language, num), fontWeight: 700, fontSize: 64, padding: "6px 26px 0", display: "flex", alignItems: "center" }}>{num}</div>
      <div
        style={{
          background: "rgba(13,22,44,0.92)",
          borderTop: `4px solid ${LOGO.marigold}`,
          color: "white",
          fontFamily: font,
          fontWeight: language === "en" ? 400 : 700,
          fontSize: 58,
          lineHeight: 1.15,
          letterSpacing: language === "en" ? 1.5 : 0,
          textTransform: language === "en" ? "uppercase" : undefined,
          padding: "10px 34px 6px",
          maxWidth: layout.wide ? 1100 : 860,
        }}
      >
        {chapter.title}
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
