/**
 * Which AI writes the research and scripts. Change it with AI_PROVIDER:
 *
 *   "mock"   practice data, free, no key (old setting AI_MODE=mock also works)
 *   "gemini" Google Gemini FREE tier (free plan default). Key: GEMINI_API_KEY
 *   "claude" Anthropic Claude (paid, best quality). Key: ANTHROPIC_API_KEY
 *
 * Switching is one setting: the prompts and the checks are the same for all three.
 */
export type AIProviderName = "mock" | "gemini" | "claude";

export function aiProvider(): AIProviderName {
  if ((process.env.AI_MODE ?? "").toLowerCase() === "mock") return "mock";
  const choice = (process.env.AI_PROVIDER ?? "claude").toLowerCase();
  if (choice === "mock" || choice === "gemini" || choice === "claude") return choice;
  throw new Error(`Unknown AI_PROVIDER "${choice}". Use "mock", "gemini" or "claude".`);
}

/**
 * A free daily limit is used up. Retrying now will not help, but it WILL work
 * after the limit resets, so the worker puts the job back until `retryAt`.
 */
export class AIQuotaError extends Error {
  constructor(message: string, readonly retryAt: Date) {
    super(message);
  }
}

/**
 * Gemini's free daily limits reset at midnight Pacific time.
 * 08:05 UTC is just after midnight Pacific in both summer and winter.
 */
export function nextQuotaReset(now = new Date()): Date {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 5));
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}

/** The start of the current Gemini "day" (the last reset before now). */
export function currentQuotaDayStart(now = new Date()): Date {
  const next = nextQuotaReset(now);
  return new Date(next.getTime() - 24 * 60 * 60 * 1000);
}
