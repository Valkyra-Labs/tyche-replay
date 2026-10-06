// The Arabic faces, asked for as soon as the page knows it is Arabic. A
// face otherwise starts downloading only when text first needs it, after
// the replay's first layout; when it arrives the Arabic counters and
// labels change width and the views below them move. Preloaded, it
// usually arrives before the replay is drawn. Only in Arabic: a preload
// that is not used costs the download.
import plexArabic400 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2?url";
import plexArabic500 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2?url";
import notoArabic400 from "@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2?url";

/** Text (400), panel titles and badges (500), and Arabic-Indic digits in
 * the numeric face (Noto Sans Arabic). */
const ARABIC_FACES = [plexArabic400, plexArabic500, notoArabic400];

/** Preloads the Arabic faces when the page's language is Arabic (set on
 * <html> before the app runs, by first-paint.js). */
export function preloadArabicFaces(doc: Document = document) {
  if (doc.documentElement.lang !== "ar") return;
  for (const href of ARABIC_FACES) {
    const link = Object.assign(doc.createElement("link"), { rel: "preload", as: "font", type: "font/woff2", href, crossOrigin: "anonymous" });
    doc.head.append(link);
  }
}
