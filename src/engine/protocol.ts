// Messages between the UI thread and the replay worker.

export type HeatmapRequest = { window: number; columns: number; rows: number; tick: number };

export type ToWorker =
  | { kind: "load"; url: string; symbol: string }
  | { kind: "seek"; time: number; depth: number; tradesFrom: number; heatmap?: HeatmapRequest };

export type HeatmapResult = { cells: Float32Array; columns: number; rows: number; top: number; tick: number; ms: number };

/** What a capture was too large in: its bytes (downloaded or inflated),
 * the symbol's messages, or the depth of its book. The engine's codes. */
export type LimitCode = "capture_too_large" | "too_many_messages" | "too_many_levels" | "too_many_orders";

/** Why the replay failed, for the interface to say in its language: the
 * server's answer to the download, the worker stopping or sending what
 * cannot be read, a capture past a size limit, or the engine's own message
 * (in English, shown as a detail). */
export type FailureReason =
  | { kind: "http"; status: number }
  | { kind: "stopped"; detail?: string }
  | { kind: "unreadable" }
  | { kind: "limit"; code: LimitCode; detail: string }
  | { kind: "engine"; detail: string };

/** Where a load is: fetching the capture, then inflating and indexing it. */
export type LoadStage = "downloading" | "decoding";

export type FromWorker =
  | { kind: "progress"; stage: LoadStage }
  | { kind: "loaded"; duration: number; startEpochMs: number; messages: number; loadMs: number; bytes: number }
  | { kind: "error"; reason: FailureReason }
  | {
      kind: "state";
      time: number;
      /** [bids, asks, then price,size pairs: bids best-first, asks best-first] */
      levels: Float64Array;
      /** [time, price, size, side] per execution since tradesFrom */
      trades: Float64Array;
      /** Absent when not asked for; null when asked for but there is no
       * midpoint to centre it on (one side of the book is empty). */
      heatmap?: HeatmapResult | null;
      applied: number;
      orders: number;
      seekMs: number;
    };
