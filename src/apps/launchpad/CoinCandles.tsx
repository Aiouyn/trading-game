"use client";
// A coin's candle chart (lazy: its own chunk with lightweight-charts, loaded when a coin page opens). Port of the owner's
// first version token chart (origin/p10/lp src/components/apps/launchpad/CandleChart.tsx): 1m / 5m / 15m / 1h candles,
// the axis in price or market cap, an O H L C readout. Built from main's recorded trades (GET /api/launchpad/history, the
// curve after each executed trade; candles.ts), re-read whenever the board shows the coin's curve or tape moved. The
// latest request wins; a failed refresh keeps the last candles. Colours are the shell's chart tokens (chartTheme.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart,
  type IChartApi, type ISeriesApi, type MouseEventParams, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { Button } from "@/components/ui/Button";
import { parseSrgb } from "@/components/market/chartColor";
import { readChartTheme, type ChartTheme } from "@/components/market/chartTheme";
import { LP } from "@/launchpad/rules";
import { TIMEFRAMES, candlesOf, type Candle, type Timeframe } from "./candles";
import { parseHistory, priceStr, type HistoryData } from "./history";
import { LPS } from "./strings";

type Axis = "price" | "mcap";
type St = { status: "loading" } | { status: "error" } | { status: "ok"; data: HistoryData };

const capStr = (d: number) => `$${Math.round(d).toLocaleString("en-US")}`;
/** Chart time: the bucket's wall-clock start shifted to the viewer's zone (the library draws UTC). */
const toTime = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 1000) as UTCTimestamp;

export default function CoinCandles({ ticker, version }: { ticker: string; version: string }) {
  const [st, setSt] = useState<St>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [plotFailed, setPlotFailed] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const ctl = new AbortController();
    (async () => {
      let data: HistoryData | null = null;
      try {
        const res = await fetch(`/api/launchpad/history?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" }, signal: ctl.signal });
        data = res.ok ? parseHistory(await res.json(), ticker) : (await res.body?.cancel().catch(() => {}), null);
      } catch { data = null; }
      if (mine !== seq.current) return;
      setSt((s) => (data ? { status: "ok", data } : s.status === "ok" ? s : { status: "error" }));
    })();
    const reads = seq;
    return () => { ctl.abort(); reads.current++; };
  }, [ticker, version, retry]);

  if (st.status === "loading") return <div className="lpad-skel lpad-cc-skel" aria-busy="true" aria-label={LPS.hLoading} data-testid="lp-candles-loading" />;
  if (st.status === "error") {
    return <div className="lpad-row2" data-testid="lp-candles-error"><span role="alert">{LPS.hCouldnt}</span><Button size="sm" onClick={() => { setSt({ status: "loading" }); setRetry((r) => r + 1); }}>{LPS.retry}</Button></div>;
  }
  if (plotFailed) return <p className="lpad-sub" role="alert" data-testid="lp-candles-failed">{LPS.hCouldnt}</p>;
  return <Plot data={st.data} onFail={setPlotFailed} />;
}

function Plot({ data, onFail }: { data: HistoryData; onFail: (failed: true) => void }) {
  const [tf, setTf] = useState<Timeframe>("1m");
  const [axis, setAxis] = useState<Axis>("price");
  const [hover, setHover] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const ms = TIMEFRAMES.find((x) => x.id === tf)!.ms;
  const candles = useMemo(() => candlesOf(data, ms, now), [data, ms, now]);
  const scale = axis === "mcap" ? LP.SUPPLY : 1;
  const fmt = (v: number) => (axis === "mcap" ? capStr(v * scale) : priceStr(v));
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const api = useRef<{ chart: IChartApi; c: ISeriesApi<"Candlestick">; v: ISeriesApi<"Histogram">; th: ChartTheme } | null>(null);
  const shownRef = useRef<Candle[]>([]);

  useEffect(() => {
    if (!host.current || !plot.current) return;
    const th = readChartTheme(host.current);
    if (!th) { onFail(true); return; }
    const c = th.colours;
    let chart: IChartApi;
    try {
      chart = createChart(plot.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, fontFamily: th.fontFamily, fontSize: th.fontSize, attributionLogo: false, colorParsers: [parseSrgb] },
        grid: { vertLines: { color: c.grid, visible: !th.hc }, horzLines: { color: c.grid, visible: !th.hc } },
        crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: c.crosshair, labelBackgroundColor: c.label }, horzLine: { color: c.crosshair, labelBackgroundColor: c.label } },
        rightPriceScale: { borderColor: c.crosshair, minimumWidth: 84, scaleMargins: { top: 0.08, bottom: 0.24 } },
        timeScale: { borderColor: c.crosshair, timeVisible: true, secondsVisible: false, rightOffset: 2, maxBarSpacing: 28, minBarSpacing: 2 },
        handleScroll: { vertTouchDrag: false },
        kineticScroll: { touch: !th.reducedMotion, mouse: false },
      });
    } catch { onFail(true); return; }
    const cs = chart.addSeries(CandlestickSeries, { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: th.hc, borderUpColor: c.up, borderDownColor: c.down, priceLineVisible: true, priceLineColor: c.lastLine, lastValueVisible: true });
    const vs = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });
    const onCross = (p: MouseEventParams<Time>) => {
      const i = p.logical === undefined || p.point === undefined ? null : Math.round(p.logical);
      setHover(i !== null && i >= 0 && i < shownRef.current.length ? i : null);
    };
    chart.subscribeCrosshairMove(onCross);
    api.current = { chart, c: cs, v: vs, th };
    return () => { chart.unsubscribeCrosshairMove(onCross); chart.remove(); api.current = null; };
  }, [onFail]);

  // Data, axis and timeframe: a new timeframe or axis refits; a refresh keeps the player's pan and zoom.
  const fitKey = `${tf}/${axis}`;
  const lastFit = useRef("");
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    shownRef.current = candles;
    const f = axis === "mcap" ? { type: "custom" as const, minMove: 1, formatter: (p: number) => capStr(p) } : { type: "custom" as const, minMove: 1e-12, formatter: (p: number) => priceStr(p) };
    a.c.applyOptions({ priceFormat: f });
    a.c.setData(candles.map((k) => ({ time: toTime(k.t), open: k.o * scale, high: k.h * scale, low: k.l * scale, close: k.c * scale })));
    a.v.setData(candles.map((k) => ({ time: toTime(k.t), value: k.v, color: k.c >= k.o ? a.th.colours.upVol : a.th.colours.downVol })));
    if (lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      const n = candles.length;
      a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(-1, n - 90), to: n + 1 });
    }
  }, [candles, axis, scale, fitKey]);

  const k = candles[hover ?? candles.length - 1];
  const trades = data.pts.length;
  return (
    <div className="lpad-cc" ref={host} data-testid="lp-candles" data-candles={candles.length} data-tf={tf} data-axis={axis}>
      <div className="lpad-cc-bar">
        <div role="group" aria-label={LPS.ccTimeframe} className="lpad-seg">
          {TIMEFRAMES.map((x) => (
            <button key={x.id} type="button" className="lpad-segbtn" aria-pressed={tf === x.id} data-testid={`lp-tf-${x.id}`} onClick={() => setTf(x.id)}>{x.id}</button>
          ))}
        </div>
        <div role="group" aria-label={LPS.ccAxis} className="lpad-seg">
          {(["price", "mcap"] as const).map((a) => (
            <button key={a} type="button" className="lpad-segbtn" aria-pressed={axis === a} data-testid={`lp-axis-${a}`} onClick={() => setAxis(a)}>{a === "price" ? LPS.price : LPS.mcap}</button>
          ))}
        </div>
      </div>
      {k && (
        <p className="lpad-ohlc num" data-testid="lp-ohlc">
          <span>{`O ${fmt(k.o)}`}</span><span>{`H ${fmt(k.h)}`}</span><span>{`L ${fmt(k.l)}`}</span>
          <span data-dir={k.c >= k.o ? "up" : "down"}>{`C ${fmt(k.c)}`}</span>
          <span className="lpad-sub">{`Vol $${k.v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</span>
        </p>
      )}
      <div className="lpad-cc-plot" ref={plot} role="img" aria-label={LPS.ccLabel(trades)} />
      {trades === 0 && <p className="lpad-sub" data-testid="lp-candles-empty">{LPS.ccEmpty}</p>}
    </div>
  );
}
