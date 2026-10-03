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
start time.

## Data

Data provided for free by IEX. By accessing or using IEX Historical Data,
you agree to the IEX Historical Data Terms of Use
(https://www.iex.io/legal/hist-data-terms).

## License

MIT OR Apache-2.0, at your option.
