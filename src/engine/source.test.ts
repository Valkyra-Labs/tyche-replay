import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTURE, captureUrl } from "./source";

const page = "https://valkyra-labs.github.io/tyche-replay/?lang=ar";
const base = "/tyche-replay/";
const fallback = `${base}${DEFAULT_CAPTURE}`;

describe("captureUrl", () => {
  it("loads the default capture when none is asked for", () => {
    expect(captureUrl(null, base, page)).toBe(fallback);
  });

  it("takes a capture from this site's own data folder", () => {
    expect(captureUrl("/tyche-replay/data/20260924_NVDA_deepplus.tycz", base, page)).toBe("/tyche-replay/data/20260924_NVDA_deepplus.tycz");
    expect(captureUrl("data/20260924_NVDA_deepplus.tycz", base, page)).toBe("/tyche-replay/data/20260924_NVDA_deepplus.tycz");
    expect(captureUrl("https://valkyra-labs.github.io/tyche-replay/data/x.tyc", base, page)).toBe("/tyche-replay/data/x.tyc");
  });

  it("refuses every other origin and scheme, and falls back to the default", () => {
    for (const raw of [
      "https://evil.example/tyche-replay/data/x.tycz",
      "//evil.example/tyche-replay/data/x.tycz",
      "http://valkyra-labs.github.io/tyche-replay/data/x.tycz",
      "https://valkyra-labs.github.io:8443/tyche-replay/data/x.tycz",
      "data:application/octet-stream;base64,VFlDSEVDQVA=",
      "blob:https://valkyra-labs.github.io/0f2c",
      "javascript:alert(1)",
    ])
      expect(captureUrl(raw, base, page), raw).toBe(fallback);
  });

  it("refuses paths outside the data folder, also through dot segments", () => {
    for (const raw of [
      "/tyche-replay/index.html",
      "/other-project/data/x.tycz",
      "/tyche-replay/data/../index.html",
      "/tyche-replay/data/%2e%2e/index.html",
      "/tyche-replay/data",
      "/tyche-replay/database/x.tycz",
    ])
      expect(captureUrl(raw, base, page), raw).toBe(fallback);
  });

  it("drops a query and a fragment", () => {
    expect(captureUrl("/tyche-replay/data/x.tycz?v=2#top", base, page)).toBe("/tyche-replay/data/x.tycz");
  });
});
