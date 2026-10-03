// End-to-end checks on a real day (AAPL, 2026-09-24): the replay moves at
// the chosen speed, the controls work with a real mouse and keyboard, and
// axe finds no serious accessibility violations.
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// 10:00 ET is this many ns after AAPL's first message of the day.
const TEN_AM = 10_335_395_000_000;
const CAPTURE = "/data/20260924_AAPL_deepplus.tycz";

async function open(page: Page, at: number | string = TEN_AM) {
  await page.goto(`/?symbol=AAPL&data=${CAPTURE}&at=${at}`);
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length} node(s)`);
}

const clockSeconds = async (page: Page) => {
  const text = (await page.locator(".stoa-slider__output").textContent()) ?? "";
  const [h, m, s] = text.split(":").map(Number);
  return h! * 3600 + m! * 60 + s!;
};

test("plays at the chosen speed (the slider must not pull the clock back)", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "600x" }).click();
  await expect(page.getByRole("radio", { name: "600x" })).toHaveAttribute("aria-checked", "true");
  const before = await clockSeconds(page);
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(2000);
  const moved = (await clockSeconds(page)) - before;
  // 2 s at 600x is 1200 s of trading; allow for start-up and timer slack.
  expect(moved).toBeGreaterThan(900);
});

test("the space bar toggles playback and the slider seeks from the keyboard", async ({ page }) => {
  await open(page);
  await page.locator("body").press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.locator("body").press("Space");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Time" });
  await slider.focus();
  const before = await clockSeconds(page);
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect.poll(() => clockSeconds(page)).toBe(before + 2);
  await expect(slider).toHaveAttribute("aria-valuetext", /^\d\d:\d\d:\d\d\.\d{3}$/);
});

test("the slider shows the clock as it is, and a key moves it by a second", async ({ page }) => {
  await open(page);
  const output = page.locator(".stoa-slider__output");
  const slider = page.getByRole("slider", { name: "Time" });
  await expect(output).toHaveText("10:00:00.000");
  await expect(slider).toHaveAttribute("aria-valuetext", "10:00:00.000");
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(output).toHaveText("10:00:01.000");
  await expect(slider).toHaveAttribute("aria-valuetext", "10:00:01.000");
  await slider.press("ArrowLeft");
  await slider.press("ArrowLeft");
  await expect(output).toHaveText("09:59:59.000");
});

// Share of the heatmap canvas painted in something other than the
// surface colour: cells, labels and text.
const heatmapInk = (page: Page) =>
  page.locator(".stoa-heatmap__canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) ink++;
    return ink / (d.length / 4);
  });

test("the heatmap is drawn while paused, right after the load", async ({ page }) => {
  await open(page);
  // At 10:00 the cells cover about 3% of the canvas; an empty-state
  // message alone covers well under 1%.
  await expect.poll(() => heatmapInk(page)).toBeGreaterThan(0.01);
});

test("the heatmap draws the cells the engine sent, the newest column the book now", async ({ page }) => {
  // 10:06: bids and asks both inside the 80 rows (see src/engine/heatmap.test.ts).
  const at = TEN_AM + 360e9;
  await open(page, at);
  await expect.poll(() => page.evaluate(() => window.__tycheViews?.heatmapTime)).toBe(at);
  const check = await page.evaluate(() => {
    const views = window.__tycheViews!;
    const h = views.heatmap!;
    const levels = views.levels;
    const canvas = document.querySelector<HTMLCanvasElement>(".stoa-heatmap__canvas")!;
    // Token colours as the canvas paints them.
    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const style = getComputedStyle(canvas);
    const rgb = (name: string) => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = style.getPropertyValue(name).trim();
      probe.fillRect(0, 0, 1, 1);
      return Array.from(probe.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const surface = rgb("--stoa-color-surface");
    const bid = rgb("--stoa-color-bid");
    const ask = rgb("--stoa-color-ask");
    // Distance from a pixel to the blends of the surface with a colour.
    const toBlend = (p: number[], c: number[]) => {
      let best = Infinity;
      for (let a = 0.1; a <= 1.0001; a += 0.01) {
        const d = Math.hypot(...p.map((v, i) => v - (surface[i]! + a * (c[i]! - surface[i]!))));
        best = Math.min(best, d);
      }
      return best;
    };
    const ctx = canvas.getContext("2d")!;
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height).data;
    const cw = width / h.columns;
    const rh = height / h.rows;
    const wrong: string[] = [];
    let compared = 0;
    for (let c = 0; c < h.columns; c++) {
      for (let r = 0; r < h.rows; r++) {
        const x = Math.floor((c + 0.5) * cw);
        const y = Math.floor((r + 0.5) * rh);
        // The price labels sit on plates in the end corners.
        if (x > width - 80 * devicePixelRatio && (y < 30 * devicePixelRatio || y > height - 30 * devicePixelRatio)) continue;
        const i = (y * width + x) * 4;
        const p = [img[i]!, img[i + 1]!, img[i + 2]!];
        const v = h.cells[c * h.rows + r]!;
        const blank = p.every((ch, k) => Math.abs(ch - surface[k]!) <= 1);
        const seen = blank ? "none" : toBlend(p, bid) < toBlend(p, ask) ? "bid" : "ask";
        const want = v === 0 ? "none" : v > 0 ? "bid" : "ask";
        compared++;
        if (seen !== want) wrong.push(`column ${c} row ${r}: ${want} expected, ${seen} drawn`);
      }
    }
    // The newest column against the ladder's book (12 levels a side).
    const units = (d: number) => Math.round(d * 10_000);
    const newest = Array.from(h.cells).slice((h.columns - 1) * h.rows);
    const nb = levels[0]!;
    const na = levels[1]!;
    const book: { price: number; size: number; sign: number }[] = [];
    for (let i = 0; i < nb; i++) book.push({ price: levels[2 + 2 * i]!, size: levels[3 + 2 * i]!, sign: 1 });
    for (let i = 0; i < na; i++) book.push({ price: levels[2 + 2 * nb + 2 * i]!, size: levels[3 + 2 * nb + 2 * i]!, sign: -1 });
    const inside = book.filter((l) => {
      const row = (units(h.top) - units(l.price)) / units(h.tick);
      return row >= 0 && row < h.rows;
    });
    const atRows = inside.map((l) => ({ want: l.sign * l.size, got: newest[(units(h.top) - units(l.price)) / units(h.tick)] }));
    return {
      compared,
      wrong: wrong.slice(0, 10),
      wrongCount: wrong.length,
      atRows,
      filledNewest: newest.filter((v) => v !== 0).length,
      bestBid: levels[2],
      bestAsk: levels[2 + 2 * nb],
      newestPrices: newest.flatMap((v, r) => (v === 0 ? [] : [{ v, price: (units(h.top) - r * units(h.tick)) / 10_000 }])),
    };
  });
  expect(check.compared).toBeGreaterThan(18_000);
  expect(check.wrong).toEqual([]);
  expect(check.atRows.length).toBeGreaterThan(0);
  for (const { want, got } of check.atRows) expect(got).toBe(want);
  // Every filled cell of the newest column is a level of the book: at the
  // 12 levels a side of the ladder, these are all of them.
  expect(check.filledNewest).toBe(check.atRows.length);
  for (const { v, price } of check.newestPrices) {
    if (v > 0) expect(price).toBeLessThanOrEqual(check.bestBid!);
    else expect(price).toBeGreaterThanOrEqual(check.bestAsk!);
  }
  // The text alternative names the prices of the top and bottom rows,
  // which the canvas labels show.
  const { top, bottom } = await page.evaluate(() => {
    const h = window.__tycheViews!.heatmap!;
    return { top: h.top.toFixed(2), bottom: (h.top - h.tick * (h.rows - 1)).toFixed(2) };
  });
  await expect(page.locator(".stoa-heatmap figcaption")).toContainText(`Prices from ${top} at the top to ${bottom} at the bottom`);
});

test("the book is described in text for screen readers", async ({ page }) => {
  await open(page);
  await expect(page.locator("figcaption").first()).toContainText(/best bid \d+\.\d\d for [\d,]+, best ask/);
});

test("no serious or critical axe violations", async ({ page }) => {
  await open(page);
  await page.waitForTimeout(1500);
  expect(await seriousViolations(page)).toEqual([]);
});

test("while the capture downloads, a status says so", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**${CAPTURE}`, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/?symbol=AAPL&data=${CAPTURE}&at=${TEN_AM}`);
  const panel = page.getByRole("region", { name: "AAPL capture" });
  await expect(panel.getByRole("status")).toContainText("Downloading the AAPL capture…");
  expect(await seriousViolations(page)).toEqual([]);
  release();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test("a failed load says why, and Retry loads it", async ({ page }) => {
  let missing = true;
  await page.route(`**${CAPTURE}`, (route) => (missing ? route.fulfill({ status: 404, body: "" }) : route.continue()));
  await page.goto(`/?symbol=AAPL&data=${CAPTURE}&at=${TEN_AM}`);
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Could not load the AAPL capture.");
  await expect(alert).toContainText(`cannot load ${CAPTURE}: 404`);
  expect(await seriousViolations(page)).toEqual([]);
  missing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  // The Retry button is gone; focus moves on to Play rather than the page.
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await expect(alert).toHaveCount(0);
  await expect(page.locator(".stoa-ladder figcaption")).toContainText(/best bid/);
});

test("a worker that cannot start is reported, and Retry starts a new one", async ({ page }) => {
  let broken = true;
  await page.route("**/replay.worker.ts*", (route) => (broken ? route.fulfill({ status: 500, body: "" }) : route.continue()));
  await page.goto(`/?symbol=AAPL&data=${CAPTURE}&at=${TEN_AM}`);
  await expect(page.getByRole("alert")).toContainText("The replay engine stopped.");
  broken = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("an engine failure after the load is reported as a stopped replay, and Retry loads again", async ({ page }) => {
  // A stand-in engine: it loads, then fails on the first seek.
  const failing = `self.onmessage = (e) => self.postMessage(e.data.kind === "load"
    ? { kind: "loaded", duration: 60e9, startEpochMs: 0, messages: 0, loadMs: 0, bytes: 0 }
    : { kind: "error", message: "seek failed" });`;
  let broken = true;
  await page.route("**/replay.worker.ts*", (route) =>
    broken ? route.fulfill({ status: 200, contentType: "text/javascript", body: failing }) : route.continue(),
  );
  await page.goto(`/?symbol=AAPL&data=${CAPTURE}&at=${TEN_AM}`);
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("The AAPL replay stopped.");
  await expect(alert).toContainText("seek failed");
  await expect(alert).not.toContainText("Could not load");
  broken = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test("before the first trade, the views show their empty states", async ({ page }) => {
  // The first message of the day: no orders and no trades yet.
  await open(page, 0);
  await expect(page.locator(".trades tbody")).toHaveText("No trades yet.");
  await expect(page.locator(".stoa-heatmap figcaption")).toHaveText("No liquidity to show.");
  await expect(page.locator(".stoa-ladder figcaption")).toHaveText("The book is empty.");
  expect(await seriousViolations(page)).toEqual([]);
});

test("seeking back to the start empties the trades and the heatmap again", async ({ page }) => {
  await open(page);
  await expect(page.locator(".stoa-heatmap figcaption")).toHaveText(/^Prices from \d+\.\d\d at the top/);
  await expect(page.locator(".trades tbody tr").first()).not.toHaveText("No trades yet.");
  const slider = page.getByRole("slider", { name: "Time" });
  await slider.focus();
  await slider.press("Home");
  await expect(page.locator(".trades tbody")).toHaveText("No trades yet.");
  await expect(page.locator(".stoa-heatmap figcaption")).toHaveText("No liquidity to show.");
});

test.describe("on a Russian browser", () => {
  test.use({ locale: "ru-RU" });

  test("prices and sizes keep the English format", async ({ page }) => {
    await open(page);
    await expect(page.locator("figcaption").first()).toContainText(/best bid \d+\.\d\d for [\d,]+, best ask \d+\.\d\d for [\d,]+/);
    const prices = page.locator(".trades tbody td.stoa-num");
    await expect(prices.first()).toHaveText(/^[\d,]+(\.\d\d)?$/);
    for (const text of await prices.allTextContents()) expect(text).toMatch(/^[\d,]+(\.\d\d)?$/);
  });
});

test("the heatmap is as tall as the book at every density", async ({ page }) => {
  await open(page);
  const height = (selector: string) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().height);
  const ladder = () => height(".stoa-ladder__canvas");
  const heatmap = () => height(".stoa-heatmap__canvas");
  // Regular density by default: 28 px rows, 12 levels a side.
  await expect.poll(ladder).toBe(28 * 24);
  await expect.poll(heatmap).toBe(28 * 24);
  // A density set on an ancestor, announced with Stoa's token signal.
  // (On <html> itself, compact is outranked by the :root default in
  // Stoa's tokens.css, so this goes through <body>.)
  for (const [density, row] of [["compact", 24], ["comfortable", 36], ["regular", 28]] as const) {
    await page.evaluate((d) => {
      document.body.dataset.density = d;
      document.body.dispatchEvent(new CustomEvent("stoa:tokens", { bubbles: true }));
    }, density);
    await expect.poll(ladder).toBe(row * 24);
    await expect.poll(heatmap).toBe(row * 24);
  }
  // A density set on <html>, which Stoa watches without a signal.
  await page.evaluate(() => {
    delete document.body.dataset.density;
    document.documentElement.dataset.density = "comfortable";
  });
  await expect.poll(ladder).toBe(36 * 24);
  await expect.poll(heatmap).toBe(36 * 24);
});

test("at the end of the day, Play starts again from the beginning", async ({ page }) => {
  // A start time past the end is clamped to the end.
  await open(page, Number.MAX_SAFE_INTEGER);
  const grid = page.locator("main.grid");
  const end = await clockSeconds(page);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(grid).toHaveAttribute("data-state", "ended");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(grid).toHaveAttribute("data-state", "playing");
  await expect.poll(() => clockSeconds(page)).toBeLessThan(end - 3600);
});

test("a start time that is not a number, or before the day, opens at the first message", async ({ page }) => {
  await open(page, 0);
  const first = await page.locator(".stoa-slider__output").textContent();
  for (const at of ["ten", "Infinity", -5e9]) {
    await open(page, at);
    await expect(page.locator(".stoa-slider__output")).toHaveText(first!);
    await expect(page.locator(".stoa-ladder figcaption")).toHaveText("The book is empty.");
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 412, height: 823 } });

  test("no text is smaller than 12px", async ({ page }) => {
    await open(page);
    await expect(page.locator(".stoa-statbar")).toContainText("frames/s");
    const small = await page.evaluate(() => {
      const found: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || !node.textContent?.trim() || !el.checkVisibility()) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 12) found.push(`${el.className || el.tagName}: ${size}px "${node.textContent.trim().slice(0, 30)}"`);
      }
      return found;
    });
    expect(small).toEqual([]);
  });
});
