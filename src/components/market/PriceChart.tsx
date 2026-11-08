"use client";
// Broker price chart (UI card 7), the part that ships with the Broker: range tabs, the history request, the live
// candle merge, the states and the table. The plot (CandleChart, lightweight-charts) is a separate chunk imported
// after mount (G4); until it lands its box shows the skeleton at the chart's height, so nothing moves.
//  - History: one loadRange per (asset, range, Retry); the latest request wins and a superseded reply is dropped.
//  - Live: each `candles:{id}:{res}` frame goes onto the bars (mergeLive: same t in place, newer t appended).
//  - M1-07 catch-up (signed-in): the bars carry the server candle revision they are known to include (the frame's
//    `rev` when their request left, then each catch-up reply's). When a frame shows a newer revision, one request asks
//    for every bar changed since the bars' own revision (a closed bar's last sample, volume saved after its bar closed)
//    and installs them with the new revision in one state update: a change is acknowledged only where it is shown, so a
//    reply that was read before a change can never hide it. A frame from another server history (`<epoch>` changed:
//    the server restarted, its candle history is gone) changes the history key, so the range is requested again.
//  - States: no live candle or no reply yet -> skeleton; candles denied/error, a bad live candle or a failed reply
//    -> "Couldn't load chart" + Retry (one new request); zero bars -> "No price history yet."; stale -> dimmed plot
//    and card 4's "Updating…" (once: the frame's own line covers it when the ticker is stale too).
//  - Trend lines: the player's own, per asset, on this device (trendlines.ts: the account's, or the guest's when
//    signed out; none until the session and the device copy are read). The Trend line button picks the tool (Cancel
//    or Esc drops it), a line is selected on the plot (Delete or the Delete line button removes it). A device copy that
//    cannot be read shows a Retry instead of the tool; a change the device did not keep is taken back and said so.
//  - Overlays (chartStudies.ts): SMA and EMA, each on/off with a period, the player's own on this device (account or
//    guest, read before the controls show; a failed read shows a Retry). The plot draws them from the shown closes; a
//    range shorter than an overlay's period says so instead of drawing a partial line.
//  - M1-07: signed-in bars are the server's recorded quote candles + executed volume (history.ts); a guest sees the mock's
//    demo bars, labelled as such. History is keyed by the feed epoch, so an account switch never shows the other feed's bars.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { BrStrings } from "@/apps/broker/strings";
import { decText } from "@/apps/portfolio/positions/format";
import { Button } from "@/components/ui/Button";
import { parseRev, type CandleRev } from "@/shell/contracts/candleRev";
import { CHART_RANGES, DEFAULT_RANGE, foldBars, isServerFeed, loadRange, mergeLive, parseBar, rangeRequests, resOf, type Bar, type ChartRange, type GameTick } from "@/shell/contracts/history";
import type { AssetId } from "@/shell/contracts/orders";
import { feedEpoch, getFeed, useChannel } from "@/shell/contracts/useChannel";
import { useAuthSession } from "@/shell/authSession";
import { ChartTable, barTime } from "./ChartTable";
import type { CandleChartProps } from "./CandleChart";
import { STUDY_KINDS, STUDY_PERIODS, retryStudies, setStudy, useStudies, useStudiesStatus, type StudyKind } from "./chartStudies";
import { MAX_LINES, drawScope, retryTrendlines, setTrendlines, useTrendStatus, useTrendlines, type TrendDraw } from "./trendlines";

type Hist =
  | { readonly status: "loading"; readonly key: string }
  | { readonly status: "error"; readonly key: string }
  | { readonly status: "ok"; readonly key: string; readonly bars: readonly Bar[]; readonly from: GameTick; readonly rev: CandleRev | null };

export type ChartView = "loading" | "error" | "empty" | "plot";

export interface PriceChartProps {
  readonly assetId: AssetId;
  readonly last: string | null;
  readonly halted: boolean;
  /** The frame already shows "Updating…" (ticker or me stale). */
  readonly frameStale: boolean;
  readonly t: BrStrings;
  readonly locale: string;
}

type Plot = (p: CandleChartProps) => ReactNode;

export function PriceChart({ assetId, last, halted, frameStale, t, locale }: PriceChartProps) {
  const [range, setRange] = useState<ChartRange>(DEFAULT_RANGE);
  const [table, setTable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const res = resOf(range);
  const ch = `candles:${assetId}:${res}` as const;
  const candles = useChannel(ch);
  // The feed epoch too: a sign-in / sign-out swaps the feed, and the other feed's bars must never stay on screen.
  const epoch = feedEpoch();

  // The live candle, parsed at the boundary; "bad" if it breaks the bar rules.
  const live = useMemo((): Bar | "bad" | null => {
    const b = candles.body;
    if (!b || b.assetId !== assetId || b.res !== res) return null;
    try { return parseBar(b.live, res, "live"); } catch { return "bad"; }
  }, [candles.body, assetId, res]);
  const liveBar = live !== null && live !== "bad" ? live : null;
  const bodyRev = candles.body && candles.body.assetId === assetId && candles.body.res === res ? parseRev(candles.body.rev) : null;
  // The server candle history too (signed-in): after a server restart the old bars belong to a history that is gone, and
  // the range is requested again from the new one.
  const key = `${epoch}|${assetId}|${range}|${attempt}|${bodyRev?.epoch ?? ""}`;

  const [hist, setHist] = useState<Hist>({ status: "loading", key: "" });
  const liveRef = useRef<Bar | null>(null);
  const revRef = useRef<CandleRev | null>(null);
  useEffect(() => { liveRef.current = liveBar; revRef.current = bodyRev; });
  const seq = useRef(0);
  const want = liveBar !== null ? key : null;
  useEffect(() => {
    const at = liveRef.current;
    if (want === null || at === null) return;
    const rev = revRef.current; // read before the request leaves: every reply includes at least this revision
    const mine = ++seq.current;
    void loadRange(assetId, range, at.t).then((r) => {
      if (mine !== seq.current) return; // superseded (range, asset or Retry changed): latest wins
      const from = rangeRequests(assetId, range, at.t)[0]?.from ?? at.t;
      setHist(r.ok ? { status: "ok", key: want, bars: r.value, from, rev } : { status: "error", key: want });
    });
    return () => { seq.current += 1; };
    // `want` carries asset, range and attempt; the live tick is read once, when the request leaves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  // Live frames onto the loaded bars, as each frame renders (React's "adjust state when a prop changes"). An empty
  // history stays empty until the next request.
  const [merged, setMerged] = useState<Bar | null>(null);
  if (liveBar !== merged) {
    setMerged(liveBar);
    if (liveBar !== null && hist.status === "ok" && hist.key === key && hist.bars.length > 0) {
      const bars = mergeLive(hist.bars, liveBar);
      if (bars !== hist.bars) setHist({ ...hist, bars });
    }
  }

  // Catch-up: one request at a time; a failed one is asked again on the next newer revision (every server tick is one).
  const catching = useRef(false);
  const histRev = hist.status === "ok" && hist.key === key ? hist.rev : null;
  useEffect(() => {
    if (histRev === null || bodyRev === null || catching.current || bodyRev.epoch !== histRev.epoch) return;
    const feed = getFeed();
    const to = liveRef.current?.t;
    if (bodyRev.n <= histRev.n || !isServerFeed(feed) || to === undefined) return;
    catching.current = true;
    const k = key;
    void feed.serverCandleChanges({ assetId, res, from: to, to }, histRev.n).then((r) => {
      catching.current = false; // before the install below re-runs this effect
      const rev = parseRev(r?.rev);
      const list = r?.raw && typeof r.raw === "object" ? (r.raw as { bars?: unknown }).bars : null;
      if (!rev || !Array.isArray(list) || rev.epoch !== histRev.epoch) return; // another history: the key reloads it
      let changed: Bar[];
      try { changed = list.map((c, i) => parseBar(c, res, `changes/${i}`)); } catch { return; }
      setHist((h) => (h.status === "ok" && h.key === k && h.rev === histRev ? { ...h, bars: foldBars(h.bars, changed), rev } : h));
    }).catch(() => {}).finally(() => { catching.current = false; });
    // The revision's parts, not the parsed object (a new one per frame); liveRef is read when the request leaves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, res, key, histRev, bodyRev?.epoch, bodyRev?.n]);

  // The plot chunk, requested once the Broker has mounted.
  const [plot, setPlot] = useState<{ C: Plot } | null>(null);
  /** The chunk did not load, or the library threw while drawing. */
  const [plotFailed, setPlotFailed] = useState(false);
  const onPlotFail = useCallback(() => setPlotFailed(true), []);
  useEffect(() => {
    if (plot || plotFailed) return;
    let on = true;
    import("./CandleChart").then((m) => { if (on) setPlot({ C: m.CandleChart }); }, () => { if (on) setPlotFailed(true); });
    return () => { on = false; };
  }, [plot, plotFailed]);

  const channelFailed = candles.state === "denied" || candles.state === "error";
  const bars = hist.status === "ok" && hist.key === key ? hist.bars : null;
  const view: ChartView = channelFailed || live === "bad" || plotFailed || (hist.status === "error" && hist.key === key) ? "error"
    : bars === null ? "loading"
    : bars.length === 0 ? "empty"
    : "plot";
  const stale = candles.state === "stale";

  const retry = () => {
    if (channelFailed) getFeed().resync(ch);
    if (plotFailed) setPlotFailed(false);
    setAttempt((a) => a + 1);
  };
  const pick = (r: ChartRange) => { if (r !== range) { setRange(r); } };

  // Trend lines. PriceChart is keyed by asset and the account boundary remounts it on sign-in / sign-out, so this state
  // never outlives its asset or account.
  const scope = drawScope(useAuthSession());
  const lines = useTrendlines(scope, assetId);
  const linesStatus = useTrendStatus(scope);
  const [placing, setPlacing] = useState<number | null>(null);
  const sessions = useRef(0);
  const [selected, setSelected] = useState<string | null>(null);
  const canDraw = view === "plot" && !table && plot !== null && scope !== null && lines !== null;
  const placingNow = canDraw ? placing : null;
  const sel = canDraw && selected !== null && lines.some((l) => l.id === selected) ? selected : null;
  const sectionRef = useRef<HTMLElement>(null);
  const del = () => {
    if (!sel || scope === null || lines === null) return;
    setTrendlines(scope, assetId, lines.filter((l) => l.id !== sel));
    setSelected(null);
  };
  const toggleTool = () => {
    if (placingNow !== null) { setPlacing(null); return; }
    setSelected(null);
    sessions.current += 1;
    setPlacing(sessions.current);
  };
  const draw: TrendDraw | undefined = canDraw ? {
    lines, placing: placingNow, selected: sel,
    onChange: (next) => setTrendlines(scope, assetId, next),
    onSelect: setSelected,
    onPlaced: () => setPlacing(null),
  } : undefined;
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!canDraw || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape" && (placingNow !== null || sel)) {
      if (placingNow !== null) setPlacing(null); else setSelected(null);
    } else if ((e.key === "Delete" || e.key === "Backspace") && sel && placingNow === null) {
      del();
      sectionRef.current?.querySelector<HTMLElement>('[data-testid="br-trend-tool"]')?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Overlays: shown once this device's choices are read (none on the table, which lists the bars only).
  const prefs = useStudies(scope);
  const prefsStatus = useStudiesStatus(scope);
  const showStudies = view === "plot" && !table && plot !== null && scope !== null;
  const studiesOn = useMemo(() => (prefs ? STUDY_KINDS.filter((k) => prefs[k].on).map((k) => ({ kind: k, n: prefs[k].n })) : []), [prefs]);
  const short = bars ? studiesOn.filter((s) => s.n > bars.length) : [];
  const pickPeriod = (k: StudyKind, value: string) => {
    const n = STUDY_PERIODS[k].find((p) => String(p) === value);
    if (n !== undefined && scope !== null) setStudy(scope, k, { on: true, n });
  };

  const titleId = useId();
  const first = bars?.[0];
  const newest = bars?.[bars.length - 1];
  const label = first && newest ? t.chartAria(assetId, t.range[range], decText(first.c, locale), decText(newest.c, locale)) : t.chartTitle;
  const skeleton = <div className="br-skel br-chart-skel" data-testid="br-chart-loading" role="status" aria-busy="true" aria-label={t.chartLoading} />;
  const Plot = plot?.C;
  // Where the bars come from: the server's recorded quotes (and since when, if that is inside the range), or the demo.
  const server = isServerFeed(getFeed());
  const since = server && first && hist.status === "ok" && first.t > hist.from ? t.sourceSince(barTime(first.t, locale, t)) : null;
  const source = server ? (since ? `${t.sourceServer} · ${since}` : t.sourceServer) : t.sourceDemo;

  return (
    <section ref={sectionRef} onKeyDown={onKey} className="br-chart" data-testid="br-chart" data-state={view} data-range={range} data-chart="" aria-labelledby={titleId}>
      <div className="br-chart-bar">
        <p className="br-chart-title" id={titleId}>{t.chartTitle}</p>
        <div className="br-seg br-chart-ranges" role="group" aria-label={t.rangeAria} data-testid="br-chart-ranges">
          {CHART_RANGES.map((r) => (
            <button type="button" key={r} aria-pressed={r === range} data-range={r} onClick={() => pick(r)}>{t.range[r]}</button>
          ))}
        </div>
      </div>
      <div className={stale && view === "plot" ? "br-chart-box stale" : "br-chart-box"} data-testid="br-chart-box">
        {view === "loading" && skeleton}
        {view === "error" && (
          <div className="br-chart-msg" data-testid="br-chart-error">
            <span role="alert">{t.chartError}</span>
            <Button data-testid="br-chart-retry" onClick={retry}>{t.retry}</Button>
          </div>
        )}
        {view === "empty" && <p className="br-chart-msg muted" data-testid="br-chart-empty">{t.noHistory}</p>}
        {view === "plot" && bars && (table
          ? <ChartTable bars={bars} t={t} locale={locale} label={label} />
          : Plot ? <Plot bars={bars} last={last} halted={halted} t={t} locale={locale} label={label} onFail={onPlotFail} draw={draw} studies={showStudies ? studiesOn : undefined} /> : skeleton)}
      </div>
      <div className={view === "plot" ? "br-chart-foot" : "br-chart-foot off"}>
        <Button variant="ghost" size="sm" className="br-chart-toggle" data-testid="br-chart-toggle" onClick={() => { setTable((v) => !v); setPlacing(null); }}>
          {table ? t.viewChart : t.viewTable}
        </Button>
        {canDraw && (
          <span className="br-chart-draw" role="group" aria-label={t.trendLayer} title={t.trendLocal}>
            <Button variant="ghost" size="sm" className="br-chart-tool" data-testid="br-trend-tool" aria-pressed={placingNow !== null}
              disabled={placingNow === null && lines.length >= MAX_LINES} onClick={toggleTool}>
              {placingNow !== null ? t.trendCancel : t.trendTool}
            </Button>
            {sel && placingNow === null && (
              <Button variant="ghost" size="sm" className="br-chart-tool" data-testid="br-trend-delete" onClick={del}>{t.trendDelete}</Button>
            )}
          </span>
        )}
        {view === "plot" && !table && plot !== null && scope !== null && linesStatus === "error" && (
          <span className="br-chart-draw" role="group" aria-label={t.trendLayer}>
            <span className="br-chart-source" data-testid="br-trend-error" role="alert">{t.trendReadError}</span>
            <Button variant="ghost" size="sm" className="br-chart-tool" data-testid="br-trend-retry" onClick={() => retryTrendlines(scope)}>{t.retry}</Button>
          </span>
        )}
        {canDraw && linesStatus === "unsaved" && <p className="br-chart-source" data-testid="br-trend-unsaved" role="alert">{t.trendUnsaved}</p>}
        {showStudies && prefs && (
          <span className="br-chart-studies" role="group" aria-label={t.studiesLabel} title={t.studiesLocal} data-testid="br-chart-studies">
            {STUDY_KINDS.map((k) => (
              <span key={k} className="br-study" data-study={k}>
                <Button variant="ghost" size="sm" className={`br-chart-tool br-study-on br-study-${k}`} data-testid={`br-study-${k}`} aria-pressed={prefs[k].on}
                  title={t.studyHint[k]} onClick={() => setStudy(scope, k, { on: !prefs[k].on, n: prefs[k].n })}>
                  {t.study[k]}
                </Button>
                <select className="br-select br-study-n" data-testid={`br-study-${k}-n`} aria-label={t.studyPeriodAria(t.study[k])}
                  value={String(prefs[k].n)} onChange={(e) => pickPeriod(k, e.currentTarget.value)}>
                  {STUDY_PERIODS[k].map((n) => <option key={n} value={String(n)}>{t.studyPeriod(n)}</option>)}
                </select>
              </span>
            ))}
          </span>
        )}
        {showStudies && prefsStatus === "error" && (
          <span className="br-chart-draw" role="group" aria-label={t.studiesLabel}>
            <span className="br-chart-source" data-testid="br-studies-error" role="alert">{t.studiesReadError}</span>
            <Button variant="ghost" size="sm" className="br-chart-tool" data-testid="br-studies-retry" onClick={() => retryStudies(scope)}>{t.retry}</Button>
          </span>
        )}
        {showStudies && prefsStatus === "unsaved" && <p className="br-chart-source" data-testid="br-studies-unsaved" role="alert">{t.studiesUnsaved}</p>}
        {showStudies && bars && short.map((s) => (
          <p key={s.kind} className="br-chart-source muted" data-testid="br-study-short" data-study={s.kind} role="status">{t.studyShort(t.study[s.kind], s.n, bars.length)}</p>
        ))}
        {placingNow !== null && <p className="br-chart-source muted" data-testid="br-trend-hint" role="status">{t.trendHint}</p>}
        {view === "plot" && <p className="br-chart-source muted" data-testid="br-chart-source" data-source={server ? "server" : "demo"}>{source}</p>}
        {stale && !frameStale && view === "plot" && <p className="br-updating muted" data-testid="br-chart-updating">{t.updating}</p>}
      </div>
    </section>
  );
}
