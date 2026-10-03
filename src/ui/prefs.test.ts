import { describe, expect, it } from "vitest";
import { pickTheme, storedTheme } from "./prefs";

describe("pickTheme", () => {
  it("takes ?theme= first", () => {
    expect(pickTheme("?theme=dark", "light")).toBe("dark");
    expect(pickTheme("?theme=light", "dark")).toBe("light");
  });

  it("takes the remembered choice when the URL has none", () => {
    expect(pickTheme("", "dark")).toBe("dark");
    expect(pickTheme("?symbol=AAPL", "light")).toBe("light");
  });

  it("follows the system when neither names a theme", () => {
    expect(pickTheme("", null)).toBeNull();
    expect(pickTheme("?theme=blue", "sepia")).toBeNull();
  });

  it("ignores a theme the URL names wrongly, for the remembered one", () => {
    expect(pickTheme("?theme=Dark", "light")).toBe("light");
  });
});

describe("storedTheme", () => {
  it("does not throw where there is no storage", () => {
    expect(() => storedTheme()).not.toThrow();
  });
});
