import { useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import {
  Button,
  ChoiceGroup,
  Heatmap,
  Ladder,
  Panel,
  StatBar,
  TimeSlider,
  TradeTable,
  type HeatmapHandle,
  type LadderHandle,
  type Trade,
} from "@valkyra-labs/stoa-react";
import type { FromWorker, HeatmapRequest, ToWorker } from "./engine/protocol";
import { SPEEDS, transport, type Speed } from "./transport";
import { Fps, Rolling } from "./ui/perf";
import { clock } from "./ui/time";

const DEPTH = 12;
const TAPE_WINDOW_NS = 60e9;
const HEATMAP: HeatmapRequest = { window: 600e9, columns: 240, rows: 80, tick: 0.01 };
const HEATMAP_EVERY_MS = 250;
const SCRUB_STEP_NS = 1e9;
const snap = (v: number) => Math.round(v / SCRUB_STEP_NS) * SCRUB_STEP_NS;

type Loaded = { duration: number; startEpochMs: number; messages: number; loadMs: number; bytes: number };

function params() {
  const q = new URLSearchParams(location.search);
  return {
    symbol: q.get("symbol") ?? "AAPL",
    data: q.get("data") ?? `${import.meta.env.BASE_URL}data/20260924_AAPL_deepplus.tycz`,
    at: Number(q.get("at") ?? 0),
  };
}

export function App() {
  const [{ symbol, data, at }] = useState(params);
  const [state, send] = useMachine(transport);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tape, setTape] = useState<Trade[]>([]);
  const [scrub, setScrub] = useState(0);
  // The slider is controlled by the clock ten times a second; it answers
  // a new value with onChange, and that echo must not count as a seek
  // (it snapped the clock back to the last whole second, every 100 ms).
  const shownScrub = useRef(0);
  const [hud, setHud] = useState({ fps: 0, frameP95: 0, seekP95: 0, heatmapP95: 0, msgsPerSec: 0, orders: 0 });

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
  const live = useRef({ playing, speed });
  live.current = { playing, speed };
  const stats = useRef({ fps: new Fps(), frame: new Rolling(), seek: new Rolling(), heat: new Rolling(), applied: 0, orders: 0 });

  useEffect(() => {
    const w = new Worker(new URL("./engine/replay.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.kind === "loaded") {
        t.current = Math.min(at, m.duration);
        shownScrub.current = snap(t.current);
        setScrub(shownScrub.current);
        setLoaded(m);
        send({ type: "LOADED" });
      } else if (m.kind === "error") {
        send({ type: "FAILED", message: m.message });
      } else {
        pending.current = false;
        ladder.current?.draw(m.levels);
        if (m.heatmap) {
          heatmap.current?.draw(m.heatmap);
          stats.current.heat.push(m.heatmap.ms);
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
  }, [data, symbol, at, send]);

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
        shownScrub.current = snap(t.current);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target === document.body || e.target === document.documentElement)) {
        e.preventDefault();
        send({ type: "TOGGLE" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send]);

  const n = (v: number, digits = 0) => v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

  return (
    <div className="app">
      <header className="bar">
        <h1>Tyche Replay</h1>
        <span className="muted">{symbol} on IEX</span>
        <span className="spacer" />
        <span className="muted">
          Data provided for free by IEX. By accessing or using IEX Historical Data, you agree to the IEX Historical Data Terms of Use.
        </span>
      </header>
      {state.matches("failed") && (
        <p role="alert" className="error">
          {state.context.error}
        </p>
      )}
      {state.matches("loading") && <p className="muted pad">Loading {symbol}…</p>}
      {loaded && (
        <main className="grid" data-state={String(state.value)} data-speed={speed}>
          <Panel title="Book" className="book">
            <Ladder ref={ladder} depth={DEPTH} label={`Order book for ${symbol}, ${DEPTH} levels per side`} />
          </Panel>
          <Panel title="Liquidity, last 10 minutes" className="heat">
            <Heatmap
              ref={heatmap}
              height={DEPTH * 2 * 22}
              label="Displayed liquidity over the last 10 minutes"
              description="Bids below the midpoint, asks above; darker cells hold more shares. Time runs left to right."
            />
          </Panel>
          <Panel title="Trades" className="trades">
            <TradeTable caption={`Recent trades in ${symbol}`} trades={tape} />
          </Panel>
          <Panel title="Playback" className="transport">
            <div className="transport-row">
              <Button variant="primary" onPress={() => send({ type: "TOGGLE" })}>
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
                min={0}
                max={loaded.duration}
                step={SCRUB_STEP_NS}
                value={scrub}
                onChange={(v) => {
                  if (v === shownScrub.current) return;
                  t.current = v;
                  shownScrub.current = v;
                  setScrub(v);
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
        </main>
      )}
    </div>
  );
}
