/**
 * One Claude client for the whole app.
 * The SDK reads ANTHROPIC_API_KEY from the environment by itself,
 * so the key never appears in our code.
 */
import Anthropic from "@anthropic-ai/sdk";

/**
 * Which Claude model to use. Change it with the AI_MODEL environment variable.
 *
 * - "claude-haiku-5-5" (default, BUDGET mode): about 40x cheaper than Opus. Good for starting out.
 * - "claude-opus-5-5" (QUALITY mode): best writing quality. Switch to it when the channels earn money.
 */
export const BUDGET_MODEL = "claude-haiku-5-5";
export const QUALITY_MODEL = "claude-opus-5-5";

export function currentModel(): string {
  return process.env.AI_MODEL || BUDGET_MODEL;
}

/** How many web searches research may use. Each search costs about $0.01. */
export function maxWebSearches(): number {
  return currentModel() === BUDGET_MODEL ? 3 : 6;
}

/**
 * Server-side fallback: if the model declines a request, the API retries it
 * on another model inside the same call. Haiku has no server-side fallback,
 * so we only turn it on for the bigger models.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export function fallbackOptions() {
  return currentModel().startsWith("claude-haiku")
    ? { betas: [] as string[] }
    : { betas: [FALLBACK_BETA], fallbacks: "default" as const };
}

/** A setup problem (like a missing key) that retrying will never fix. */
export class ConfigError extends Error {}

/**
 * True when an error will happen again on retry, so we should stop at once
 * instead of waiting and paying for more attempts.
 */
export function isPermanentError(err: unknown) {
  return (
    err instanceof ConfigError ||
    err instanceof Anthropic.AuthenticationError || // wrong API key
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.BadRequestError // our request is wrong (or no credit left)
  );
}

let client: Anthropic | null = null;
export function claude() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ConfigError("ANTHROPIC_API_KEY is not set. Add it to your environment (see README).");
    }
    client = new Anthropic();
  }
  return client;
}
