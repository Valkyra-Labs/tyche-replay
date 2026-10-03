// Where the liquidity heatmap sits in time and price: the worker asks the
// engine for this frame, and the tests check the engine's answer in it.
import type { HeatmapRequest } from "./protocol";

/** What the app shows: the last 10 minutes in 240 columns (2.5 s each),
 * and 80 rows a cent apart. */
export const HEATMAP: HeatmapRequest = { window: 600e9, columns: 240, rows: 80, tick: 0.01 };

export type HeatmapFrame = {
  /** The time span is `(from, to]`, in ns after the first message. */
  from: number;
  to: number;
  /** Price of the top row, in dollars; the rows go down in steps of the
   * request's tick. */
  top: number;
};

/** The heatmap at `time` with the book's midpoint at `mid`: the whole
 * window ending at `time`, and the rows placed so that the midpoint,
 * rounded to a tick, is row `rows / 2`. Every column is sampled at the
 * same prices, so the price axis holds for the older columns too.
 *
 * In the first minutes of a capture the window starts before the first
 * message, and the engine leaves those columns empty: a column is always
 * window / columns long. (Cut at the first message, the window spread
 * the minutes there were across the whole width.) */
export function heatmapFrame(time: number, mid: number, h: HeatmapRequest): HeatmapFrame {
  const top = Math.round(mid / h.tick) * h.tick + (h.rows / 2) * h.tick;
  return { from: time - h.window, to: time, top };
}
