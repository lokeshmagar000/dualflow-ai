/**
 * Turn the token counts Claude reports into US dollars.
 * Prices in USD per million tokens (check https://www.anthropic.com/pricing if they change).
 * Web search: $10 per 1,000 searches.
 */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
const PER_WEB_SEARCH = 10 / 1000;

export interface CostLine {
  provider: string;
  units: number;
  unitType: string;
  usd: number;
}

export function claudeCost(model: string, usage: UsageLike): CostLine {
  // Unknown model: count it at the most expensive price, to be safe.
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"]!;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const tokens = usage.input_tokens + usage.output_tokens + cacheRead + cacheWrite;
  const usd =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      cacheRead * p.cacheRead +
      cacheWrite * p.cacheWrite) /
      1_000_000 +
    (usage.server_tool_use?.web_search_requests ?? 0) * PER_WEB_SEARCH;
  return { provider: `anthropic:${model}`, units: tokens, unitType: "tokens", usd };
}
