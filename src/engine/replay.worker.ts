// The replay engine (tyche-market compiled to WebAssembly) runs here, off
// the UI thread. The UI asks for the book at a time; the latest request
// wins, because the UI only sends a new one after the previous answer.
import init, { TycheReplay } from "tyche-market";
import { heatmapFrame } from "./heatmap";
import { download, engineFailure, inflate, MAX_CAPTURE_BYTES, TooLarge } from "./load";
import type { FromWorker, HeatmapResult, ToWorker } from "./protocol";

let replay: TycheReplay | null = null;

/** The server answered the download with an error status. */
class HttpStatus extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}
const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

async function load(url: string): Promise<Uint8Array<ArrayBuffer>> {
  post({ kind: "progress", stage: "downloading" });
  const res = await fetch(url);
  if (!res.ok) throw new HttpStatus(res.status);
  // A message per percent at most (or per 256 KB without a total), not
  // per chunk.
  let shown = -Infinity;
  const bytes = await download(res, MAX_CAPTURE_BYTES, (loaded, total) => {
    const step = total ? total / 100 : 256 * 1024;
    if (loaded - shown < step && loaded !== total) return;
    shown = loaded;
    post({ kind: "progress", stage: "downloading", loaded, total });
  });
  post({ kind: "progress", stage: "decoding" });
  // Captures ship gzipped (.tycz).
  return inflate(bytes, MAX_CAPTURE_BYTES);
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.kind === "load") {
      const t0 = performance.now();
      await init();
      const bytes = await load(msg.url);
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
      const seekMs = performance.now() - t0;
      let heatmap: HeatmapResult | null | undefined;
      const transfer: Transferable[] = [levels.buffer, trades.buffer];
      const mid = replay.mid();
      if (msg.heatmap && !Number.isFinite(mid)) {
        heatmap = null;
      } else if (msg.heatmap) {
        const h = msg.heatmap;
        const t1 = performance.now();
        const { from, to, top } = heatmapFrame(msg.time, mid, h);
        const cells = new Float32Array(replay.heatmap(from, to, h.columns, top, h.tick, h.rows));
        heatmap = { cells, columns: h.columns, rows: h.rows, top, tick: h.tick, ms: performance.now() - t1 };
        transfer.push(cells.buffer);
      }
      post({ kind: "state", time: msg.time, levels, trades, heatmap, applied, orders: replay.orderCount(), seekMs }, transfer);
    }
  } catch (err) {
    post({
      kind: "error",
      reason:
        err instanceof HttpStatus
          ? { kind: "http", status: err.status }
          : err instanceof TooLarge
            ? { kind: "limit", code: "capture_too_large", detail: err.message }
            : engineFailure(err instanceof Error ? err.message : String(err)),
    });
  }
};
