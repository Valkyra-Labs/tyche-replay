// Interface strings in English and Arabic. Numbers reach these functions
// already formatted in the locale's digits (Stoa's useStoaFormat); the
// symbol and IEX stay in Latin letters, as names.

export type Lang = "en" | "ar";

/** The React Aria and Stoa locale of each language. Arabic asks for
 * Arabic-Indic digits: "ar" alone formats with Latin ones. */
export const LOCALES: Record<Lang, string> = { en: "en-US", ar: "ar-u-nu-arab" };

const en = {
  title: "Tyche Replay",
  onIex: (symbol: string) => `${symbol} on IEX`,
  attribution: "Data provided for free by IEX. By accessing or using IEX Historical Data, you agree to the ",
  terms: "IEX Historical Data Terms of Use",
  attributionEnd: ".",
  theme: "Theme",
  light: "Light",
  dark: "Dark",
  language: "Language",
  capture: (symbol: string) => `${symbol} capture`,
  downloading: (symbol: string) => `Downloading the ${symbol} capture…`,
  decoding: (symbol: string) => `Decoding the ${symbol} capture…`,
  loadFailed: (symbol: string) => `Could not load the ${symbol} capture.`,
  replayStopped: (symbol: string) => `The ${symbol} replay stopped.`,
  httpFailed: (status: string) => `The server answered with status ${status}.`,
  engineStopped: "The replay engine stopped.",
  unreadable: "The replay engine sent a message that could not be read.",
  details: "Details:",
  retry: "Retry",
  playback: "Playback",
  play: "Play",
  pause: "Pause",
  speed: "Speed",
  speedChoice: (times: string) => `${times}x`,
  time: "Time",
  performance: "Performance",
  counters: "Performance counters",
  fps: "frames/s",
  frameP95: "frame p95",
  bookP95: "book p95",
  heatmapP95: "heatmap p95",
  messagesPerSecond: "messages/s",
  orders: "orders",
  day: "day",
  ms: (value: string) => `${value} ms`,
  dayValue: (messages: string, megabytes: string, ms: string) => `${messages} messages, ${megabytes} MB, loaded in ${ms} ms`,
  book: "Book",
  bookLabel: (symbol: string, depth: string) => `Order book for ${symbol}, ${depth} levels per side`,
  liquidity: "Liquidity, last 10 minutes",
  liquidityLabel: "Displayed liquidity over the last 10 minutes",
  liquidityText: (top: string, bottom: string, column: string) =>
    `Prices from ${top} at the top to ${bottom} at the bottom, a cent a row, around the midpoint now. Time runs left to right, ${column} seconds a column, ending now. In each column bids lie below asks; darker cells hold more shares.`,
  trades: "Trades",
  tradesCaption: (symbol: string) => `Recent trades in ${symbol}`,
};

export type Strings = typeof en;

const ar: Strings = {
  title: "تايكي ريبلاي",
  onIex: (symbol) => `${symbol} في بورصة IEX`,
  attribution: "البيانات مقدَّمة مجانًا من IEX. باستخدامك بيانات IEX التاريخية أو الوصول إليها، فإنك توافق على ",
  terms: "شروط استخدام بيانات IEX التاريخية",
  attributionEnd: ".",
  theme: "المظهر",
  light: "فاتح",
  dark: "داكن",
  language: "اللغة",
  capture: (symbol) => `تسجيل ${symbol}`,
  downloading: (symbol) => `جارٍ تنزيل تسجيل ${symbol}…`,
  decoding: (symbol) => `جارٍ فك ترميز تسجيل ${symbol}…`,
  loadFailed: (symbol) => `تعذّر تحميل تسجيل ${symbol}.`,
  replayStopped: (symbol) => `توقّفت إعادة عرض ${symbol}.`,
  httpFailed: (status) => `ردّ الخادم برمز الحالة ${status}.`,
  engineStopped: "توقّف محرك إعادة العرض.",
  unreadable: "أرسل محرك إعادة العرض رسالة تعذّرت قراءتها.",
  details: "التفاصيل:",
  retry: "أعد المحاولة",
  playback: "التشغيل",
  play: "تشغيل",
  pause: "إيقاف مؤقت",
  speed: "السرعة",
  speedChoice: (times) => `${times}×`,
  time: "الوقت",
  performance: "الأداء",
  counters: "عدّادات الأداء",
  fps: "إطارات/ث",
  frameP95: "الإطار، المئين ٩٥",
  bookP95: "الدفتر، المئين ٩٥",
  heatmapP95: "الخريطة الحرارية، المئين ٩٥",
  messagesPerSecond: "رسائل/ث",
  orders: "الأوامر",
  day: "اليوم",
  ms: (value) => `${value} ملّي ثانية`,
  dayValue: (messages, megabytes, ms) => `${messages} رسالة، ${megabytes} ميغابايت، حُمِّل في ${ms} ملّي ثانية`,
  book: "دفتر الأوامر",
  bookLabel: (symbol, depth) => `دفتر أوامر ${symbol}، ${depth} مستوى لكل جانب`,
  liquidity: "السيولة، آخر ١٠ دقائق",
  liquidityLabel: "السيولة المعروضة خلال آخر ١٠ دقائق",
  liquidityText: (top, bottom, column) =>
    `الأسعار من ${top} في الأعلى إلى ${bottom} في الأسفل، سنت واحد لكل صف، حول السعر الأوسط الآن. يجري الوقت من اليسار إلى اليمين، ${column} ثانية لكل عمود، وينتهي الآن. في كل عمود تقع أوامر الشراء تحت أوامر البيع؛ والخلايا الأغمق تحمل أسهمًا أكثر.`,
  trades: "الصفقات",
  tradesCaption: (symbol) => `أحدث الصفقات في ${symbol}`,
};

export const strings: Record<Lang, Strings> = { en, ar };
