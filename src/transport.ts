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
      | { type: "SPEED"; speed: Speed },
  },
}).createMachine({
  id: "transport",
  initial: "loading",
  context: { speed: 10, error: null },
  on: { SPEED: { actions: assign({ speed: ({ event }) => event.speed }) } },
  states: {
    loading: {
      on: {
        LOADED: "paused",
        FAILED: { target: "failed", actions: assign({ error: ({ event }) => event.message }) },
      },
    },
    paused: { on: { PLAY: "playing", TOGGLE: "playing" } },
    playing: { on: { PAUSE: "paused", TOGGLE: "paused", ENDED: "ended" } },
    // At the end, play starts again from the beginning; a seek makes it
    // playable where it is.
    ended: { on: { PLAY: "playing", TOGGLE: "playing", SEEK: "paused" } },
    failed: {},
  },
});
