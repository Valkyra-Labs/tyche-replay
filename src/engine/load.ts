// Getting a capture into the engine: download, then inflate a gzipped one,
// both with a size limit, so a capture of any size (or a small gzip that
// inflates to gigabytes) stops with a clear reason instead of filling the
// tab's memory first.
import type { FailureReason, LimitCode } from "./protocol";

/** The largest capture the page accepts, downloaded or inflated: the
 * engine's own default limit, about twice the largest day measured. */
export const MAX_CAPTURE_BYTES = 256 * 2 ** 20;

/** A download or an inflated capture went past `max` bytes. */
export class TooLarge extends Error {
  constructor(readonly max: number) {
    // In the engine's words, so the page shows it as it shows the engine's.
    super(`capture_too_large: more than ${max} bytes in the capture`);
  }
}

/** Bytes so far and the total (null when the server does not say). */
export type OnProgress = (loaded: number, total: number | null) => void;

/** Read `stream` to the end, at most `max` bytes. */
async function readAll(stream: ReadableStream<Uint8Array>, max: number, onChunk: (loaded: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    if (loaded > max) {
      await reader.cancel();
      throw new TooLarge(max);
    }
    chunks.push(value);
    onChunk(loaded);
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The body of `res`, at most `max` bytes, reporting progress as it comes.
 * A Content-Length over `max` is refused before the body is read. The total
 * is the Content-Length when the body is sent as is (not re-encoded on the
 * way, which would make the length count other bytes). */
export async function download(res: Response, max: number, onProgress: OnProgress): Promise<Uint8Array<ArrayBuffer>> {
  const length = Number(res.headers.get("content-length") ?? NaN);
  const total = Number.isFinite(length) && !res.headers.get("content-encoding") ? length : null;
  if (total !== null && total > max) {
    await res.body?.cancel();
    throw new TooLarge(max);
  }
  if (!res.body) return new Uint8Array(0);
  onProgress(0, total);
  return readAll(res.body, max, (loaded) => onProgress(loaded, total));
}

/** `bytes` inflated when they are gzipped (decided by the gzip magic, not
 * by a name or a header: some servers inflate on the way, some do not),
 * stopping as soon as the output passes `max` bytes. */
export async function inflate(bytes: Uint8Array<ArrayBuffer>, max: number): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return readAll(stream, max, () => {});
}

const LIMIT_CODES: readonly LimitCode[] = ["capture_too_large", "too_many_messages", "too_many_levels", "too_many_orders"];

/** Why the engine refused a capture, from its message, which begins with a
 * code: a limit the page explains in its language, or any other message,
 * shown as the engine's own detail. */
export function engineFailure(detail: string): FailureReason {
  const code = LIMIT_CODES.find((c) => detail.startsWith(`${c}:`));
  return code ? { kind: "limit", code, detail } : { kind: "engine", detail };
}
