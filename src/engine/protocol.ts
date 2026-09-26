// Messages between the UI thread and the replay worker.

export type ToWorker =
  | { kind: "load"; url: string; symbol: string }
  | { kind: "seek"; id: number; time: number; depth: number; tradesFrom: number };

export type FromWorker =
  | { kind: "loaded"; duration: number; startEpochMs: number; messages: number; loadMs: number; bytes: number }
  | { kind: "error"; message: string }
  | {
      kind: "state";
      id: number;
      time: number;
      /** [bids, asks, then price,size pairs: bids best-first, asks best-first] */
      levels: Float64Array;
      /** [time, price, size, side] per execution since tradesFrom */
      trades: Float64Array;
      applied: number;
      orders: number;
      seekMs: number;
    };
