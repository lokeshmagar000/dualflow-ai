/**
 * One Claude client for the whole app.
 * The SDK reads ANTHROPIC_API_KEY from the environment by itself,
 * so the key never appears in our code.
 */
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

/**
 * Server-side fallback: if the main model declines a request, the API
 * retries it on a suitable fallback model inside the same call.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

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
