// The theme and the language. Both live in the URL, so a reload or a
// shared link keeps them; the theme is also remembered by this browser.
// Without a choice the theme follows the system (no data-theme on <html>,
// and Stoa's tokens.css takes prefers-color-scheme).
import { useEffect, useState } from "react";
import type { Lang } from "../i18n";

export type Theme = "light" | "dark";
/** What the switch offers: a theme, or System (follow the scheme). */
export type ThemeChoice = Theme | "system";

const THEME_KEY = "tyche-replay:theme";

const isTheme = (v: string | null | undefined): v is Theme => v === "light" || v === "dark";

/** The theme asked for in `?theme=`, else the one `stored` last, else
 * none (follow the system). `?theme=system` asks for the system, over
 * any stored choice. */
export function pickTheme(search: string, stored: string | null): Theme | null {
  const asked = new URLSearchParams(search).get("theme");
  if (asked === "system") return null;
  if (isTheme(asked)) return asked;
  return isTheme(stored) ? stored : null;
}

/** The language asked for in `?lang=`; English otherwise. */
export function pickLang(search: string): Lang {
  return new URLSearchParams(search).get("lang") === "ar" ? "ar" : "en";
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

export function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

/** Put `value` in the URL's `name` parameter. replaceState: a switch of
 * theme or language is not a step to go back through. */
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

/** Back to the system: no theme in the URL, none remembered. */
export function forgetTheme() {
  const url = new URL(location.href);
  url.searchParams.delete("theme");
  history.replaceState(history.state, "", url);
  try {
    localStorage.removeItem(THEME_KEY);
  } catch {
    // Nothing was remembered where storage is blocked.
  }
}

export function saveLang(lang: Lang) {
  setParam("lang", lang);
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
