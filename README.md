# Tyche Replay

Replay a trading day of IEX market data in the browser: the order book
rebuilt order by order, the trades, at any speed and any moment.

The engine is [tyche-market](https://github.com/Valkyra-Labs/tyche-market)
(Rust, compiled to WebAssembly, running in a Web Worker); the interface
is React and TypeScript on the [Stoa](https://github.com/Valkyra-Labs/stoa-system)
design system. Everything runs in the browser; there is no server.

Status: early. A performance record (frame rate and seek cost under a
named load) will be published with its build stamp.

## Development

```bash
pnpm install
```

```bash
pnpm dev
```

The app loads `public/data/20260924_deepplus.tyc` by default (produce it
with `tyche extract`, see tyche-market); `?symbol=SPY&data=URL&at=NS`
overrides the symbol, the capture and the start time.

## Data

Data provided for free by IEX. By accessing or using IEX Historical Data,
you agree to the IEX Historical Data Terms of Use
(https://www.iex.io/legal/hist-data-terms).

## License

MIT OR Apache-2.0, at your option.
