/**
 * NEWS GRAPHICS for Nepal News & Politics videos (Style V2).
 *
 * Stock sites have no pictures of politicians, meetings or headlines, so these are drawn by code:
 *   headline  a real headline as a newspaper clipping (paper name + date)
 *   quote     words a person really said (only when the research has the quote)
 *   timeline  2-4 dates on a line that draws itself
 *   trip      city -> city with the two flags and a dashed flight path
 *   flags     the countries involved, gently waving
 *   photo     a free Wikimedia Commons photo of a public person, with the photo credit
 *
 * Each card slides in, stays while its line is spoken, then fades out.
 */
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { V2NewsCard } from "../v2types";
import { LOGO } from "./Logo";
import { WORD_POP_FONT } from "./WordPop";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = '"Noto Serif", "DejaVu Serif", Georgia, serif';
const PANEL = "rgba(13,22,44,0.92)";

type Lang = "ne" | "en";

/** Slide up + fade in, fade out at the end. `frames` = how long the card shows. */
function useEnter(frames: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, mass: 0.7 } });
  const leave = interpolate(frame, [frames - 8, frames], [1, 0], clamp);
  return { frame, fps, enter, opacity: Math.min(1, enter * 1.4) * leave };
}

export function NewsCardView({ card, language, frames }: { card: V2NewsCard; language: Lang; frames: number }) {
  const { enter, opacity } = useEnter(frames);
  const body = (() => {
    switch (card.kind) {
      case "headline":
        return <Headline card={card} />;
      case "quote":
        return <Quote card={card} language={language} />;
      case "timeline":
        return <Timeline card={card} language={language} />;
      case "trip":
        return <Trip card={card} language={language} />;
      case "flags":
        return <Flags card={card} language={language} />;
      case "photo":
        return <Photo card={card} language={language} />;
    }
  })();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 420,
          left: 70,
          right: 70,
          display: "flex",
          justifyContent: "center",
          opacity,
          transform: `translateY(${(1 - enter) * 120}px) scale(${0.92 + 0.08 * enter})`,
        }}
      >
        {body}
      </div>
    </AbsoluteFill>
  );
}

/** A real headline as a newspaper clipping: paper name, red rule, big serif headline, date. */
function Headline({ card }: { card: V2NewsCard }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width: 900,
        background: "#FAF6EC",
        color: "#151515",
        padding: "34px 40px 30px",
        borderRadius: 6,
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        transform: `rotate(${-1.6 + Math.sin(frame / 40) * 0.3}deg)`,
        fontFamily: SERIF,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 30, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
        <span>{card.by || "News"}</span>
        <span style={{ fontWeight: 400, fontSize: 26, color: "#555", letterSpacing: 0.5, textTransform: "none" }}>{card.date}</span>
      </div>
      <div style={{ height: 5, background: LOGO.crimson, margin: "14px 0 20px" }} />
      <div style={{ fontSize: card.title.length > 70 ? 50 : 58, lineHeight: 1.15, fontWeight: 800 }}>{card.title}</div>
    </div>
  );
}

/** A quote: big marigold quote mark, the words, and who said them. */
function Quote({ card, language }: { card: V2NewsCard; language: Lang }) {
  return (
    <div style={{ width: 900, background: PANEL, borderLeft: `12px solid ${LOGO.marigold}`, borderRadius: 18, padding: "30px 40px 34px", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
      <div style={{ fontFamily: SERIF, fontSize: 150, lineHeight: 0.8, color: LOGO.marigold, height: 80 }}>“</div>
      <div style={{ fontFamily: WORD_POP_FONT[language], fontWeight: 700, fontSize: 54, lineHeight: 1.3, color: "white" }}>{card.title}</div>
      <div style={{ marginTop: 20, fontFamily: WORD_POP_FONT[language], fontWeight: 700, fontSize: 34, color: LOGO.marigold }}>— {card.by}</div>
      {card.date ? <div style={{ marginTop: 4, fontFamily: WORD_POP_FONT[language], fontSize: 26, color: "rgba(255,255,255,0.7)" }}>{card.date}</div> : null}
    </div>
  );
}

/** A timeline that draws itself from left to right; each date pops in when the line reaches it. */
function Timeline({ card, language }: { card: V2NewsCard; language: Lang }) {
  const frame = useCurrentFrame();
  const n = card.points.length;
  const draw = interpolate(frame, [6, 6 + 14 * n], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const width = 820;
  const inset = 110; // first and last dates sit inside the card, so their labels are never cut
  return (
    <div style={{ width: 920, background: PANEL, borderRadius: 18, padding: "28px 50px 36px", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
      {card.title ? <div style={{ fontFamily: WORD_POP_FONT[language], fontWeight: 800, fontSize: 40, color: LOGO.marigold, marginBottom: 26, textTransform: language === "en" ? "uppercase" : undefined }}>{card.title}</div> : null}
      <div style={{ position: "relative", height: 190, width }}>
        <div style={{ position: "absolute", top: 60, left: inset, height: 8, borderRadius: 4, width: (width - 2 * inset) * draw, background: LOGO.marigold }} />
        {card.points.map((p, i) => {
          const x = n === 1 ? width / 2 : inset + ((width - 2 * inset) * i) / (n - 1);
          const at = i / Math.max(1, n - 1);
          const pop = interpolate(draw, [at - 0.05, at + 0.05], [0, 1], clamp);
          return (
            <div key={i} style={{ position: "absolute", left: x, top: 0, transform: `translateX(-50%) scale(${0.6 + 0.4 * pop})`, opacity: pop, textAlign: "center", width: 220 }}>
              <div style={{ fontFamily: WORD_POP_FONT.en, fontWeight: 800, fontSize: 40, color: "white", height: 46 }}>{p.when}</div>
              <div style={{ margin: "4px auto 0", width: 30, height: 30, borderRadius: 15, background: LOGO.crimson, border: "5px solid white" }} />
              <div style={{ marginTop: 14, fontFamily: WORD_POP_FONT[language], fontWeight: 700, fontSize: 32, lineHeight: 1.2, color: "rgba(255,255,255,0.92)" }}>{p.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A flag that waves a little (a soft skew and a moving shine). */
function Flag({ src, size, phase = 0 }: { src: string; size: number; phase?: number }) {
  const frame = useCurrentFrame();
  const wave = Math.sin(frame / 9 + phase);
  return (
    <div style={{ position: "relative", width: size, height: size * 0.75, display: "flex", alignItems: "center", justifyContent: "center", transform: `skewY(${wave * 2}deg) rotate(${wave * 1.2}deg)` }}>
      <Img src={src} style={{ maxWidth: "100%", maxHeight: "100%", filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))" }} />
    </div>
  );
}

/** City -> city: two flags, a dashed flight path that draws itself, and a little plane dot. */
function Trip({ card, language }: { card: V2NewsCard; language: Lang }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [8, 38], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const w = 760;
  // Quadratic curve from (0, 150) to (w, 150) through (w/2, 0).
  const point = (t: number) => ({ x: w * t, y: 150 - 4 * 120 * t * (1 - t) });
  const dot = point(p);
  const path = Array.from({ length: 41 }, (_, i) => point((i / 40) * p))
    .map((pt, i) => `${i ? "L" : "M"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(" ");
  return (
    <div style={{ width: 920, background: PANEL, borderRadius: 18, padding: "28px 40px 34px", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", textAlign: "center" }}>
      <div style={{ fontFamily: WORD_POP_FONT[language], fontWeight: 800, fontSize: 40, color: LOGO.marigold, textTransform: language === "en" ? "uppercase" : undefined }}>{card.title}</div>
      {card.date ? <div style={{ fontFamily: WORD_POP_FONT[language], fontSize: 30, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{card.date}</div> : null}
      <div style={{ position: "relative", width: w, height: 300, margin: "20px auto 0" }}>
        <svg width={w} height={190} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
          <path d={path} fill="none" stroke="white" strokeWidth={6} strokeDasharray="18 14" strokeLinecap="round" />
          <circle cx={dot.x} cy={dot.y} r={14} fill={LOGO.marigold} stroke="white" strokeWidth={4} />
        </svg>
        {[
          { x: 0, name: card.from, flag: card.flags[0] },
          { x: w, name: card.to, flag: card.flags[1] },
        ].map((c, i) => (
          <div key={i} style={{ position: "absolute", left: c.x, top: 110, transform: "translateX(-50%)", width: 300, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {c.flag ? <Flag src={c.flag} size={140} phase={i * 2} /> : <div style={{ width: 40, height: 40, borderRadius: 20, background: LOGO.crimson, border: "6px solid white", marginTop: 30 }} />}
            <div style={{ marginTop: 6, fontFamily: WORD_POP_FONT[language], fontWeight: 800, fontSize: 40, color: "white" }}>{c.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The countries involved: their flags side by side, waving, with a label. */
function Flags({ card, language }: { card: V2NewsCard; language: Lang }) {
  const size = card.flags.length > 2 ? 230 : 320;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <div style={{ display: "flex", gap: 50, alignItems: "center" }}>
        {card.flags.map((f, i) => <Flag key={i} src={f} size={size} phase={i * 1.7} />)}
      </div>
      {card.title ? (
        <div style={{ background: PANEL, borderRadius: 999, padding: "10px 34px 6px", fontFamily: WORD_POP_FONT[language], fontWeight: 800, fontSize: 44, color: "white", border: `3px solid ${LOGO.marigold}` }}>
          {card.title}
        </div>
      ) : null}
    </div>
  );
}

/** A photo of a public person (Wikimedia Commons), name, role and the photo credit. */
function Photo({ card, language }: { card: V2NewsCard; language: Lang }) {
  const frame = useCurrentFrame();
  if (!card.photo) return null;
  const zoom = 1 + frame * 0.0012;
  return (
    <div style={{ width: 600, background: PANEL, borderRadius: 22, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.55)", border: `5px solid ${LOGO.marigold}` }}>
      <div style={{ width: "100%", height: 560, overflow: "hidden", position: "relative" }}>
        <Img src={card.photo.src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 22%", transform: `scale(${zoom})` }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "6px 12px", background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.9)", fontFamily: WORD_POP_FONT.en, fontSize: 18, lineHeight: 1.25 }}>
          {card.photo.credit}
        </div>
      </div>
      <div style={{ padding: "16px 24px 20px", textAlign: "center" }}>
        <div style={{ fontFamily: WORD_POP_FONT[language], fontWeight: 800, fontSize: 46, color: "white", lineHeight: 1.15 }}>{card.by}</div>
        {card.title ? <div style={{ fontFamily: WORD_POP_FONT[language], fontWeight: 600, fontSize: 32, color: LOGO.marigold, marginTop: 4 }}>{card.title}</div> : null}
      </div>
    </div>
  );
}
