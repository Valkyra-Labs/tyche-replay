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
      const res = await fetch(msg.url);
      if (!res.ok) throw new Error(`cannot load ${msg.url}: ${res.status}`);
      let bytes = new Uint8Array(await res.arrayBuffer());
      // Captures ship gzipped (.tycz). Decide by the gzip magic, not by the
      // name or headers: some servers inflate on the way, some do not.
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(inflated).arrayBuffer());
      }
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
