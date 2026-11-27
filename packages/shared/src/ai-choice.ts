/**
 * Which AI does the TEXT work (topic picking, research, scripts, picture checks).
 * Chosen on the dashboard (Settings page) and saved as AppSetting rows, so the
 * owner can switch without touching GitHub. The voice is NOT changed by this
 * (it stays Gemini voices, with Edge as the backup).
 */
export const AI_SETTING_KEYS = {
  provider: "ai.provider", // "claude" | "gemini"
  claudeModel: "ai.claudeModel", // one of CLAUDE_MODEL_CHOICES
} as const;

export const AI_TEXT_PROVIDERS = ["claude", "gemini"] as const;
export type AITextProvider = (typeof AI_TEXT_PROVIDERS)[number];

/** Used until the owner picks one on the dashboard. */
export const DEFAULT_AI_TEXT_PROVIDER: AITextProvider = "claude";

export const CLAUDE_MODEL_CHOICES = [
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5 (cheapest)",
    about: "About $0.05-0.10 per night (2 stories = 4 videos), mostly web searches. $5 lasts about 2 months.",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5 (better writing)",
    about: "Better Nepali and English writing. About $0.40-0.70 per night. $5 lasts about 1 week.",
  },
] as const;
export type ClaudeModelId = (typeof CLAUDE_MODEL_CHOICES)[number]["id"];
export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = "claude-haiku-5-5";

export function isAITextProvider(v: unknown): v is AITextProvider {
  return typeof v === "string" && (AI_TEXT_PROVIDERS as readonly string[]).includes(v);
}
export function isClaudeModelId(v: unknown): v is ClaudeModelId {
  return typeof v === "string" && CLAUDE_MODEL_CHOICES.some((m) => m.id === v);
}
