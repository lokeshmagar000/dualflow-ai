/**
 * The channel brand: "Namaste Facts".
 *
 * One brand, two channels, like the final logo files:
 *   English videos: "Namaste Facts"
 *   Nepali videos:  "Namaste Facts" + a red "नेपाली" label Colours and fonts come from the final logo
 * (Palm Bulb with red sparks, project files logos/final, copy in assets/brand/).
 *
 * Settings (environment variables, all optional):
 *   BRAND_NAME_EN / BRAND_NAME_NE        channel name written in the video
 *   BRAND_TAG_EN / BRAND_TAG_NE          small red label after the name (Nepali: "नेपाली", English: none)
 *   BRAND_TAGLINE_EN / BRAND_TAGLINE_NE  small line under the name
 *   BRAND_HASHTAGS_EN / BRAND_HASHTAGS_NE  your own hashtags added to every video (comma separated)
 */
import type { Language } from "./index";

/** Logo colours (same as make_final.py). */
export const BRAND_COLORS = {
  ink: "#13203F", // dark navy background
  crimson: "#C8102E", // rhododendron red: sparks and glow
  marigold: "#F5A623", // the bulb glass, highlights
  gold: "#E8901A",
  snow: "#F3F6FA",
} as const;

const DEFAULTS: Record<Language, Brand> = {
  en: { name: "Namaste Facts", tag: "", tagline: "Small facts, big wonder", hashtags: ["NamasteFacts"] },
  ne: { name: "Namaste Facts", tag: "नेपाली", tagline: "सानो तथ्य, ठूलो अचम्म", hashtags: ["NamasteFacts", "NamasteFactsNepali"] },
};

/** `tag` is the small red label after the name ("" = none). */
export type Brand = { name: string; tag: string; tagline: string; hashtags: string[] };

type Env = Record<string, string | undefined>;
const processEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {};

/** The brand for one language (settings first, then the defaults above). */
export function brandFor(language: Language, env: Env = processEnv()): Brand {
  const up = language.toUpperCase();
  const d = DEFAULTS[language];
  const tags = (env[`BRAND_HASHTAGS_${up}`] ?? "")
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
  return {
    name: (env[`BRAND_NAME_${up}`] || d.name).trim(),
    tag: (env[`BRAND_TAG_${up}`] ?? d.tag).trim(),
    tagline: (env[`BRAND_TAGLINE_${up}`] ?? d.tagline).trim(),
    hashtags: tags.length ? tags : d.hashtags,
  };
}
