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
