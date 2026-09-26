import { useEffect, useRef, useState } from "react";
import type { FromWorker, ToWorker } from "./engine/protocol";
import { drawLadder, readPalette, type Palette } from "./ui/ladder";
import { Fps, Rolling } from "./ui/perf";
import { clock } from "./ui/time";

const DEPTH = 12;
const SPEEDS = [1, 10, 60, 600];
const TAPE_WINDOW_NS = 60e9;

type Loaded = { duration: number; startEpochMs: number; messages: number; loadMs: number; bytes: number };
type Trade = { time: number; price: number; size: number; side: number };

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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [tape, setTape] = useState<Trade[]>([]);
  const [hud, setHud] = useState({ fps: 0, frameP95: 0, seekP95: 0, msgsPerSec: 0, orders: 0 });

  const canvas = useRef<HTMLCanvasElement>(null);
  const timeLabel = useRef<HTMLSpanElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const t = useRef(0);
  const pending = useRef(false);
  const lastAsked = useRef(0);
  const levels = useRef<Float64Array | null>(null);
  const trades = useRef<Trade[]>([]);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  playingRef.current = playing;
  speedRef.current = speed;

  useEffect(() => {
    const w = new Worker(new URL("./engine/replay.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.kind === "loaded") {
        t.current = Math.min(at, m.duration);
        setLoaded(m);
      } else if (m.kind === "error") {
        setError(m.message);
      } else if (m.kind === "state") {
        pending.current = false;
        levels.current = m.levels;
        const fresh: Trade[] = [];
        for (let i = 0; i + 3 < m.trades.length; i += 4) {
          fresh.push({ time: m.trades[i]!, price: m.trades[i + 1]!, size: m.trades[i + 2]!, side: m.trades[i + 3]! });
        }
        trades.current = [...fresh.reverse(), ...trades.current].slice(0, 60);
        stats.current.seek.push(m.seekMs);
        stats.current.applied += m.applied;
        stats.current.orders = m.orders;
      }
    };
    w.postMessage({ kind: "load", url: data, symbol } satisfies ToWorker);
    return () => w.terminate();
  }, [data, symbol, at]);

  const stats = useRef({ fps: new Fps(), frame: new Rolling(), seek: new Rolling(), applied: 0, orders: 0 });

  // One loop: advance the clock, ask the worker for the book (only when
  // the previous answer arrived), draw what we have.
  useEffect(() => {
    if (!loaded || !canvas.current) return;
    let raf = 0;
    let last = performance.now();
    let palette: Palette = readPalette(canvas.current);
    let hudAt = last;
    let tapeAt = last;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      const s = stats.current;
      s.fps.tick(now);
      s.frame.push(dt);
      if (playingRef.current) {
        t.current = Math.min(loaded.duration, t.current + dt * 1e6 * speedRef.current);
        if (t.current >= loaded.duration) setPlaying(false);
      }
      if (!pending.current && worker.current) {
        const back = t.current < lastAsked.current;
        if (back) trades.current = [];
        const from = back || lastAsked.current === 0 ? Math.max(0, t.current - TAPE_WINDOW_NS) : lastAsked.current;
        pending.current = true;
        worker.current.postMessage({ kind: "seek", id: 0, time: t.current, depth: DEPTH, tradesFrom: from } satisfies ToWorker);
        lastAsked.current = t.current;
      }
      drawLadder(canvas.current!, levels.current, DEPTH, palette);
      if (timeLabel.current) timeLabel.current.textContent = clock(loaded.startEpochMs, t.current);
      if (scrub.current && document.activeElement !== scrub.current) scrub.current.value = String(t.current);
      if (now - tapeAt > 100) {
        tapeAt = now;
        setTape(trades.current.slice(0, 30));
      }
      if (now - hudAt > 500) {
        const secs = (now - hudAt) / 1000;
        setHud({ fps: s.fps.value(), frameP95: s.frame.p95(), seekP95: s.seek.p95(), msgsPerSec: s.applied / secs, orders: s.orders });
        s.applied = 0;
        hudAt = now;
        palette = readPalette(canvas.current!);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header className="bar">
        <strong>Tyche Replay</strong>
        <span className="muted">{symbol} on IEX</span>
        <span className="spacer" />
        <span className="muted">Data provided for free by IEX. By accessing or using IEX Historical Data, you agree to the IEX Historical Data Terms of Use.</span>
      </header>
      {error && <p role="alert" className="error">{error}</p>}
      {!loaded && !error && <p className="muted pad">Loading {symbol}…</p>}
      {loaded && (
        <main className="grid">
          <section aria-label="Order book" className="panel">
            <h2>Book</h2>
            <canvas ref={canvas} className="ladder" role="img" aria-label={`Order book for ${symbol}, ${DEPTH} levels per side`} />
          </section>
          <section aria-label="Trades" className="panel">
            <h2>Trades</h2>
            <table className="tape">
              <thead>
                <tr><th>Time</th><th>Side</th><th className="num">Price</th><th className="num">Size</th></tr>
              </thead>
              <tbody>
                {tape.map((tr, i) => (
                  <tr key={`${tr.time}-${i}`}>
                    <td>{clock(loaded.startEpochMs, tr.time)}</td>
                    <td className={tr.side < 0 ? "up" : "down"}>{tr.side < 0 ? "Buy" : "Sell"}</td>
                    <td className="num">{tr.price.toFixed(2)}</td>
                    <td className="num">{tr.size.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section aria-label="Playback" className="panel transport">
            <button onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? "Pause" : "Play"}</button>
            <div role="group" aria-label="Speed" className="speeds">
              {SPEEDS.map((s) => (
                <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>
              ))}
            </div>
            <span ref={timeLabel} className="num time" aria-live="off" />
            <input
              ref={scrub}
              type="range"
              min={0}
              max={loaded.duration}
              step={1e8}
              aria-label="Time"
              onChange={(e) => (t.current = Number(e.target.value))}
            />
          </section>
          <section aria-label="Performance" className="panel hud">
            <span>{hud.fps} fps</span>
            <span>frame p95 {hud.frameP95.toFixed(1)} ms</span>
            <span>seek p95 {hud.seekP95.toFixed(2)} ms</span>
            <span>{Math.round(hud.msgsPerSec).toLocaleString("en-US")} msgs/s</span>
            <span>{hud.orders.toLocaleString("en-US")} orders</span>
            <span className="muted">{loaded.messages.toLocaleString("en-US")} messages, {(loaded.bytes / 1e6).toFixed(1)} MB, loaded in {Math.round(loaded.loadMs)} ms</span>
          </section>
        </main>
      )}
    </div>
  );
}
