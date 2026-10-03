import { describe, expect, it } from "vitest";
import { strings, type Strings } from "./i18n";

/** Each key with the kind of its value, and for a function its arity. */
const shape = (s: Strings) =>
  Object.entries(s).map(([k, v]) => `${k}:${typeof v}${typeof v === "function" ? (v as (...a: string[]) => string).length : ""}`);

/** Every string, with each function called on placeholders. */
const rendered = (s: Strings) =>
  Object.entries(s).map(([k, v]) => [k, typeof v === "function" ? (v as (...a: string[]) => string)("@1", "@2", "@3") : v] as const);

describe("interface strings", () => {
  it("English and Arabic have the same keys, with the same kinds of value", () => {
    expect(shape(strings.ar).sort()).toEqual(shape(strings.en).sort());
  });

  it("every function uses each of its arguments, in both languages", () => {
    for (const lang of ["en", "ar"] as const)
      for (const [k, v] of Object.entries(strings[lang]))
        if (typeof v === "function") {
          const out = (v as (...a: string[]) => string)("@1", "@2", "@3");
          for (let i = 1; i <= v.length; i++) expect(out, `${lang}.${k}`).toContain(`@${i}`);
        }
  });

  it("no string is empty", () => {
    for (const lang of ["en", "ar"] as const)
      for (const [k, v] of rendered(strings[lang])) expect(v.trim(), `${lang}.${k}`).not.toBe("");
  });

  it("Arabic has no English words or Latin digits, only the name IEX", () => {
    for (const [k, v] of rendered(strings.ar)) {
      const latin = v.replace(/@\d/g, "").replace(/IEX/g, "");
      expect(latin, `ar.${k}`).not.toMatch(/[A-Za-z0-9]/);
    }
  });
});
