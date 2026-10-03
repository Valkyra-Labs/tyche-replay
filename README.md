# Tyche Replay

Replay a trading day of IEX market data in the browser: the order book
rebuilt order by order, the trades, at any speed and any moment.

The engine is [tyche-market](https://github.com/Valkyra-Labs/tyche-market)
(Rust, compiled to WebAssembly, running in a Web Worker); the interface
is React and TypeScript on the [Stoa](https://github.com/Valkyra-Labs/stoa-system)
design system. Everything runs in the browser; there is no server.

Status: early. Performance record (load, frame rate and worker cost
under a named load, with stamps): [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md).
While a capture loads the page says so; a failure says why, with a
retry; before the first message the views say they are empty.

The playback controls and the performance counters sit under the
header, so they stay put while the views below fill up. The header has
a light and dark theme switch (it follows the system until one is
picked) and an English and Arabic language switch; Arabic is right to
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
`?symbol=SPY&data=URL&at=NS` overrides the symbol, the capture and the
start time; `?theme=light|dark` and `?lang=en|ar` set the theme and the
language (the switches keep them there, and the theme in localStorage
too). The unit tests check the heatmap against the engine on the same
AAPL capture, so `pnpm test` needs it too.

## Data

Data provided for free by IEX. By accessing or using IEX Historical Data,
you agree to the IEX Historical Data Terms of Use
(https://www.iex.io/legal/hist-data-terms).

## License

MIT OR Apache-2.0, at your option.
