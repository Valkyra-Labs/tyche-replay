import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@valkyra-labs/stoa-react";
import "@valkyra-labs/stoa-tokens/tokens.css";
import "./styles.css";
import { App } from "./App";

// Tyche is an English app: without a provider, Stoa and React Aria take
// the browser's locale and would write prices as 334,55 on a Russian one.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider locale="en-US">
      <App />
    </I18nProvider>
  </StrictMode>,
);
