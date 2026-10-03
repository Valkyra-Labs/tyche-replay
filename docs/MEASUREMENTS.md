# Measurements

Host: Apple M4 Pro (12 CPU cores: 8 performance, 4 efficiency), 24 GB,
macOS 26.6. Browser: a Chromium-based browser (version not recorded) at
1440 x 900 CSS pixels, 60 Hz. Engine: tyche-market
`8f70fe5` compiled to WebAssembly (52 KB) in a Web Worker. Data: IEX
DEEP+ for 2026-09-24, one symbol per file (data provided for free by
IEX; by accessing or using IEX Historical Data, you agree to the IEX
Historical Data Terms of Use).

## Playback under load (2026-09-26, tyche-replay `102b0ba`)

NVDA, the day's largest capture: 3,033,315 messages, 23.9 MB gzipped,
105.6 MB inflated. Replay from 10:00 ET at 600x (ten minutes of trading
per second) for five seconds; the screen shows a 12-level ladder, a
10-minute liquidity heatmap (240 x 80 cells, refreshed every 250 ms) and
the last 30 trades. Counters are the app's own HUD, sampled once a
second.

| measure | result |
|---|---|
| load (fetch local, inflate, decode, index, snapshots) | 315-327 ms |
| frames per second | 60 |
| frame time p95 | 17.6 ms |
| book request in the worker, p95 | 0.5-1.5 ms |
| heatmap in the worker, p95 | 8.6-10.2 ms |
| messages applied per second | 66,713-90,789 |
| clock progress | 10:00:00 to 10:49:42 in 5 s (about 597x) |

The native heatmap cost for the same window is 2.8-3.2 ms
(tyche-market `8f70fe5`, `examples/heatmap_cost`, release build), so WebAssembly in the browser
costs about three times native here.

What went wrong first: the time slider is controlled by the clock ten
times a second and answered each new value with an onChange at its own
step; the app took that echo for a user seek and pulled the clock back
to the last whole second every 100 ms. Playback crawled at about 10x
whatever the speed, and the `at` start time was lost. The HUD made it
visible; an end-to-end test now checks that 2 s at 600x moves the clock
by more than 900 s.

What this does not show: other browsers, other machines, displays above
60 Hz, and memory use in the browser.

Not measured again since: the playback loop changed afterwards (the
heatmap catches up while paused, its height follows the density, and
the states around loading were added), so these numbers belong to
`102b0ba`.

## End-to-end checks (tyche-replay `874fecd`, Playwright 1.63.0, Chromium)

`pnpm e2e` (AAPL): playback moves at the chosen speed; the space bar
toggles playback; the slider seeks with the arrow keys, reads the time
out as text and shows the clock as it is; the ladder has a text
alternative with the best bid and ask; the heatmap is drawn while
paused; the loading status is announced; a failed load says why and
Retry loads it; a worker that fails to start, and one that fails after
the load, can be retried, and a failure after the load says the replay
stopped; the empty states show before the first message and again after
seeking back to it; numbers keep the English format under a ru-RU
browser locale; the heatmap is as tall as the ladder at every density;
Play at the end of the day starts again from the beginning; a start
time that is not a number opens at the first message; no text is under
12 px on a phone-sized screen; axe finds no serious or critical
violations, also on the loading, error and empty states. 17 of 17 pass,
with 16 of 16 unit tests.
