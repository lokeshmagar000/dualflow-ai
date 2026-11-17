/**
 * Turn the token counts Claude reports into US dollars.
 * Prices: Claude Opus 5.5 = $4 per million input tokens, $20 per million output tokens,
 * cached input reads $0.20 per million. Web search = $10 per 1,000 searches.
 * Check https://www.anthropic.com/pricing if prices change.
 */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

const PER_MILLION = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const PER_WEB_SEARCH = 10 / 1000;

export interface CostLine {
  provider: string;
  units: number;
  unitType: string;
  usd: number;
}

export function claudeCost(usage: UsageLike): CostLine {
  const tokens =
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);
  const usd =
    (usage.input_tokens * PER_MILLION.input +
      usage.output_tokens * PER_MILLION.output +
      (usage.cache_read_input_tokens ?? 0) * PER_MILLION.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * PER_MILLION.cacheWrite) /
      1_000_000 +
    (usage.server_tool_use?.web_search_requests ?? 0) * PER_WEB_SEARCH;
  return { provider: "anthropic", units: tokens, unitType: "tokens", usd };
}
