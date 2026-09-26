// The replay engine (tyche-market compiled to WebAssembly) runs here, off
// the UI thread. The UI asks for the book at a time; the latest request
// wins, because the UI only sends a new one after the previous answer.
import init, { TycheReplay } from "tyche-market";
import type { FromWorker, HeatmapResult, ToWorker } from "./protocol";

let replay: TycheReplay | null = null;
const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

async function load(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cannot load ${url}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Captures ship gzipped (.tycz). Decide by the gzip magic, not by the
  // name or headers: some servers inflate on the way, some do not.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(inflated).arrayBuffer());
  }
  return bytes;
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
      let heatmap: HeatmapResult | undefined;
      const transfer: Transferable[] = [levels.buffer, trades.buffer];
      const mid = replay.mid();
      if (msg.heatmap && Number.isFinite(mid)) {
        const h = msg.heatmap;
        const t1 = performance.now();
        const top = Math.round(mid / h.tick) * h.tick + (h.rows / 2) * h.tick;
        const cells = new Float32Array(replay.heatmap(Math.max(0, msg.time - h.window), msg.time, h.columns, top, h.tick, h.rows));
        heatmap = { cells, columns: h.columns, rows: h.rows, top, tick: h.tick, ms: performance.now() - t1 };
        transfer.push(cells.buffer);
      }
      post({ kind: "state", time: msg.time, levels, trades, heatmap, applied, orders: replay.orderCount(), seekMs }, transfer);
    }
  } catch (err) {
    post({ kind: "error", message: String(err) });
  }
};
