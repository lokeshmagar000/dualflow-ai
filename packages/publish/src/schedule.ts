/**
 * The upload timetable ("slots").
 *
 * PUBLISH_TIMES = "07:00,12:30,19:00" and PUBLISH_TIMEZONE = "Asia/Kathmandu" mean:
 * every day, a channel gets at most one video at 7:00, one at 12:30 and one at 19:00
 * Nepal time. When many videos are waiting (a "bulk queue"), each one takes the
 * next free slot, so a channel never gets ten videos at once.
 *
 * Note: on the free plan the uploads happen during the GitHub run that comes
 * after the slot time (automatic runs are at 2 AM and 4 AM Nepal time), so a video can go up late.
 */
export const DEFAULT_TIMES = "07:00,12:30,19:00";
export const DEFAULT_TIMEZONE = "Asia/Kathmandu";

/** "07:00,19:30" -> [[7,0],[19,30]], sorted. Bad entries are skipped. */
export function parseTimes(raw: string | undefined): [number, number][] {
  const times = (raw?.trim() ? raw : DEFAULT_TIMES)
    .split(/[\s,]+/)
    .map((t) => /^(\d{1,2}):(\d{2})$/.exec(t))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => [Number(m[1]), Number(m[2])] as [number, number])
    .filter(([h, m]) => h < 24 && m < 60)
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  return times.length ? times : parseTimes(DEFAULT_TIMES);
}

/** How many minutes the time zone is ahead of UTC at this moment (Nepal: +345). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT+05:45" or "GMT"
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? "");
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
}

/** The calendar date (year, month, day) in that time zone. */
function localDate(timeZone: string, at: Date): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), mo: get("month"), d: get("day") };
}

/** Local clock time in a time zone -> the real moment (UTC). */
function zonedToUtc(timeZone: string, y: number, mo: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = zoneOffsetMinutes(timeZone, new Date(guess));
  return new Date(guess - offset * 60_000);
}

/**
 * The first slot that is later than `after` (and later than `notBefore`).
 * `after` is usually the time of the channel's last queued video.
 */
export function nextSlot(
  after: Date,
  opts: { times?: string; timeZone?: string; notBefore?: Date } = {},
): Date {
  const timeZone = opts.timeZone?.trim() || DEFAULT_TIMEZONE;
  const times = parseTimes(opts.times);
  const start = opts.notBefore && opts.notBefore > after ? opts.notBefore : after;
  const { y, mo, d } = localDate(timeZone, start);
  for (let day = 0; day < 8; day++) {
    for (const [h, mi] of times) {
      const slot = zonedToUtc(timeZone, y, mo, d + day, h, mi);
      if (slot > start) return slot;
    }
  }
  return new Date(start.getTime() + 24 * 3600_000); // never reached; a safe fallback
}

/**
 * Give each waiting video of ONE channel its own slot.
 * `taken` = slots already used on that channel; returns one slot per item, in order.
 */
export function planSlots(count: number, taken: Date[], now: Date, opts: { times?: string; timeZone?: string } = {}): Date[] {
  const out: Date[] = [];
  let last = taken.reduce((max, t) => (t > max ? t : max), new Date(0));
  for (let i = 0; i < count; i++) {
    const slot = nextSlot(last, { ...opts, notBefore: now });
    out.push(slot);
    last = slot;
  }
  return out;
}
