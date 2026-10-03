import { StrictMode, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@valkyra-labs/stoa-react";
import "@valkyra-labs/stoa-tokens/tokens.css";
import "./styles.css";
import { App } from "./App";
import { LOCALES, type Lang } from "./i18n";
import { applyLang, applyTheme, pickLang, pickTheme, saveLang, storedTheme } from "./ui/prefs";

// The theme and the language before the first paint, so a dark page does
// not flash light and an Arabic one does not flash left to right.
applyTheme(pickTheme(location.search, storedTheme()));
applyLang(pickLang(location.search));

/** The language, kept in ?lang=. The provider sets the locale for Stoa and
 * React Aria together: without one they take the browser's, and would
 * write prices as 334,55 on a Russian one. */
function Root() {
  const [lang, setLang] = useState<Lang>(() => pickLang(location.search));
  useLayoutEffect(() => applyLang(lang), [lang]);
  return (
    <I18nProvider locale={LOCALES[lang]}>
      <App
        lang={lang}
        onLang={(next) => {
          saveLang(next);
          setLang(next);
        }}
      />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
