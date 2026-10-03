import { useCallback, useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import {
  Button,
  ChoiceGroup,
  Heatmap,
  Ladder,
  Panel,
  StatBar,
  StatusBadge,
  TimeSlider,
  TradeTable,
  type HeatmapHandle,
  type LadderHandle,
  type Trade,
} from "@valkyra-labs/stoa-react";
import { HEATMAP } from "./engine/heatmap";
import type { FromWorker, HeatmapResult, LoadStage, ToWorker } from "./engine/protocol";
import { SPEEDS, transport, type Speed } from "./transport";
import { useRowHeight } from "./ui/density";
import { Fps, Rolling } from "./ui/perf";
import { clampTime, clock, parseAt, stepOrigin } from "./ui/time";

const DEPTH = 12;
const TAPE_WINDOW_NS = 60e9;
const HEATMAP_EVERY_MS = 250;
const SCRUB_STEP_NS = 1e9;
// The slider shows the clock itself, to the whole nanosecond (stepOrigin
// needs whole numbers); while playing the clock moves in fractions of one.
const wholeNs = Math.round;

declare global {
  interface Window {
    /** What the app last handed to the ladder and the heatmap, and the
     * clock each was for. Set in development builds only, for the
     * end-to-end tests. */
    __tycheViews?: { time: number; levels: Float64Array; heatmapTime: number; heatmap: HeatmapResult | null };
  }
}

type Loaded = { duration: number; startEpochMs: number; messages: number; loadMs: number; bytes: number };

function params() {
  const q = new URLSearchParams(location.search);
  return {
    symbol: q.get("symbol") ?? "AAPL",
    data: q.get("data") ?? `${import.meta.env.BASE_URL}data/20260924_AAPL_deepplus.tycz`,
    at: parseAt(q.get("at")),
  };
}

export function App() {
  const [{ symbol, data, at }] = useState(params);
  const [state, send] = useMachine(transport);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [stage, setStage] = useState<LoadStage>("downloading");
  // Each retry loads the capture again in a new worker.
  const [attempt, setAttempt] = useState(0);
  // The prices of the heatmap's top and bottom rows, for its text
  // alternative. Until the first heatmap arrives, and whenever the book
  // has no midpoint, there are none and the heatmap shows Stoa's empty
  // state.
  const [heatRange, setHeatRange] = useState<{ top: number; bottom: number } | null>(null);
  // Focus was on the load status (after Retry) when the load finished: the
  // status goes away, so the Play button takes focus rather than the page.
  const [focusPlay, setFocusPlay] = useState(false);
  const [tape, setTape] = useState<Trade[]>([]);
  const [scrub, setScrub] = useState(0);
  // The slider is controlled by the clock ten times a second; it answers
  // a new value with onChange, and that echo must not count as a seek
  // (it pulled the clock back to the value shown, every 100 ms).
  const shownScrub = useRef(0);
  const [hud, setHud] = useState({ fps: 0, frameP95: 0, seekP95: 0, heatmapP95: 0, msgsPerSec: 0, orders: 0 });

  const root = useRef<HTMLDivElement>(null);
  const rowHeight = useRowHeight(root);
  const status = useRef<HTMLDivElement>(null);
  const ladder = useRef<LadderHandle>(null);
  const heatmap = useRef<HeatmapHandle>(null);
  const worker = useRef<Worker | null>(null);
  const t = useRef(0);
  const pending = useRef(false);
  const lastAsked = useRef(-1);
  const lastHeatmap = useRef(-Infinity);
  const heatmapFor = useRef(-1);
  const trades = useRef<Trade[]>([]);
  const playing = state.matches("playing");
  const speed = state.context.speed;
  const ended = state.matches("ended");
  const live = useRef({ playing, speed, ended });
  live.current = { playing, speed, ended };
  const stats = useRef({ fps: new Fps(), frame: new Rolling(), seek: new Rolling(), heat: new Rolling(), applied: 0, orders: 0 });

  useEffect(() => {
    pending.current = false;
    lastAsked.current = -1;
    lastHeatmap.current = -Infinity;
    heatmapFor.current = -1;
    trades.current = [];
    setTape([]);
    setStage("downloading");
    setHeatRange(null);
    const w = new Worker(new URL("./engine/replay.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    const fail = (message: string) => {
      setLoaded(null);
      send({ type: "FAILED", message });
    };
    // A worker that cannot start (its module or the WebAssembly fails to
    // load) or crashes says so here, not with an error message.
    w.onerror = (e) => {
      e.preventDefault();
      fail(e.message || "The replay engine stopped.");
    };
    w.onmessageerror = () => fail("The replay engine sent a message that could not be read.");
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.kind === "progress") {
        setStage(m.stage);
      } else if (m.kind === "loaded") {
        t.current = clampTime(at, m.duration);
        shownScrub.current = wholeNs(t.current);
        setScrub(shownScrub.current);
        setFocusPlay(status.current?.contains(document.activeElement) ?? false);
        setLoaded(m);
        send({ type: "LOADED" });
      } else if (m.kind === "error") {
        fail(m.message);
      } else {
        pending.current = false;
        ladder.current?.draw(m.levels);
        if (m.heatmap) {
          heatmap.current?.draw(m.heatmap);
          stats.current.heat.push(m.heatmap.ms);
          const { top, tick, rows } = m.heatmap;
          const bottom = top - tick * (rows - 1);
          setHeatRange((r) => (r?.top === top && r.bottom === bottom ? r : { top, bottom }));
        } else if (m.heatmap === null) {
          setHeatRange(null);
        }
        if (import.meta.env.DEV) {
          const shown = m.heatmap === undefined ? (window.__tycheViews ?? { heatmapTime: -1, heatmap: null }) : { heatmapTime: m.time, heatmap: m.heatmap };
          window.__tycheViews = { ...shown, time: m.time, levels: m.levels };
        }
        const fresh: Trade[] = [];
        for (let i = 0; i + 3 < m.trades.length; i += 4) {
          const time = m.trades[i]!;
          fresh.push({
            id: `${time}-${i}`,
            time: String(time),
            side: m.trades[i + 3]! < 0 ? "buy" : "sell",
            price: m.trades[i + 1]!,
            size: m.trades[i + 2]!,
          });
        }
        trades.current = [...fresh.reverse(), ...trades.current].slice(0, 30);
        stats.current.seek.push(m.seekMs);
        stats.current.applied += m.applied;
        stats.current.orders = m.orders;
      }
    };
    w.postMessage({ kind: "load", url: data, symbol } satisfies ToWorker);
    return () => w.terminate();
  }, [data, symbol, at, send, attempt]);

  // One loop: advance the clock, ask the worker for the book (only when
  // the previous answer arrived), refresh slow views a few times a second.
  useEffect(() => {
    if (!loaded) return;
    let raf = 0;
    let last = performance.now();
    let slowAt = last;
    let hudAt = last;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      const s = stats.current;
      s.fps.tick(now);
      s.frame.push(dt);
      if (live.current.playing) {
        t.current = Math.min(loaded.duration, t.current + dt * 1e6 * live.current.speed);
        if (t.current >= loaded.duration) send({ type: "ENDED" });
      }
      // The heatmap is throttled, so the request that reaches the final
      // time of a seek or a pause may go without one; it catches up on a
      // later frame even when the clock stands still.
      const wantHeatmap = now - lastHeatmap.current > HEATMAP_EVERY_MS && heatmapFor.current !== t.current;
      if (!pending.current && worker.current && (t.current !== lastAsked.current || wantHeatmap)) {
        const back = t.current < lastAsked.current;
        if (back) trades.current = [];
        const from = back || lastAsked.current < 0 ? Math.max(0, t.current - TAPE_WINDOW_NS) : lastAsked.current;
        if (wantHeatmap) {
          lastHeatmap.current = now;
          heatmapFor.current = t.current;
        }
        pending.current = true;
        worker.current.postMessage({
          kind: "seek",
          time: t.current,
          depth: DEPTH,
          tradesFrom: from,
          heatmap: wantHeatmap ? HEATMAP : undefined,
        } satisfies ToWorker);
        lastAsked.current = t.current;
      }
      if (now - slowAt > 100) {
        slowAt = now;
        setTape(trades.current.map((tr) => ({ ...tr, time: clock(loaded.startEpochMs, Number(tr.time)) })));
        shownScrub.current = wholeNs(t.current);
        setScrub(shownScrub.current);
      }
      if (now - hudAt > 500) {
        const secs = (now - hudAt) / 1000;
        setHud({
          fps: s.fps.value(),
          frameP95: s.frame.p95(),
          seekP95: s.seek.p95(),
          heatmapP95: s.heat.p95(),
          msgsPerSec: s.applied / secs,
          orders: s.orders,
        });
        s.applied = 0;
        hudAt = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [loaded, send]);

  // At the end, play starts again from the beginning: the clock stood at
  // the end, so playing on from there ended again on the next frame.
  const toggle = useCallback(() => {
    if (live.current.ended) t.current = 0;
    send({ type: "TOGGLE" });
  }, [send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target === document.body || e.target === document.documentElement)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const loading = state.matches("loading");
  const failed = state.matches("failed");
  const retry = () => {
    // The Retry button goes away while loading; focus waits on the status.
    status.current?.focus();
    setAttempt((a) => a + 1);
    send({ type: "RETRY" });
  };

  const n = (v: number, digits = 0) => v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

  return (
    <div className="app" ref={root}>
      <header className="bar">
        <h1>Tyche Replay</h1>
        <span className="muted">{symbol} on IEX</span>
        <span className="spacer" />
        <span className="muted">
          Data provided for free by IEX. By accessing or using IEX Historical Data, you agree to the IEX Historical Data Terms of Use.
        </span>
      </header>
      {(loading || failed) && (
        <main className="load">
          <Panel title={`${symbol} capture`}>
            {/* One polite status for the whole load: a message per stage,
                not per byte. It stays mounted across a retry. */}
            <div role="status" ref={status} tabIndex={-1} className="load-status">
              {loading && (
                <StatusBadge tone="neutral">
                  {stage === "downloading" ? `Downloading the ${symbol} capture…` : `Decoding the ${symbol} capture…`}
                </StatusBadge>
              )}
            </div>
            {failed && (
              <div role="alert" className="load-failure">
                <StatusBadge tone="negative">
                  {state.context.error?.during === "playback"
                    ? `The ${symbol} replay stopped.`
                    : `Could not load the ${symbol} capture.`}
                </StatusBadge>
                <p className="muted">{state.context.error?.message}</p>
              </div>
            )}
            {failed && <Button onPress={retry}>Retry</Button>}
          </Panel>
        </main>
      )}
      {loaded && !failed && (
        <main className="grid" data-state={String(state.value)} data-speed={speed}>
          {/* The controls come first, under the header, so that nothing above
              them changes height while the views below fill up. */}
          <Panel title="Playback" className="transport">
            <div className="transport-row">
              <Button autoFocus={focusPlay} variant="primary" onPress={toggle}>
                {playing ? "Pause" : "Play"}
              </Button>
              <ChoiceGroup<Speed>
                label="Speed"
                value={speed}
                onChange={(s) => send({ type: "SPEED", speed: s })}
                choices={SPEEDS.map((s) => ({ id: s, label: `${s}x` }))}
              />
              <TimeSlider
                label="Time"
                // Steps of a second from the clock, not from the first
                // message: the label is the clock, and a key moves it by
                // exactly a second. The minimum is up to a second before
                // the first message; a seek there goes to the first message.
                min={stepOrigin(scrub, SCRUB_STEP_NS)}
                max={loaded.duration}
                step={SCRUB_STEP_NS}
                value={scrub}
                onChange={(v) => {
                  if (v === shownScrub.current) return;
                  t.current = clampTime(v, loaded.duration);
                  shownScrub.current = wholeNs(t.current);
                  setScrub(shownScrub.current);
                  send({ type: "SEEK" });
                }}
                format={(v) => clock(loaded.startEpochMs, v)}
              />
            </div>
          </Panel>
          <Panel title="Performance" className="hud">
            <StatBar
              label="Performance counters"
              items={[
                { label: "frames/s", value: n(hud.fps) },
                { label: "frame p95", value: `${n(hud.frameP95, 1)} ms` },
                { label: "book p95", value: `${n(hud.seekP95, 2)} ms` },
                { label: "heatmap p95", value: `${n(hud.heatmapP95, 2)} ms` },
                { label: "messages/s", value: n(hud.msgsPerSec) },
                { label: "orders", value: n(hud.orders) },
                { label: "day", value: `${n(loaded.messages)} messages, ${n(loaded.bytes / 1e6, 1)} MB, loaded in ${n(loaded.loadMs)} ms` },
              ]}
            />
          </Panel>
          <Panel title="Book" className="book">
            <Ladder ref={ladder} depth={DEPTH} label={`Order book for ${symbol}, ${DEPTH} levels per side`} />
          </Panel>
          <Panel title="Liquidity, last 10 minutes" className="heat">
            <Heatmap
              ref={heatmap}
              data={heatRange ? undefined : null}
              // As tall as the ladder beside it: DEPTH rows a side at the
              // density's row height. The version redraws it at a new
              // height while paused.
              height={DEPTH * 2 * rowHeight}
              tokensVersion={rowHeight}
              label="Displayed liquidity over the last 10 minutes"
              description={
                heatRange
                  ? `Prices from ${n(heatRange.top, 2)} at the top to ${n(heatRange.bottom, 2)} at the bottom, a cent a row, around the midpoint now. Time runs left to right, 2.5 seconds a column, ending now. In each column bids lie below asks; darker cells hold more shares.`
                  : undefined
              }
            />
          </Panel>
          <Panel title="Trades" className="trades">
            <TradeTable caption={`Recent trades in ${symbol}`} trades={tape} />
          </Panel>
        </main>
      )}
    </div>
  );
}
