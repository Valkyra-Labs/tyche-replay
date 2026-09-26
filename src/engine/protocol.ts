// Messages between the UI thread and the replay worker.

export type HeatmapRequest = { window: number; columns: number; rows: number; tick: number };

export type ToWorker =
  | { kind: "load"; url: string; symbol: string }
  | { kind: "seek"; time: number; depth: number; tradesFrom: number; heatmap?: HeatmapRequest };

export type HeatmapResult = { cells: Float32Array; columns: number; rows: number; top: number; tick: number; ms: number };

export type FromWorker =
  | { kind: "loaded"; duration: number; startEpochMs: number; messages: number; loadMs: number; bytes: number }
  | { kind: "error"; message: string }
  | {
      kind: "state";
      time: number;
      /** [bids, asks, then price,size pairs: bids best-first, asks best-first] */
      levels: Float64Array;
      /** [time, price, size, side] per execution since tradesFrom */
      trades: Float64Array;
      heatmap?: HeatmapResult;
      applied: number;
      orders: number;
      seekMs: number;
    };
