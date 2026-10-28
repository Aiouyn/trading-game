"use client";
// Broker price chart (UI card 7), the part that ships with the Broker: range tabs, the history request, the live
// candle merge, the states and the table. The plot (CandleChart, lightweight-charts) is a separate chunk imported
// after mount (G4); until it lands its box shows the skeleton at the chart's height, so nothing moves.
//  - History: one loadRange per (asset, range, Retry); the latest request wins and a superseded reply is dropped.
//  - Live: each `candles:{id}:{res}` frame goes onto the bars (mergeLive: same t in place, newer t appended).
//  - States: no live candle or no reply yet -> skeleton; candles denied/error, a bad live candle or a failed reply
//    -> "Couldn't load chart" + Retry (one new request); zero bars -> "No price history yet."; stale -> dimmed plot
//    and card 4's "Updating…" (once: the frame's own line covers it when the ticker is stale too).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { BrStrings } from "@/apps/broker/strings";
import { decText } from "@/apps/portfolio/positions/format";
import { Button } from "@/components/ui/Button";
import { CHART_RANGES, DEFAULT_RANGE, loadRange, mergeLive, parseBar, resOf, type Bar, type ChartRange } from "@/shell/contracts/history";
import type { AssetId } from "@/shell/contracts/orders";
import { getFeed, useChannel } from "@/shell/contracts/useChannel";
import { ChartTable } from "./ChartTable";
import type { CandleChartProps } from "./CandleChart";

type Hist =
  | { readonly status: "loading"; readonly key: string }
  | { readonly status: "error"; readonly key: string }
  | { readonly status: "ok"; readonly key: string; readonly bars: readonly Bar[] };

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
  const key = `${assetId}|${range}|${attempt}`;

  // The live candle, parsed at the boundary; "bad" if it breaks the bar rules.
  const live = useMemo((): Bar | "bad" | null => {
    const b = candles.body;
    if (!b || b.assetId !== assetId || b.res !== res) return null;
    try { return parseBar(b.live, res, "live"); } catch { return "bad"; }
  }, [candles.body, assetId, res]);
  const liveBar = live !== null && live !== "bad" ? live : null;

  const [hist, setHist] = useState<Hist>({ status: "loading", key: "" });
  const liveRef = useRef<Bar | null>(null);
  useEffect(() => { liveRef.current = liveBar; });
  const seq = useRef(0);
  const want = liveBar !== null ? key : null;
  useEffect(() => {
    const at = liveRef.current;
    if (want === null || at === null) return;
    const mine = ++seq.current;
    void loadRange(assetId, range, at.t).then((r) => {
      if (mine !== seq.current) return; // superseded (range, asset or Retry changed): latest wins
      setHist(r.ok ? { status: "ok", key: want, bars: r.value } : { status: "error", key: want });
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

  const titleId = useId();
  const first = bars?.[0];
  const newest = bars?.[bars.length - 1];
  const label = first && newest ? t.chartAria(assetId, t.range[range], decText(first.c, locale), decText(newest.c, locale)) : t.chartTitle;
  const skeleton = <div className="br-skel br-chart-skel" data-testid="br-chart-loading" role="status" aria-busy="true" aria-label={t.chartLoading} />;
  const Plot = plot?.C;

  return (
    <section className="br-chart" data-testid="br-chart" data-state={view} data-range={range} data-chart="" aria-labelledby={titleId}>
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
          : Plot ? <Plot bars={bars} last={last} halted={halted} t={t} locale={locale} label={label} onFail={onPlotFail} /> : skeleton)}
      </div>
      <div className={view === "plot" ? "br-chart-foot" : "br-chart-foot off"}>
        <Button variant="ghost" size="sm" className="br-chart-toggle" data-testid="br-chart-toggle" onClick={() => setTable((v) => !v)}>
          {table ? t.viewChart : t.viewTable}
        </Button>
        {stale && !frameStale && view === "plot" && <p className="br-updating muted" data-testid="br-chart-updating">{t.updating}</p>}
      </div>
    </section>
  );
}
