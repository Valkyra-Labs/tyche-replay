import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { transport } from "./transport";

describe("transport", () => {
  it("cannot play before the day is loaded, and toggles after", () => {
    const a = createActor(transport).start();
    a.send({ type: "PLAY" });
    expect(a.getSnapshot().value).toBe("loading");
    a.send({ type: "LOADED" });
    a.send({ type: "TOGGLE" });
    expect(a.getSnapshot().value).toBe("playing");
    a.send({ type: "TOGGLE" });
    expect(a.getSnapshot().value).toBe("paused");
  });

  it("stops at the end and keeps the speed across states", () => {
    const a = createActor(transport).start();
    a.send({ type: "LOADED" });
    a.send({ type: "SPEED", speed: 600 });
    a.send({ type: "PLAY" });
    a.send({ type: "ENDED" });
    expect(a.getSnapshot().value).toBe("ended");
    expect(a.getSnapshot().context.speed).toBe(600);
  });

  it("reports a load failure and stays there", () => {
    const a = createActor(transport).start();
    a.send({ type: "FAILED", reason: { kind: "http", status: 404 } });
    a.send({ type: "PLAY" });
    expect(a.getSnapshot().value).toBe("failed");
    expect(a.getSnapshot().context.error).toEqual({ during: "load", reason: { kind: "http", status: 404 } });
  });

  it("fails from any state, and a retry loads again with the speed kept", () => {
    const a = createActor(transport).start();
    a.send({ type: "LOADED" });
    a.send({ type: "SPEED", speed: 60 });
    a.send({ type: "PLAY" });
    a.send({ type: "FAILED", reason: { kind: "stopped" } });
    expect(a.getSnapshot().value).toBe("failed");
    expect(a.getSnapshot().context.error).toEqual({ during: "playback", reason: { kind: "stopped" } });
    a.send({ type: "RETRY" });
    expect(a.getSnapshot().value).toBe("loading");
    expect(a.getSnapshot().context.error).toBeNull();
    expect(a.getSnapshot().context.speed).toBe(60);
    a.send({ type: "LOADED" });
    expect(a.getSnapshot().value).toBe("paused");
  });

  it("a failure while paused or at the end is a playback failure", () => {
    for (const end of [false, true]) {
      const a = createActor(transport).start();
      a.send({ type: "LOADED" });
      if (end) {
        a.send({ type: "PLAY" });
        a.send({ type: "ENDED" });
      }
      a.send({ type: "FAILED", reason: { kind: "engine", detail: "seek failed" } });
      expect(a.getSnapshot().context.error).toEqual({ during: "playback", reason: { kind: "engine", detail: "seek failed" } });
    }
  });

  it("a second report keeps the stage of the failure", () => {
    const a = createActor(transport).start();
    a.send({ type: "FAILED", reason: { kind: "http", status: 404 } });
    a.send({ type: "FAILED", reason: { kind: "stopped" } });
    expect(a.getSnapshot().value).toBe("failed");
    expect(a.getSnapshot().context.error).toEqual({ during: "load", reason: { kind: "stopped" } });
  });

  it("a failure after a retry is a load failure again until the load ends", () => {
    const a = createActor(transport).start();
    a.send({ type: "LOADED" });
    a.send({ type: "FAILED", reason: { kind: "stopped" } });
    a.send({ type: "RETRY" });
    a.send({ type: "FAILED", reason: { kind: "http", status: 500 } });
    expect(a.getSnapshot().context.error).toEqual({ during: "load", reason: { kind: "http", status: 500 } });
  });

  it("retries only after a failure", () => {
    const a = createActor(transport).start();
    a.send({ type: "RETRY" });
    expect(a.getSnapshot().value).toBe("loading");
    a.send({ type: "LOADED" });
    a.send({ type: "RETRY" });
    expect(a.getSnapshot().value).toBe("paused");
  });
});
