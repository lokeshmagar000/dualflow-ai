/**
 * Upload errors. The publish runner looks at the type to decide what to do:
 *  - PublishQuotaError:     today's free limit is used up -> try again at `retryAt` (not a failure).
 *  - PublishConfigError:    a missing or wrong setting/token -> retrying cannot help, stop now.
 *  - any other Error:       maybe the network or the platform had a bad moment -> retry later.
 */
export class PublishQuotaError extends Error {
  constructor(message: string, public retryAt: Date) {
    super(message);
    this.name = "PublishQuotaError";
  }
}

export class PublishConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishConfigError";
  }
}

/** Next midnight in California (YouTube resets its daily quota then). */
export function nextPacificMidnight(now = new Date()): Date {
  // Pacific time is UTC-8 (or UTC-7 in summer). Using UTC-7 is safe: it is never too early.
  const next = new Date(now);
  next.setUTCHours(7, 5, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
