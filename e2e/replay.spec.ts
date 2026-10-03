// End-to-end checks on a real day (AAPL, 2026-09-24): the replay moves at
// the chosen speed, the controls work with a real mouse and keyboard, and
// axe finds no serious accessibility violations.
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// 10:00 ET is this many ns after AAPL's first message of the day.
const TEN_AM = 10_335_389_000_000;

async function open(page: Page, at = TEN_AM) {
  await page.goto(`/?symbol=AAPL&data=/data/20260924_AAPL_deepplus.tycz&at=${at}`);
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
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

test("the book is described in text for screen readers", async ({ page }) => {
  await open(page);
  await expect(page.locator("figcaption").first()).toContainText(/best bid \d+\.\d\d for [\d,]+, best ask/);
});

test("no serious or critical axe violations", async ({ page }) => {
  await open(page);
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
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
