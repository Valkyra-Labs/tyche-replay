// The replay engine (tyche-market compiled to WebAssembly) runs here, off
// the UI thread. The UI asks for the book at a time; the latest request
// wins, because the UI only sends a new one after the previous answer.
import init, { TycheReplay } from "tyche-market";
import type { FromWorker, ToWorker } from "./protocol";

let replay: TycheReplay | null = null;
const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.kind === "load") {
      const t0 = performance.now();
      await init();
      const bytes = new Uint8Array(await (await fetch(msg.url)).arrayBuffer());
      replay?.free();
      replay = new TycheReplay(bytes, msg.symbol);
      post({
        kind: "loaded",
        duration: replay.duration(),
        startEpochMs: replay.startEpochMs(),
        messages: replay.messageCount(),
        loadMs: performance.now() - t0,
        bytes: bytes.byteLength,
      });
    } else if (msg.kind === "seek" && replay) {
      const t0 = performance.now();
      const applied = replay.seek(msg.time);
      const levels = new Float64Array(replay.levels(msg.depth));
      const trades = new Float64Array(replay.executions(msg.tradesFrom, msg.time));
      post(
        {
          kind: "state",
          id: msg.id,
          time: msg.time,
          levels,
          trades,
          applied,
          orders: replay.orderCount(),
          seekMs: performance.now() - t0,
        },
        [levels.buffer, trades.buffer],
      );
    }
  } catch (err) {
    post({ kind: "error", message: String(err) });
  }
};
