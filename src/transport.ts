// Discrete playback states. The clock itself is a number updated every
// frame outside the machine; the machine decides whether it moves.
import { assign, setup } from "xstate";

export const SPEEDS = [1, 10, 60, 600] as const;
export type Speed = (typeof SPEEDS)[number];

/** What failed: loading the capture, or the engine after it had loaded. */
export type Failure = { during: "load" | "playback"; message: string };

export const transport = setup({
  types: {
    context: {} as { speed: Speed; error: Failure | null },
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
    FAILED: { target: ".failed", actions: assign({ error: ({ event }) => ({ during: "playback", message: event.message }) }) },
  },
  states: {
    loading: {
      on: {
        LOADED: "paused",
        FAILED: { target: "failed", actions: assign({ error: ({ event }) => ({ during: "load", message: event.message }) }) },
      },
    },
    paused: { on: { PLAY: "playing", TOGGLE: "playing" } },
    playing: { on: { PAUSE: "paused", TOGGLE: "paused", ENDED: "ended" } },
    // At the end, play starts again from the beginning; a seek makes it
    // playable where it is.
    ended: { on: { PLAY: "playing", TOGGLE: "playing", SEEK: "paused" } },
    // Retry loads the capture again in a new worker. A later report from
    // the failed worker replaces the message, not the stage it failed in.
    failed: {
      on: {
        RETRY: { target: "loading", actions: assign({ error: null }) },
        FAILED: { actions: assign({ error: ({ context, event }) => ({ during: context.error!.during, message: event.message }) }) },
      },
    },
  },
});
