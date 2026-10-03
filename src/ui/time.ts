const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});

/** Exchange local time (New York) of `ns` nanoseconds after `startEpochMs`. */
export function clock(startEpochMs: number, ns: number): string {
  return fmt.format(new Date(startEpochMs + ns / 1e6));
}

/** The start time asked for in `?at=`, in ns after the first message. Not
 * a number (or not finite) is the start of the day; the day's length is
 * not known yet, so the upper bound is left to `clampTime`. */
export function parseAt(raw: string | null): number {
  const at = Number(raw ?? 0);
  return Number.isFinite(at) ? Math.max(0, at) : 0;
}

/** `ns` kept within the day: from the first message to the last. */
export function clampTime(ns: number, duration: number): number {
  return Math.min(Math.max(ns, 0), duration);
}
