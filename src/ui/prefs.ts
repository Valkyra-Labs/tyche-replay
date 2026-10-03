// The theme. It lives in the URL, so a reload or a shared link keeps
// it, and this browser remembers it too.
// Without a choice the theme follows the system (no data-theme on <html>,
// and Stoa's tokens.css takes prefers-color-scheme).
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "tyche-replay:theme";

const isTheme = (v: string | null | undefined): v is Theme => v === "light" || v === "dark";

/** The theme asked for in `?theme=`, else the one `stored` last, else
 * none (follow the system). */
export function pickTheme(search: string, stored: string | null): Theme | null {
  const asked = new URLSearchParams(search).get("theme");
  if (isTheme(asked)) return asked;
  return isTheme(stored) ? stored : null;
}

/** The theme this browser chose last. Storage can be blocked or absent
 * (a private window, a sandbox); then there is none. */
export function storedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme | null) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

/** Put `value` in the URL's `name` parameter. replaceState: a switch of
 * theme is not a step to go back through. */
function setParam(name: string, value: string) {
  const url = new URL(location.href);
  url.searchParams.set(name, value);
  history.replaceState(history.state, "", url);
}

export function saveTheme(theme: Theme) {
  setParam("theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not remembered by this browser; the URL still has it.
  }
}

/** The system's colour scheme, followed as it changes. */
export function useSystemTheme(): Theme {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark ? "dark" : "light";
}
