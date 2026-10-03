// Discrete playback states. The clock itself is a number updated every
// frame outside the machine; the machine decides whether it moves.
import { assign, setup } from "xstate";

export const SPEEDS = [1, 10, 60, 600] as const;
export type Speed = (typeof SPEEDS)[number];

export const transport = setup({
  types: {
    context: {} as { speed: Speed; error: string | null },
    events: {} as
      | { type: "LOADED" }
      | { type: "FAILED"; message: string }
      | { type: "PLAY" }
      | { type: "PAUSE" }
      | { type: "TOGGLE" }
      | { type: "ENDED" }
      | { type: "SEEK" }
      | { type: "SPEED"; speed: Speed }
      | { type: "RETRY" },
  },
}).createMachine({
  id: "transport",
  initial: "loading",
  context: { speed: 10, error: null },
  on: {
    SPEED: { actions: assign({ speed: ({ event }) => event.speed }) },
    // The worker can fail after the load too (a crash, a seek error); the
    // replay cannot go on from an engine in an unknown state.
    FAILED: { target: ".failed", actions: assign({ error: ({ event }) => event.message }) },
  },
  states: {
    loading: { on: { LOADED: "paused" } },
    paused: { on: { PLAY: "playing", TOGGLE: "playing" } },
    playing: { on: { PAUSE: "paused", TOGGLE: "paused", ENDED: "ended" } },
    // At the end, play starts again from the beginning; a seek makes it
    // playable where it is.
    ended: { on: { PLAY: "playing", TOGGLE: "playing", SEEK: "paused" } },
    // Retry loads the capture again in a new worker.
    failed: { on: { RETRY: { target: "loading", actions: assign({ error: null }) } } },
  },
});
