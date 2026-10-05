# Tyche Replay

[![CI](https://github.com/Valkyra-Labs/tyche-replay/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Valkyra-Labs/tyche-replay/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![Unit tests (no capture)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Valkyra-Labs/tyche-replay/badges/unit-tests.json)](#badges)
[![e2e (no capture)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Valkyra-Labs/tyche-replay/badges/e2e.json)](#badges)
[![Bundle gzip](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Valkyra-Labs/tyche-replay/badges/bundle-size.json)](#badges)

The test and size badges are measured and published by CI from `main`.
CI has no capture of a trading day, so the test badges count only the
tests that need none; see [Badges](#badges).

Replay a trading day of IEX market data in the browser: the order book
rebuilt order by order, the trades, at any speed and any moment.

The engine is [tyche-market](https://github.com/Valkyra-Labs/tyche-market)
(Rust, compiled to WebAssembly, running in a Web Worker); the interface
is React and TypeScript on the [Stoa](https://github.com/Valkyra-Labs/stoa-system)
design system. Everything runs in the browser; there is no server.

Status: early. Performance record (load, frame rate and worker cost
under a named load, with stamps): [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md).
While a capture loads the page says so; a failure says why, with a
retry; before the first message the views say they are empty. A capture
over 256 MiB, as downloaded or once inflated, or past the engine's
limits on messages and book depth, is refused with that reason rather
than filling the tab's memory.

The playback controls and the performance counters sit under the
header, so they stay put while the views below fill up. The header has
a Shortcuts button (or press `?`) that lists the keyboard shortcuts
(the space bar plays and pauses), a light and dark theme switch (it
follows the system until one is picked) and an English and Arabic
language switch; Arabic is right to
left, with Arabic-Indic digits in the book, the heatmap, the trades and
the clock.

The liquidity heatmap shows the last ten minutes in 240 columns of
2.5 s, each the displayed book at the end of its slice, the newest at
the clock; its 80 rows are prices a cent apart around the current
midpoint, the same prices for every column. Bids are drawn in the bid
colour and asks in the ask colour. When the spread is wider than the
80 cents (as at 10:00:00 on the AAPL day), the newest column is empty
while the ladder still shows the book.

## Development

Stoa and the engine are linked from sibling checkouts: clone
[stoa-system](https://github.com/Valkyra-Labs/stoa-system) and build it
(`pnpm build`), and clone tyche-market and build its WebAssembly package
into `pkg/` with wasm-pack, next to this repository.

```bash
pnpm install
pnpm dev
pnpm test && pnpm e2e
```

The app loads AAPL from `public/data/20260924_AAPL_deepplus.tycz` by
default (produce it with `tyche extract --symbols AAPL -o
20260924_AAPL_deepplus.tyc`, see tyche-market, and gzip it to `.tycz`);
`?symbol=SPY&data=PATH&at=NS` overrides the symbol, the capture and the
start time (the capture only from this site's own `data/` folder: a
path elsewhere, or another site's address, loads the default instead); `?theme=light|dark` and `?lang=en|ar` set the theme and the
language (the switches keep them there, and the theme in localStorage
too). The unit tests check the heatmap against the engine on the same
AAPL capture, so `pnpm test` needs it too.

The full suites, with the capture in `public/data/`:

```bash
pnpm test && pnpm e2e
```

`pnpm e2e` drives the dev server on 5174 and reuses one already running
there; `E2E_PORT` moves it to another port, and `E2E_PREVIEW=1` tests
the production build (after `pnpm build`) through `vite preview`.
Without a capture, `pnpm test:no-capture` runs the unit tests but the
heatmap's, and `pnpm e2e:no-capture` the e2e tests tagged `@no-capture`;
that is what CI runs.

### Badges

CI checks out this repository, stoa-system and tyche-market side by side,
builds the engine with wasm-pack (`--no-default-features --features
wasm`) and Stoa, then builds and tests the app. It does not download a
capture, so it runs only the tests that need none. Each green run on
`main` publishes the dynamic badges to the `badges` branch, as JSON that
img.shields.io reads; `scripts/badges.mjs` builds them from that run's
own output and stops, publishing nothing, when a value cannot be read.

- Unit tests (no capture): Vitest tests passed in `pnpm test:no-capture`,
  every unit test but the heatmap's, which replays the AAPL capture.
- e2e (no capture): Playwright tests passed in Chromium against `vite
  preview` of the build, only those tagged `@no-capture` (a failed load
  explained in Arabic, with an axe check; the IEX terms in the footer).
  The rest replay the AAPL day and run locally with the capture.
- Bundle gzip: every JavaScript and CSS file in `dist/`, gzip level 9,
  summed. The engine's WebAssembly and the fonts are not included.

There is no Lighthouse badge: without a capture the page shows only its
loading error, not the replay a visitor sees.

## Data

Data provided for free by IEX. By accessing or using IEX Historical Data,
you agree to the IEX Historical Data Terms of Use
(https://www.iex.io/legal/hist-data-terms).

## License

MIT OR Apache-2.0, at your option.
