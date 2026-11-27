/**
 * One Claude client for the whole app.
 * The key comes from the environment, so it never appears in our code.
 * We read ANTHROPIC_API_KEY, or DUALFLOW_ANTHROPIC_API_KEY as a backup name:
 * some hosts (like Claude Code cloud sessions) reserve ANTHROPIC_* names
 * for themselves and hide them from programs.
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
 * Which web search tool version the current model supports.
 * The newer "20260209" version (smarter filtering of results) works only on
 * the bigger models (Opus, Sonnet, Fable). Haiku uses the basic "20250305" version.
 */
export function webSearchTool(maxUses?: number) {
  // A full video may search a little more (it needs 15-25 facts); never fewer than the normal amount.
  const max_uses = Math.max(maxWebSearches(), maxUses ?? 0);
  return currentModel().startsWith("claude-haiku")
    ? ({ type: "web_search_20250305", name: "web_search", max_uses } as const)
    : ({ type: "web_search_20260209", name: "web_search", max_uses } as const);
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
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.DUALFLOW_ANTHROPIC_API_KEY || process.env.DUALFLOW_ANTHROPIC_KEY;
    if (!apiKey) {
      throw new ConfigError(
        "No Claude API key found. Set ANTHROPIC_API_KEY (or DUALFLOW_ANTHROPIC_API_KEY) in your environment (see README).",
      );
    }
    // Always talk to the real Anthropic API. We do not trust ANTHROPIC_BASE_URL,
    // because tools on the same machine may point it somewhere else.
    const baseURL = process.env.DUALFLOW_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
    client = new Anthropic({ apiKey, baseURL });
  }
  return client;
}

/**
 * Key check (check-keys workflow): one tiny request to the chosen Claude model.
 * Costs a tiny fraction of a cent. Also shows "no credit left" problems.
 */
export async function checkClaudeKey(): Promise<{ ok: boolean; note: string }> {
  const model = currentModel();
  try {
    await claude().messages.create({ model, max_tokens: 200, output_config: { effort: "low" }, messages: [{ role: "user", content: "Say OK." }] });
    return { ok: true, note: `${model} answered` };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, note: "the key is wrong (401). Make a new key and paste it again." };
    if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, note: "the key is not allowed to use this model (403)." };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, note: `request refused (400), often "credit balance too low": ${String(err.message).slice(0, 120)}` };
    if (err instanceof Anthropic.APIError) return { ok: false, note: `Claude error ${err.status ?? ""}: ${String(err.message).slice(0, 120)}` };
    return { ok: false, note: (err as Error).message.slice(0, 120) };
  }
}
