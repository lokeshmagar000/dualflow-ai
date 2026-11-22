/**
 * The "like and follow" ending: shown while the narrator asks viewers to like and follow.
 *
 * A glass card pops in with a bouncing 👍, a ringing 🔔 and the real logos of
 * YouTube, Facebook, Instagram and TikTok popping in one after another.
 * Logo shapes: Simple Icons (CC0, simpleicons.org).
 * Emoji pictures: Twemoji by Twitter/X (CC-BY 4.0, github.com/jdecked/twemoji), drawn as
 * SVG so they look the same on every computer (emoji fonts do not draw in headless Chrome).
 */
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND_FONT } from "./common";

/** Twemoji 👍 🔔 ❤️ (36x36 box). */
const EMOJI = {
  thumb: [
    ["#FFDB5E", "M34.956 17.916c0-.503-.12-.975-.321-1.404-1.341-4.326-7.619-4.01-16.549-4.221-1.493-.035-.639-1.798-.115-5.668.341-2.517-1.282-6.382-4.01-6.382-4.498 0-.171 3.548-4.148 12.322-2.125 4.688-6.875 2.062-6.875 6.771v10.719c0 1.833.18 3.595 2.758 3.885C8.195 34.219 7.633 36 11.238 36h18.044a3.337 3.337 0 0 0 3.333-3.334c0-.762-.267-1.456-.698-2.018 1.02-.571 1.72-1.649 1.72-2.899 0-.76-.266-1.454-.696-2.015 1.023-.57 1.725-1.649 1.725-2.901 0-.909-.368-1.733-.961-2.336a3.311 3.311 0 0 0 1.251-2.581z"],
    ["#EE9547", "M23.02 21.249h8.604c1.17 0 2.268-.626 2.866-1.633a.876.876 0 0 0-1.506-.892 1.588 1.588 0 0 1-1.361.775h-8.81c-.873 0-1.583-.71-1.583-1.583s.71-1.583 1.583-1.583H28.7a.875.875 0 0 0 0-1.75h-5.888a3.337 3.337 0 0 0-3.333 3.333c0 1.025.475 1.932 1.205 2.544a3.32 3.32 0 0 0-.998 2.373c0 1.028.478 1.938 1.212 2.549a3.318 3.318 0 0 0 .419 5.08 3.305 3.305 0 0 0-.852 2.204 3.337 3.337 0 0 0 3.333 3.333h5.484a3.35 3.35 0 0 0 2.867-1.632.875.875 0 0 0-1.504-.894 1.594 1.594 0 0 1-1.363.776h-5.484c-.873 0-1.583-.71-1.583-1.583s.71-1.583 1.583-1.583h6.506a3.35 3.35 0 0 0 2.867-1.633.875.875 0 1 0-1.504-.894 1.572 1.572 0 0 1-1.363.777h-7.063a1.585 1.585 0 0 1 0-3.167h8.091a3.35 3.35 0 0 0 2.867-1.632.875.875 0 0 0-1.504-.894 1.573 1.573 0 0 1-1.363.776H23.02a1.585 1.585 0 0 1 0-3.167z"],
  ],
  bell: [
    ["#FFAC33", "M28 13c0 11 5 10 5 15 0 0 0 2-2 2H5c-2 0-2-2-2-2 0-5 5-4 5-15C8 7.478 12.477 3 18 3s10 4.478 10 10z"],
    ["#FFAC33", "M15 3a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z"],
    ["#FFAC33", "M18 36a4 4 0 0 0 4-4h-8a4 4 0 0 0 4 4z"],
  ],
  heart: [
    ["#DD2E44", "M35.885 11.833c0-5.45-4.418-9.868-9.867-9.868-3.308 0-6.227 1.633-8.018 4.129-1.791-2.496-4.71-4.129-8.017-4.129-5.45 0-9.868 4.417-9.868 9.868 0 .772.098 1.52.266 2.241C1.751 22.587 11.216 31.568 18 34.034c6.783-2.466 16.249-11.447 17.617-19.959.17-.721.268-1.469.268-2.242z"],
  ],
} as const;

function Emoji({ name, size, style }: { name: keyof typeof EMOJI; size: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} style={{ display: "block", overflow: "visible", ...style }}>
      {EMOJI[name].map(([fill, d], i) => (
        <path key={i} fill={fill} d={d} />
      ))}
    </svg>
  );
}

/** Each platform: its logo shape (24x24 box) and its official colour. */
const PLATFORMS = [
  {
    name: "YouTube",
    bg: "#FF0000",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    name: "Facebook",
    bg: "#0866FF",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
  {
    name: "Instagram",
    bg: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
    path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  },
  {
    name: "TikTok",
    bg: "#000000",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
] as const;

/** One platform logo in a rounded square, in its own colours. TikTok gets its cyan/red shadow. */
function PlatformLogo({ p, size }: { p: (typeof PLATFORMS)[number]; size: number }) {
  const tiktok = p.name === "TikTok";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: p.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 ${size * 0.08}px ${size * 0.25}px rgba(0,0,0,0.45)`,
        border: tiktok ? `${size * 0.03}px solid rgba(255,255,255,0.25)` : undefined,
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>
        {tiktok ? (
          <>
            <path d={p.path} fill="#25F4EE" transform="translate(-0.8,-0.6)" />
            <path d={p.path} fill="#FE2C55" transform="translate(0.8,0.6)" />
          </>
        ) : null}
        <path d={p.path} fill="#fff" />
      </svg>
    </div>
  );
}

const WORDS = {
  ne: { top: "लाइक र फलो गर्नुहोस्", small: "थप रोचक तथ्यका लागि" },
  en: { top: "Like & Follow", small: "for more amazing facts" },
} as const;

/**
 * `frames` = how long the card stays (it fades out at the end).
 * Sizes are designed for a 1080 px wide video; `scale` adapts them.
 */
export function FollowCard({ language, frames, scale, tall }: { language: "ne" | "en"; frames: number; scale: number; tall: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = WORDS[language];
  const pop = spring({ frame, fps, config: { damping: 13, mass: 0.7 } });
  const out = interpolate(frame, [frames - 10, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // 👍 bounces in, then gently pulses. 🔔 rings (swings left and right).
  const thumb = spring({ frame: frame - 4, fps, config: { damping: 8, mass: 0.6 } });
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2.2);
  const ring = Math.sin(frame / 2.2) * 18 * Math.max(0, 1 - ((frame - 12) % 45) / 25) * (frame > 12 ? 1 : 0);
  const logo = 120 * scale;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: tall ? "18%" : "12%",
        display: "flex",
        justifyContent: "center",
        opacity: out * Math.min(1, pop * 1.4),
        transform: `translateY(${(1 - pop) * 120 * scale}px) scale(${0.85 + 0.15 * pop})`,
      }}
    >
      <div
        style={{
          padding: `${34 * scale}px ${48 * scale}px`,
          borderRadius: 48 * scale,
          background: "rgba(15,20,40,0.62)",
          border: `${3 * scale}px solid rgba(255,255,255,0.18)`,
          backdropFilter: "blur(14px)",
          boxShadow: `0 ${20 * scale}px ${60 * scale}px rgba(0,0,0,0.5)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22 * scale,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 26 * scale }}>
          <Emoji name="thumb" size={110 * scale} style={{ transform: `scale(${thumb * pulse}) rotate(${(1 - thumb) * -30}deg)` }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 74 * scale, color: "#fff", lineHeight: 1.2 }}>{words.top}</div>
            <div style={{ fontFamily: BRAND_FONT, fontWeight: 600, fontSize: 40 * scale, color: "#F5A623", lineHeight: 1.2 }}>{words.small}</div>
          </div>
          <Emoji name="bell" size={96 * scale} style={{ transform: `rotate(${ring}deg)`, transformOrigin: "50% 10%" }} />
        </div>
        {/* Little hearts float up from the logos, like live reactions. */}
        {[0, 1, 2, 3, 4].map((i) => {
          const life = ((frame - 14 - i * 11) % 55) / 55;
          if (frame < 14 + i * 11) return null;
          return (
            <Emoji
              key={`h${i}`}
              name="heart"
              size={44 * scale}
              style={{
                position: "absolute",
                right: (40 + ((i * 53) % 140)) * scale,
                bottom: (60 + life * 260) * scale,
                opacity: Math.sin(life * Math.PI),
                transform: `translateX(${Math.sin(life * 6 + i) * 18 * scale}px) scale(${0.7 + 0.5 * life})`,
              }}
            />
          );
        })}
        <div style={{ display: "flex", gap: 28 * scale }}>
          {PLATFORMS.map((p, i) => {
            // The logos pop in one after another.
            const s = spring({ frame: frame - 8 - i * 5, fps, config: { damping: 10, mass: 0.6 } });
            const bob = Math.sin((frame - i * 6) / 9) * 6 * scale;
            return (
              <div key={p.name} style={{ transform: `translateY(${bob}px) scale(${s})`, opacity: Math.min(1, s * 1.5) }}>
                <PlatformLogo p={p} size={logo} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
