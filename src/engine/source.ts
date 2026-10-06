// Which capture the page loads. `?data=` may name another one, but only
// from this site's own data folder: a link must not be able to make the
// page download a file from anywhere and show it as IEX data under the
// project's name. (A meta Content-Security-Policy would not stop it: the
// download runs in the worker, which a page's policy does not reach.)

/** The capture loaded when none is asked for, relative to the app's base. */
export const DEFAULT_CAPTURE = "data/20260924_AAPL_deepplus.tycz";

/** The path of the capture to load: `raw` (from `?data=`, resolved against
 * the page's address `page`) when it is on the page's origin and inside
 * `${base}data/`, the default capture otherwise. Query and fragment are
 * dropped. */
export function captureUrl(raw: string | null, base: string, page: string): string {
  const fallback = `${base}${DEFAULT_CAPTURE}`;
  if (raw === null) return fallback;
  let url: URL;
  try {
    url = new URL(raw, page);
  } catch {
    return fallback;
  }
  // The URL parser has already resolved dot segments, encoded ones too.
  if (url.origin !== new URL(page).origin || !url.pathname.startsWith(`${base}data/`)) return fallback;
  return url.pathname;
}
