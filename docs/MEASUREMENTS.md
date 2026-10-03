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

## End-to-end checks (tyche-replay `4f8b988`, Playwright 1.63.0, Chromium)

`pnpm e2e` (AAPL), 30 tests, 30 pass:

1. Playback moves at the chosen speed (2 s at 600x moves the clock by
   more than 900 s).
2. The space bar toggles playback; the slider seeks with the arrow keys
   and reads the time out as text.
3. The slider shows the clock as it is, and a key moves it by a second.
4. The heatmap is drawn while paused, right after the load.
5. The heatmap draws the cells the engine sent: at 10:06, every one of
   the 240 x 80 cells outside the two label plates (19,004 of them) is
   drawn in the bid colour, the ask colour or not at all, as its value
   says; the newest column holds exactly the ladder's levels inside the
   rows (3 bids, 6 asks), bids at or below the best bid and asks at or
   above the best ask; the text alternative names the prices of the
   top and bottom rows.
6. The ladder has a text alternative with the best bid and ask.
7. Axe finds no serious or critical violations (English, the system
   theme).
8. The loading status is announced, without axe violations.
9. A failed load says why (the server's status) and Retry loads it.
10. A worker that fails to start is reported, and Retry starts a new one.
11. A failure after the load says the replay stopped, and Retry loads
    again.
12. Before the first message the views show their empty states.
13. Seeking back to the start empties the trades and the heatmap.
14. Numbers keep the English format under a ru-RU browser locale.
15. The heatmap is as tall as the ladder at every density.
16. Play at the end of the day starts again from the beginning.
17. A start time that is not a number opens at the first message.
18. The theme follows the system until one is chosen.
19. Switching the theme sets data-theme, ?theme= and localStorage, and
    the ladder and heatmap redraw on the new surface while paused; the
    choice survives a reload and a link without ?theme=.
20. ?theme= wins over the remembered choice.
21. Switching to Arabic sets lang and dir, ?lang=, Arabic titles and
    buttons, Arabic-Indic digits in the tape, the clock and its spoken
    value, redraws the canvases while paused, survives a reload, and
    switches back.
22. In Arabic no visible or announced text has Latin letters or digits
    but the EN option (marked lang="en") and the names AAPL and IEX, and
    English and Arabic show the same text elements.
23. A failed load is explained in Arabic, without axe violations.
24-27. Axe finds no serious or critical violations in each of English
    and Arabic, light and dark.
28-29. The Playback panel does not move while playback fills the trades
    list, at 1440 px and at 412 px, and sits above Performance, which
    sits above the views.
30. No text is under 12 px on a phone-sized screen.

`pnpm test`: 31 of 31 unit tests pass, among them the heatmap checked
against the engine (tyche-market `8f70fe5` as WebAssembly, `tyche_market_bg.wasm` sha256 `e66a1219a50c`) on the AAPL
capture: the newest column is the book at the clock, column c is the
book at the end of its 2.5 s slice, the midpoint is the middle row, the
labels are the prices of the top and bottom rows, the window is ten
minutes wide from the first message on, and at 10:00:00 (best bid
334.55, best ask 337.68) the newest column is empty because the whole
book lies outside the 80 cents around the midpoint.
