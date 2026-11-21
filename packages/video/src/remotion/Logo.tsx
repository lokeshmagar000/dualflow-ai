/**
 * The Namaste Facts logo (Palm Bulb with red sparks), drawn as SVG.
 * It is the same drawing as the final logo files (assets/brand/, made by make_final.py),
 * written as React so it stays sharp at any size and its sparks can twinkle.
 *
 *   two palms joined = the bulb glass (marigold), red glow + red shadow behind,
 *   a screw base under it, red rays and 4-point sparks around it.
 */
import { useId } from "react";

export const LOGO = {
  ink: "#13203F",
  crimson: "#C8102E",
  marigold: "#F5A623",
  gold: "#E8901A",
  snow: "#F3F6FA",
};

const PALM = "M100,4 C96,4 92,8 88,14 C74,32 46,52 40,84 C36,106 50,126 62,140 C66,144 68,148 68,152 L100,152 Z";
const FINGER = "M86,34 C72,50 62,68 60,90";
const THUMB = "M95,100 C87,110 86,124 90,140";
const MIRROR = "translate(200,0) scale(-1,1)"; // left hand -> right hand

function Spark({ cx, cy, r, color, scale = 1 }: { cx: number; cy: number; r: number; color: string; scale?: number }) {
  const k = r * 0.22;
  const d = `M${cx},${cy - r} Q${cx + k},${cy - k} ${cx + r},${cy} Q${cx + k},${cy + k} ${cx},${cy + r} Q${cx - k},${cy + k} ${cx - r},${cy} Q${cx - k},${cy - k} ${cx},${cy - r} Z`;
  return <path d={d} fill={color} transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`} />;
}

/**
 * @param size     width and height in pixels
 * @param onDark   true = light screw base (for dark backgrounds)
 * @param twinkle  0..1 animation value; sparks grow and shrink with it (leave out for a still logo)
 * @param glow     strength of the red glow (0..1)
 */
export function Logo({
  size,
  onDark = true,
  twinkle,
  glow = 0.75,
}: {
  size: number;
  onDark?: boolean;
  twinkle?: number;
  glow?: number;
}) {
  const id = useId().replace(/:/g, "");
  const base = onDark ? LOGO.snow : LOGO.ink;
  // Each spark twinkles a little out of step with the others.
  const tw = (offset: number) => (twinkle === undefined ? 1 : 0.75 + 0.35 * Math.sin((twinkle + offset) * Math.PI * 2));
  return (
    <svg width={size} height={size} viewBox="-20 -20 240 240" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <filter id={`glow${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <g transform="translate(0,12)">
        {/* red energy: soft glow + solid shadow behind the glass */}
        <g filter={`url(#glow${id})`} opacity={glow}>
          <path d={PALM} fill={LOGO.crimson} />
          <path d={PALM} fill={LOGO.crimson} transform={MIRROR} />
        </g>
        <g transform="translate(9,7)">
          <path d={PALM} fill={LOGO.crimson} />
          <path d={PALM} fill={LOGO.crimson} transform={MIRROR} />
        </g>
        {/* the glass = two palms */}
        <path d={PALM} fill={LOGO.marigold} />
        <path d={PALM} fill={LOGO.gold} transform={MIRROR} />
        <g fill="none" stroke={LOGO.ink} strokeWidth={5} strokeLinecap="round">
          <path d={FINGER} />
          <path d={FINGER} transform={MIRROR} />
          <path d={THUMB} />
          <path d={THUMB} transform={MIRROR} />
          <path d="M100,18 L100,140" />
        </g>
        {/* screw base */}
        <g fill={base}>
          <rect x={68} y={154} width={64} height={10} rx={5} />
          <rect x={72} y={168} width={56} height={10} rx={5} />
          <path d="M84,182 h32 a16,10 0 0 1 -32,0z" />
        </g>
        {/* red rays and sparks */}
        <g stroke={LOGO.crimson} strokeWidth={7} strokeLinecap="round">
          <path d="M38,22 L29,13" />
          <path d="M24,66 L12,62" />
          <path d="M176,66 L188,62" />
        </g>
        <Spark cx={162} cy={20} r={17} color={LOGO.crimson} scale={tw(0)} />
        <Spark cx={100} cy={-12} r={9} color={LOGO.crimson} scale={tw(0.25)} />
        <Spark cx={182} cy={108} r={8} color={LOGO.marigold} scale={tw(0.5)} />
        <Spark cx={18} cy={112} r={7} color={LOGO.crimson} scale={tw(0.75)} />
      </g>
    </svg>
  );
}

/** The 4-point spark on its own (used as decoration in the intro and thumbnail). */
export function SparkIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: "block", overflow: "visible" }}>
      <Spark cx={20} cy={20} r={20} color={color} />
    </svg>
  );
}
