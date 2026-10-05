import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import {
  AppHeader,
  Button,
  ChoiceGroup,
  Heatmap,
  Ladder,
  PageShell,
  Panel,
  signalTokensChanged,
  StatBar,
  StatusBadge,
  TimeSlider,
  TradeTable,
  useShortcuts,
  useStoaFormat,
  type HeatmapHandle,
  type LadderHandle,
  type Trade,
} from "@valkyra-labs/stoa-react";
import { HEATMAP } from "./engine/heatmap";
import type { FailureReason, FromWorker, HeatmapResult, LoadStage, ToWorker } from "./engine/protocol";
import { strings, type Lang } from "./i18n";
import { SPEEDS, transport, type Speed } from "./transport";
import { useRowHeight } from "./ui/density";
import { Fps, Rolling } from "./ui/perf";
import { applyTheme, forgetTheme, pickTheme, saveTheme, storedTheme, useSystemTheme, type Theme, type ThemeChoice } from "./ui/prefs";
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

const IEX_TERMS = "https://www.iex.io/legal/hist-data-terms";

/** The replay. Rendered inside an I18nProvider set to the language's
 * locale, which Stoa's words and digits follow. */
export function App({ lang, onLang }: { lang: Lang; onLang: (lang: Lang) => void }) {
  const [{ symbol, data, at }] = useState(params);
  const text = strings[lang];
  const format = useStoaFormat();
  const [state, send] = useMachine(transport);
  // None until the viewer picks Light or Dark: the page follows the
  // system, and the switch shows System.
  const [theme, setTheme] = useState<Theme | null>(() => pickTheme(location.search, storedTheme()));
  const systemTheme = useSystemTheme();
  // Stoa's canvases watch data-theme on <html> and redraw in the new
  // colours, also while paused.
  useLayoutEffect(() => applyTheme(theme), [theme]);
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
  // The canvases draw words and digits in the locale, and only when asked:
  // a new language, or a font that arrives after a draw (the Arabic faces
  // load on first use), redraws them, also while paused.
  useEffect(() => {
    document.title = text.title;
    if (root.current) signalTokensChanged(root.current);
  }, [text]);
  useEffect(() => {
    const redraw = () => {
      if (root.current) signalTokensChanged(root.current);
    };
    document.fonts.addEventListener("loadingdone", redraw);
    return () => document.fonts.removeEventListener("loadingdone", redraw);
  }, []);
  // Following the system, a change of the system's scheme changes the
  // tokens without touching data-theme, so the canvases are asked to draw
  // again.
  useEffect(() => {
    if (theme === null && root.current) signalTokensChanged(root.current);
  }, [systemTheme, theme]);
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
    const fail = (reason: FailureReason) => {
      setLoaded(null);
      send({ type: "FAILED", reason });
    };
    // A worker that cannot start (its module or the WebAssembly fails to
    // load) or crashes says so here, not with an error message.
    w.onerror = (e) => {
      e.preventDefault();
      fail({ kind: "stopped", detail: e.message || undefined });
    };
    w.onmessageerror = () => fail({ kind: "unreadable" });
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
        fail(m.reason);
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

  // Space plays and pauses wherever focus is, except in a text field and on
  // a control that handles the key itself (a button presses, a choice
  // selects). Focus on the page's main region, where a click in the content
  // puts it, counts as nowhere.
  useShortcuts([{ key: " ", description: playing ? text.pause : text.play, onTrigger: toggle }]);

  const loading = state.matches("loading");
  const failed = state.matches("failed");
  const retry = () => {
    // The Retry button goes away while loading; focus waits on the status.
    status.current?.focus();
    setAttempt((a) => a + 1);
    send({ type: "RETRY" });
  };

  const n = (v: number, digits = 0) => (digits === 0 ? format.integer(v) : format.decimal(v, digits));
  const reason = state.context.error?.reason;
  // The engine's own words (and the browser's) are English: a detail,
  // marked as such for the page's language.
  const detail = (message: string) => (
    <>
      {text.details}{" "}
      <span lang="en" dir="ltr">
        {message}
      </span>
    </>
  );

  const header = (
    <AppHeader
      title={text.title}
      subtitle={text.onIex(symbol)}
      actions={
        <>
          <ChoiceGroup<ThemeChoice>
            size="small"
            label={text.theme}
            hideLabel
            value={theme ?? "system"}
            onChange={(next) => {
              if (next === "system") {
                forgetTheme();
                setTheme(null);
              } else {
                saveTheme(next);
                setTheme(next);
              }
            }}
            choices={[
              { id: "system", label: text.system },
              { id: "light", label: text.light },
              { id: "dark", label: text.dark },
            ]}
          />
          <ChoiceGroup<Lang>
            size="small"
            label={text.language}
            hideLabel
            value={lang}
            onChange={onLang}
            // The same EN / AR pair as the themis-steps demo; each code is
            // named in English, the language it is written in.
            choices={[
              { id: "en", label: <span lang="en">EN</span> },
              { id: "ar", label: <span lang="en">AR</span> },
            ]}
          />
        </>
      }
    />
  );

  return (
    <div className="app" ref={root}>
      <PageShell
        header={header}
        // The data source's terms, at the foot of the page: small print
        // with no fill of its own, out of the header's way.
        footer={
          <>
            {text.attribution}
            <a href={IEX_TERMS}>{text.terms}</a>
            {text.attributionEnd}
          </>
        }
      >
        {(loading || failed) && (
          <div className="load">
            <Panel title={text.capture(symbol)}>
              {/* One polite status for the whole load: a message per stage,
                  not per byte. It stays mounted across a retry. */}
              <div role="status" ref={status} tabIndex={-1} className="load-status">
                {loading && (
                  <StatusBadge tone="neutral">
                    {stage === "downloading" ? text.downloading(symbol) : text.decoding(symbol)}
                  </StatusBadge>
                )}
              </div>
              {failed && (
                <div role="alert" className="load-failure">
                  <StatusBadge tone="negative">
                    {state.context.error?.during === "playback" ? text.replayStopped(symbol) : text.loadFailed(symbol)}
                  </StatusBadge>
                  {reason && (
                    <p className="muted">
                      {reason.kind === "http" && text.httpFailed(format.integer(reason.status))}
                      {reason.kind === "stopped" && (
                        <>
                          {text.engineStopped}
                          {reason.detail && <> {detail(reason.detail)}</>}
                        </>
                      )}
                      {reason.kind === "unreadable" && text.unreadable}
                      {reason.kind === "engine" && detail(reason.detail)}
                    </p>
                  )}
                </div>
              )}
              {failed && <Button onPress={retry}>{text.retry}</Button>}
            </Panel>
          </div>
        )}
        {loaded && !failed && (
          <div className="grid" data-state={String(state.value)} data-speed={speed}>
            {/* The controls come first, under the header, so that nothing above
                them changes height while the views below fill up. */}
            <Panel title={text.playback} className="transport">
              <div className="transport-row">
                <Button autoFocus={focusPlay} variant="primary" onPress={toggle}>
                  {playing ? text.pause : text.play}
                </Button>
                <ChoiceGroup<Speed>
                  label={text.speed}
                  hideLabel
                  value={speed}
                  onChange={(s) => send({ type: "SPEED", speed: s })}
                  choices={SPEEDS.map((s) => ({ id: s, label: text.speedChoice(format.integer(s)) }))}
                />
                <TimeSlider
                  label={text.time}
                  hideLabel
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
                  format={(v) => format.digits(clock(loaded.startEpochMs, v))}
                />
              </div>
            </Panel>
            <Panel title={text.performance} className="hud">
              <StatBar
                label={text.counters}
                items={[
                  { label: text.fps, value: n(hud.fps) },
                  { label: text.frameP95, value: text.ms(n(hud.frameP95, 1)) },
                  { label: text.bookP95, value: text.ms(n(hud.seekP95, 2)) },
                  { label: text.heatmapP95, value: text.ms(n(hud.heatmapP95, 2)) },
                  { label: text.messagesPerSecond, value: n(hud.msgsPerSec) },
                  { label: text.orders, value: n(hud.orders) },
                  { label: text.day, value: text.dayValue(n(loaded.messages), n(loaded.bytes / 1e6, 1), n(loaded.loadMs)) },
                ]}
              />
            </Panel>
            <Panel title={text.book} className="book">
              <Ladder ref={ladder} depth={DEPTH} label={text.bookLabel(symbol, n(DEPTH))} />
            </Panel>
            <Panel title={text.liquidity} className="heat">
              <Heatmap
                ref={heatmap}
                data={heatRange ? undefined : null}
                // As tall as the ladder beside it: DEPTH rows a side at the
                // density's row height. The version redraws it at a new
                // height while paused.
                height={DEPTH * 2 * rowHeight}
                tokensVersion={rowHeight}
                label={text.liquidityLabel}
                description={
                  heatRange
                    ? text.liquidityText(n(heatRange.top, 2), n(heatRange.bottom, 2), n(HEATMAP.window / HEATMAP.columns / 1e9, 1))
                    : undefined
                }
              />
            </Panel>
            <Panel title={text.trades} className="trades">
              <TradeTable caption={text.tradesCaption(symbol)} trades={tape} />
            </Panel>
          </div>
        )}
      </PageShell>
    </div>
  );
}
