// Shields.io endpoint badges from what CI measured on this commit.
//
// Usage (CI runs it after the tests; see .github/workflows/ci.yml):
//   node scripts/badges.mjs --out <dir>
//     --unit <log of `pnpm test:no-capture`>
//     --e2e <Playwright JSON report of `pnpm e2e:no-capture`>
//     --dist dist
//
// CI has no capture of a trading day (they are not in git), so it runs
// only the unit and e2e tests that need none, and the labels say so.
//
// Each badge is one JSON file, {"schemaVersion":1,"label","message","color"},
// which CI commits to the `badges` branch for img.shields.io/endpoint to
// read. A value that cannot be read, or a run that did not pass, stops the
// script with an error: a badge is never written from a guess. No
// dependencies: Node 18 or later.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

class BadgeError extends Error {}
const fail = (message) => {
  throw new BadgeError(message);
};

const read = (path) => {
  try {
    return readFileSync(path);
  } catch (e) {
    return fail(`cannot read ${path}: ${e.message}`);
  }
};
const readJson = (path) => {
  try {
    return JSON.parse(read(path).toString("utf8"));
  } catch (e) {
    if (e instanceof BadgeError) throw e;
    return fail(`${path} is not JSON: ${e.message}`);
  }
};

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const SUMMARY = (name) => new RegExp(`^\\s*${name}\\s+(.+?)\\s+\\((\\d+)\\)\\s*$`);

/** The counts on one Vitest summary line ("Test Files" or "Tests"); there
 * must be exactly one, and its parts must add up to its total. */
function vitestLine(lines, name, kinds) {
  const re = SUMMARY(name);
  const found = lines.filter((l) => re.test(l));
  if (found.length !== 1) fail(`expected one Vitest "${name}" summary in the unit test log, found ${found.length}`);
  const [, parts, total] = re.exec(found[0]);
  const counts = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (const part of parts.split("|")) {
    const p = new RegExp(`^\\s*(\\d+) (${kinds.join("|")})\\s*$`).exec(part);
    if (!p) fail(`unrecognised Vitest summary: "${found[0].trim()}"`);
    counts[p[2]] += Number(p[1]);
  }
  if (Object.values(counts).reduce((a, b) => a + b, 0) !== Number(total)) fail(`Vitest summary does not add up: "${found[0].trim()}"`);
  return counts;
}

/** Counts from the one Vitest summary in the output of `pnpm test`. A test
 * file that failed to load counts as a failure even when no test in it
 * ran. */
export function parseVitest(text) {
  const lines = text.replace(ANSI, "").split(/\r?\n/);
  const files = vitestLine(lines, "Test Files", ["passed", "failed", "skipped"]);
  if (files.failed > 0) fail(`${files.failed} unit test file(s) failed`);
  const counts = vitestLine(lines, "Tests", ["passed", "failed", "skipped", "todo"]);
  if (counts.failed > 0) fail(`${counts.failed} unit test(s) failed`);
  if (counts.passed === 0) fail("no unit test passed");
  return { passed: counts.passed, skipped: counts.skipped + counts.todo };
}

/** Pass counts from a Playwright JSON report (reporter "json"). */
export function readPlaywright(report) {
  const s = report?.stats;
  if (!s || ![s.expected, s.unexpected, s.flaky, s.skipped].every(Number.isInteger)) fail("the e2e report has no Playwright stats");
  if (s.unexpected > 0) fail(`${s.unexpected} e2e test(s) failed`);
  if (s.expected + s.flaky === 0) fail("no e2e test passed");
  return { passed: s.expected, flaky: s.flaky, skipped: s.skipped };
}

/** gzip (level 9) of every JavaScript and CSS file the build wrote. */
export function bundleBytes(dist) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return fail(`cannot read ${dir}: ${e.message}`);
    }
    for (const e of entries) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (/\.(m?js|css)$/.test(e.name)) files.push(path);
    }
  };
  walk(dist);
  if (!files.some((f) => f.endsWith(".js"))) fail(`no JavaScript in ${dist}`);
  return files.reduce((n, f) => n + gzipSync(read(f), { level: 9 }).length, 0);
}
const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!key || argv[i + 1] === undefined) fail(`expected --name value pairs, got "${argv.slice(i).join(" ")}"`);
    args[key] = argv[i + 1];
  }
  for (const key of ["out", "unit", "e2e", "dist"]) if (!args[key]) fail(`--${key} is required`);
  return args;
}

export function buildBadges(args) {
  const unit = parseVitest(read(args.unit).toString("utf8"));
  const e2e = readPlaywright(readJson(args.e2e));
  const extra = (skipped, flaky = 0) => `${skipped ? `, ${skipped} skipped` : ""}${flaky ? `, ${flaky} flaky` : ""}`;
  return {
    "unit-tests": { label: "unit tests (no capture)", message: `${unit.passed} passed${extra(unit.skipped)}`, color: "brightgreen" },
    e2e: { label: "e2e (no capture)", message: `${e2e.passed} passed${extra(e2e.skipped, e2e.flaky)}`, color: e2e.flaky ? "yellow" : "brightgreen" },
    "bundle-size": { label: "bundle gzip (JS + CSS)", message: kB(bundleBytes(args.dist)), color: "blue" },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const badges = buildBadges(args);
    mkdirSync(args.out, { recursive: true });
    for (const [name, { label, message, color }] of Object.entries(badges)) {
      const json = `${JSON.stringify({ schemaVersion: 1, label, message, color })}\n`;
      writeFileSync(join(args.out, `${name}.json`), json);
      process.stdout.write(`${name}.json ${json}`);
    }
  } catch (e) {
    if (!(e instanceof BadgeError)) throw e;
    console.error(`badges: ${e.message}`);
    process.exit(1);
  }
}
