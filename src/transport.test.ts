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
    a.send({ type: "FAILED", message: "404" });
    a.send({ type: "PLAY" });
    expect(a.getSnapshot().value).toBe("failed");
    expect(a.getSnapshot().context.error).toBe("404");
  });
});
