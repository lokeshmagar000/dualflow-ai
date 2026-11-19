/**
 * A small wrapper around fetch() used by every uploader:
 *  - gives up after a time limit (a stuck request never blocks the run),
 *  - tries again on short network problems and "429 / 5xx" answers,
 *  - never puts tokens into error messages.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HttpOptions extends RequestInit {
  /** Time limit for one try, in seconds (default 60). Uploads use a longer one. */
  timeoutSec?: number;
  /** How many tries in total for network errors and 429/5xx (default 3). */
  tries?: number;
}

export async function http(url: string, opts: HttpOptions = {}): Promise<Response> {
  const { timeoutSec = 60, tries = 3, ...init } = opts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutSec * 1000) });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === tries) return res;
      lastError = new Error(`${res.status} from ${safeUrl(url)}`);
    } catch (err) {
      lastError = err;
      if (attempt === tries) break;
    }
    await sleep(2_000 * 2 ** (attempt - 1)); // 2 s, 4 s, 8 s ...
  }
  throw new Error(`Could not reach ${safeUrl(url)}: ${(lastError as Error)?.message ?? lastError}`);
}

/** The address without the "?..." part, so tokens in the query never reach the logs. */
export function safeUrl(url: string): string {
  return url.split("?")[0]!;
}

/** Read a JSON answer; if it is not JSON, return the text so the error is still readable. */
export async function readJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text.slice(0, 300) } as T;
  }
}

/** Cut a text to `max` characters without breaking a letter (works for Nepali too). */
export function cut(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}
