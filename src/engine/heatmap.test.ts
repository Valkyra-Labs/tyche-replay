// The heatmap checked against the book it draws: the engine (the same
// WebAssembly the app runs) on the real AAPL capture, in the frame the
// worker asks for. Needs the capture in public/data (see the README).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync, TycheReplay } from "tyche-market";
import { stoaFormat } from "@valkyra-labs/stoa-react";
import { HEATMAP, heatmapFrame } from "./heatmap";

const CAPTURE = new URL("../../public/data/20260924_AAPL_deepplus.tycz", import.meta.url);
// 10:00 ET in ns after AAPL's first message of the day (as in the e2e tests).
const TEN_AM = 10_335_395_000_000;
const SECOND = 1e9;

type Level = { price: number; size: number };
type Book = { bids: Level[]; asks: Level[] };

let replay: TycheReplay;

beforeAll(() => {
  const pkg = dirname(createRequire(import.meta.url).resolve("tyche-market"));
  initSync({ module: readFileSync(join(pkg, "tyche_market_bg.wasm")) });
  replay = new TycheReplay(gunzipSync(readFileSync(CAPTURE)), "AAPL");
});

/** The whole book at `time`, both sides best first, in dollars. */
function bookAt(time: number): Book {
  replay.seek(time);
  const flat = replay.levels(1_000_000);
  const bids = flat[0]!;
  const asks = flat[1]!;
  const side = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ price: flat[from + 2 * i]!, size: flat[from + 2 * i + 1]! }));
  return { bids: side(2, bids), asks: side(2 + 2 * bids, asks) };
}

/** The heatmap the worker sends at `time`, as the app hands it to Stoa. */
function heatmapAt(time: number) {
  replay.seek(time);
  const { from, to, top } = heatmapFrame(time, replay.mid(), HEATMAP);
  const cells = replay.heatmap(from, to, HEATMAP.columns, top, HEATMAP.tick, HEATMAP.rows);
  return { from, to, top, cells };
}

/** Prices in whole hundredths of a cent, as the engine keeps them. */
const units = (dollars: number) => Math.round(dollars * 10_000);

/** What a column must hold for `book`: each level inside the rows at its
 * row, bids positive and asks negative, and nothing anywhere else. */
function expectedColumn(book: Book, top: number): number[] {
  const column = new Array<number>(HEATMAP.rows).fill(0);
  const tick = units(HEATMAP.tick);
  for (const [levels, sign] of [
    [book.bids, 1],
    [book.asks, -1],
  ] as const) {
    for (const { price, size } of levels) {
      const row = (units(top) - units(price)) / tick;
      if (Number.isInteger(row) && row >= 0 && row < HEATMAP.rows) column[row] = sign * size;
    }
  }
  return column;
}

const column = (cells: ArrayLike<number>, c: number) =>
  Array.from(cells).slice(c * HEATMAP.rows, (c + 1) * HEATMAP.rows);

describe("the liquidity heatmap", () => {
  it("has the book now in its newest column, at the prices of the rows", () => {
    // 10:06: three bid and six ask levels lie inside the 80 rows.
    const time = TEN_AM + 360 * SECOND;
    const book = bookAt(time);
    const { top, cells } = heatmapAt(time);
    const newest = column(cells, HEATMAP.columns - 1);
    expect(newest).toEqual(expectedColumn(book, top));

    const bestBid = book.bids[0]!.price;
    const bestAsk = book.asks[0]!.price;
    const filled = newest.flatMap((v, row) => (v === 0 ? [] : [{ v, price: (units(top) - row * units(HEATMAP.tick)) / 10_000 }]));
    expect(filled.filter((f) => f.v > 0).length).toBe(3);
    expect(filled.filter((f) => f.v < 0).length).toBe(6);
    for (const f of filled) {
      if (f.v > 0) expect(f.price).toBeLessThanOrEqual(bestBid);
      else expect(f.price).toBeGreaterThanOrEqual(bestAsk);
    }
    // The best bid and ask themselves are drawn, with their sizes.
    expect(filled).toContainEqual({ v: book.bids[0]!.size, price: bestBid });
    expect(filled).toContainEqual({ v: -book.asks[0]!.size, price: bestAsk });
  });

  it("puts the midpoint, rounded to a cent, in the middle row", () => {
    const time = TEN_AM + 360 * SECOND;
    replay.seek(time);
    const mid = replay.mid();
    const { top } = heatmapAt(time);
    expect(units(top) - (HEATMAP.rows / 2) * units(HEATMAP.tick)).toBe(Math.round(mid * 100) * 100);
  });

  it("labels the top and bottom rows with their own prices", () => {
    const { top } = heatmapAt(TEN_AM + 360 * SECOND);
    // Stoa's labels: top, and top - tick * (rows - 1), to two decimals.
    const format = stoaFormat("en-US");
    const topLabel = format.decimal(top, 2);
    const bottomLabel = format.decimal(top - HEATMAP.tick * (HEATMAP.rows - 1), 2);
    // The engine's prices of row 0 and row 79 (it rounds top and tick to
    // hundredths of a cent).
    const row = (r: number) => (units(top) - r * units(HEATMAP.tick)) / 10_000;
    expect(topLabel).toBe(format.decimal(row(0), 2));
    expect(bottomLabel).toBe(format.decimal(row(HEATMAP.rows - 1), 2));
    expect(units(row(0)) - units(row(HEATMAP.rows - 1))).toBe(79 * 100);
  });

  it("samples column c at the end of its slice, the newest at the clock", () => {
    const time = TEN_AM + 360 * SECOND;
    const { from, to, top, cells } = heatmapAt(time);
    expect(to).toBe(time);
    expect(to - from).toBe(HEATMAP.window);
    const slice = HEATMAP.window / HEATMAP.columns;
    for (const c of [0, 1, 60, 119, 200, HEATMAP.columns - 2, HEATMAP.columns - 1]) {
      expect(column(cells, c), `column ${c}`).toEqual(expectedColumn(bookAt(from + slice * (c + 1)), top));
    }
  });

  it("leaves the newest column empty when the spread is wider than the rows", () => {
    // At 10:00:00 the best bid is 334.55 and the best ask 337.68: every
    // level of the book is outside the 80 cents around the midpoint.
    const book = bookAt(TEN_AM);
    const { top, cells } = heatmapAt(TEN_AM);
    expect(book.bids[0]!.price).toBe(334.55);
    expect(book.asks[0]!.price).toBe(337.68);
    expect(expectedColumn(book, top).every((v) => v === 0)).toBe(true);
    expect(column(cells, HEATMAP.columns - 1).every((v) => v === 0)).toBe(true);
    // The older columns still hold the liquidity of their own moments.
    expect(Array.from(cells).some((v) => v !== 0)).toBe(true);
  });
});
