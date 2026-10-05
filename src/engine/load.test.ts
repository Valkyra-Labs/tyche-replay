import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { download, engineFailure, inflate, TooLarge } from "./load";

/** A response whose body arrives in `chunks`, with a Content-Length when
 * `length` is given. */
function response(chunks: Uint8Array[], length?: number): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else controller.close();
    },
  });
  const headers = length === undefined ? undefined : { "content-length": String(length) };
  return new Response(body, { headers });
}

const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);

describe("download", () => {
  it("reads the whole body and reports progress against Content-Length", async () => {
    const seen: [number, number | null][] = [];
    const got = await download(response([bytes(300), bytes(300), bytes(400)], 1000), 10_000, (loaded, total) => seen.push([loaded, total]));
    expect(got.byteLength).toBe(1000);
    expect(seen.at(-1)).toEqual([1000, 1000]);
    for (const [loaded, total] of seen) expect(loaded).toBeLessThanOrEqual(total!);
  });

  it("reports no total when the server sends no length", async () => {
    const seen: (number | null)[] = [];
    await download(response([bytes(10)]), 10_000, (_, total) => seen.push(total));
    expect(seen.every((t) => t === null)).toBe(true);
  });

  it("refuses a body announced larger than the limit without reading it", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(bytes(10));
      },
    });
    const res = new Response(body, { headers: { "content-length": "2000" } });
    await expect(download(res, 1000, () => {})).rejects.toEqual(new TooLarge(1000));
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("stops a body that grows past the limit without a length", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(bytes(100));
      },
    });
    await expect(download(new Response(body), 1000, () => {})).rejects.toBeInstanceOf(TooLarge);
    expect(pulled).toBeLessThan(20);
  });
});

describe("inflate", () => {
  it("passes a capture that is not gzipped through", async () => {
    const raw = new TextEncoder().encode("TYCHECAP");
    expect(await inflate(raw, 100)).toEqual(raw);
  });

  it("inflates a gzipped capture", async () => {
    const raw = bytes(5000, 7);
    expect(await inflate(new Uint8Array(gzipSync(raw)), 5000)).toEqual(raw);
  });

  it("stops inflating as soon as the output passes the limit", async () => {
    // 64 MiB of zeros in about 64 KB: a bomb against a 1 MiB limit.
    const bomb = new Uint8Array(gzipSync(new Uint8Array(64 << 20)));
    expect(bomb.byteLength).toBeLessThan(100_000);
    await expect(inflate(bomb, 1 << 20)).rejects.toEqual(new TooLarge(1 << 20));
  });
});

describe("engineFailure", () => {
  it("reads the engine's limit codes", () => {
    expect(engineFailure("too_many_orders: more than 10000 orders on the book at once")).toEqual({
      kind: "limit",
      code: "too_many_orders",
      detail: "too_many_orders: more than 10000 orders on the book at once",
    });
    for (const code of ["capture_too_large", "too_many_messages", "too_many_levels"] as const)
      expect(engineFailure(`${code}: more than 1 thing`)).toMatchObject({ kind: "limit", code });
  });

  it("keeps any other message as the engine's own detail", () => {
    expect(engineFailure("format: not a tyche capture")).toEqual({ kind: "engine", detail: "format: not a tyche capture" });
    expect(engineFailure("too_many_ponies: more than 3")).toEqual({ kind: "engine", detail: "too_many_ponies: more than 3" });
  });
});
