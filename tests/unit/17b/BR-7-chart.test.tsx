// @vitest-environment happy-dom
// UI card 7 (17B BRK-B): the plot's logic with the library faked. BR-7-10 keyboard (←/→, +/−, Home/End, live
// region); toPoints (time = t × 120 s, gaps stay gaps); game-clock labels at day boundaries and in FR, with no Date
// (TZ-independent); BR-7-06 unit side: a same-t frame is update(), a new t is update(), anything else setData();
// BR-7-05 unit side: the options are the theme's token colours, hc = outlined bodies and no grid.
// M1-07: candles (o/h/l/c) + a volume histogram on its own scale; the legend and the crosshair read the whole bar.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BR_STRINGS } from "@/apps/broker/strings";
import type { TickMarkType, UTCTimestamp } from "lightweight-charts";
import type { Bar } from "@/shell/contracts/history";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lib = vi.hoisted(() => {
  const calls: { op: string; arg?: unknown }[] = [];
  const opts: { chart: Record<string, unknown>; series: Record<string, unknown>; volume: Record<string, unknown>; volScale: Record<string, unknown> } = { chart: {}, series: {}, volume: {}, volScale: {} };
  const volume = {
    setData: (d: unknown) => calls.push({ op: "volSetData", arg: d }),
    update: (d: unknown, h?: boolean) => calls.push({ op: h ? "volHistUpdate" : "volUpdate", arg: d }),
    applyOptions: (o: Record<string, unknown>) => { opts.volume = { ...opts.volume, ...o }; },
    options: () => opts.volume,
  };
  const cross = { fn: null as null | ((p: unknown) => void) };
  const series = {
    setData: (d: unknown) => calls.push({ op: "setData", arg: d }),
    update: (d: unknown, h?: boolean) => calls.push({ op: h ? "histUpdate" : "update", arg: d }),
    applyOptions: (o: Record<string, unknown>) => { opts.series = { ...opts.series, ...o }; },
    createPriceLine: (o: unknown) => { calls.push({ op: "priceLine", arg: o }); return { applyOptions: (x: unknown) => calls.push({ op: "line", arg: x }), options: () => o }; },
    removePriceLine: () => calls.push({ op: "removeLine" }),
    priceToCoordinate: () => 50,
    options: () => opts.series,
  };
  const timeScale = {
    fitContent: () => calls.push({ op: "fit" }),
    setVisibleLogicalRange: (r: unknown) => calls.push({ op: "range", arg: r }),
    getVisibleLogicalRange: () => null,
    subscribeVisibleLogicalRangeChange: () => {}, unsubscribeVisibleLogicalRangeChange: () => {},
    subscribeSizeChange: () => {}, unsubscribeSizeChange: () => {},
  };
  const chart = {
    addSeries: (t: unknown, o: Record<string, unknown>) => { if (t === "histogram") { opts.volume = o; return volume; } opts.series = o; return series; },
    priceScale: (id: string) => ({ applyOptions: (o: Record<string, unknown>) => { if (id === "vol") opts.volScale = o; } }),
    subscribeCrosshairMove: (fn: (p: unknown) => void) => { cross.fn = fn; },
    unsubscribeCrosshairMove: () => { cross.fn = null; },
    applyOptions: (o: Record<string, unknown>) => { opts.chart = { ...opts.chart, ...o }; },
    options: () => opts.chart,
    timeScale: () => timeScale,
    paneSize: () => ({ width: 300, height: 200 }),
    setCrosshairPosition: (v: number, t: number) => calls.push({ op: "crosshair", arg: [v, t] }),
    clearCrosshairPosition: () => calls.push({ op: "clear" }),
    remove: () => calls.push({ op: "remove" }),
  };
  return { calls, opts, cross, createChart: (_el: unknown, o: Record<string, unknown>) => { opts.chart = o; return chart; } };
});
vi.mock("lightweight-charts", () => ({
  createChart: lib.createChart, CandlestickSeries: "candlestick", HistogramSeries: "histogram", ColorType: { Solid: "solid" }, CrosshairMode: { Magnet: 1 }, LineStyle: { Dotted: 1 },
  TickMarkType: { Year: 0, Month: 1, DayOfMonth: 2, Time: 3, TimeWithSeconds: 4 },
}));
const theme = vi.hoisted(() => ({ hc: false, fail: false }));
vi.mock("@/components/market/chartTheme", () => ({
  THEME_ATTRS: ["data-hc"],
  CHART_TOKENS: {},
  readChartTheme: () => theme.fail ? null : ({
    colours: { bg: "rgb(1, 1, 1)", text: "rgb(2, 2, 2)", grid: "rgb(3, 3, 3)", crosshair: "rgb(4, 4, 4)", series: "rgb(5, 5, 5)", lastLine: "rgb(6, 6, 6)", label: "rgb(7, 7, 7)",
      up: "rgb(8, 8, 8)", down: "rgb(9, 9, 9)", upVol: "rgb(10, 10, 10)", downVol: "rgb(11, 11, 11)" },
    hc: theme.hc, reducedMotion: false, fontFamily: "mono", fontSize: 12,
  }),
}));

const { CandleChart, MIN_VISIBLE, NO_CURSOR, SECONDS_PER_TICK, axisLabel, chartKey, decimalsOf, toPoints, visibleWindow } = await import("@/components/market/CandleChart");
const { barTime } = await import("@/components/market/ChartTable");

const bar = (t: number, c = "42.10"): Bar => ({ t, o: c, h: c, l: c, c, v: "100" }) as unknown as Bar;
const candle = (t: number, o: string, h: string, l: string, c: string, v: string): Bar => ({ t, o, h, l, c, v }) as unknown as Bar;
const bars = (n: number, t0 = 1000) => Array.from({ length: n }, (_, i) => bar(t0 + i, `42.${String(i % 100).padStart(2, "0")}`));
const EN = BR_STRINGS.en, FR = BR_STRINGS.fr;
const sec = (n: number) => n as UTCTimestamp;

describe("toPoints (G1's one number site)", () => {
  it("time = t × 120 s, o/h/l/c and volume as sent; a gap of missed ticks stays a gap (no fill, no interpolation)", () => {
    const p = toPoints([candle(10, "1.40", "1.55", "1.35", "1.50", "7"), candle(11, "1.50", "1.60", "1.50", "1.60", "0"), candle(15, "1.30", "1.30", "1.10", "1.20", "12")], "1.25");
    expect(SECONDS_PER_TICK).toBe(120);
    expect(p.data).toEqual([
      { time: 1200, open: 1.4, high: 1.55, low: 1.35, close: 1.5 },
      { time: 1320, open: 1.5, high: 1.6, low: 1.5, close: 1.6 },
      { time: 1800, open: 1.3, high: 1.3, low: 1.1, close: 1.2 },
    ]);
    expect(p.vol).toEqual([{ time: 1200, value: 7, up: true }, { time: 1320, value: 0, up: true }, { time: 1800, value: 12, up: false }]);
    expect(p.last).toBe(1.25);
    expect(toPoints([], null)).toEqual({ data: [], vol: [], last: null });
  });
  it("720 ticks = one LWC day, so library day marks fall on game days", () => {
    expect(toPoints([bar(720 * 38)], null).data[0]!.time).toBe(86_400 * 38);
  });
  it("precision = the decimals in the server string", () => {
    expect([decimalsOf("42.10"), decimalsOf("0.0005"), decimalsOf("1200"), decimalsOf("")]).toEqual([2, 4, 0, 0]);
  });
});

describe("game-clock labels (no Date: TZ-independent)", () => {
  it("bar time: the top-bar strip format; day boundary at 720 ticks; Day 1 at tick 0", () => {
    expect(barTime(0, "en", EN)).toBe("Day 1 · 00:00");
    expect(barTime(719, "en", EN)).toBe("Day 1 · 23:58");
    expect(barTime(720, "en", EN)).toBe("Day 2 · 00:00");
    expect(barTime(720 * 38 + 340, "en", EN)).toBe("Day 39 · 11:20");
  });
  it("FR uses the shell's FR clock (NNBSP)", () => {
    expect(barTime(720 * 38 + 340, "fr", FR)).toBe("Jour\u00a039\u00a0· 11:20");
  });
  it("below tick 0 or not an integer: tickLabel", () => {
    expect(barTime(-1, "en", EN)).toBe("t -1");
    expect(barTime(1.5, "en", EN)).toBe("t 1.5");
  });
  it("axis: day-level marks read as the phone clock, finer marks as HH:mm", () => {
    expect(axisLabel(sec(720 * 38 * 120), 2 as TickMarkType, "en")).toBe("D39 · 00:00");
    expect(axisLabel(sec(720 * 38 * 120), 0 as TickMarkType, "en")).toBe("D39 · 00:00");
    expect(axisLabel(sec((720 * 38 + 30) * 120), 3 as TickMarkType, "en")).toBe("01:00");
    expect(axisLabel(sec((720 * 38 - 1) * 120), 3 as TickMarkType, "en")).toBe("23:58");
  });
  it("the same labels whatever the process TZ", () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Kiritimati";
      expect(barTime(720 * 38, "en", EN)).toBe("Day 39 · 00:00");
      expect(axisLabel(sec(720 * 38 * 120), 2 as TickMarkType, "en")).toBe("D39 · 00:00");
    } finally { process.env.TZ = tz; }
  });
});

describe("BR-7-10 keyboard model", () => {
  const n = 100;
  it("←/→ from no crosshair start at the newest bar, then move one bar, clamped", () => {
    expect(chartKey(NO_CURSOR, "ArrowLeft", n)!.index).toBe(99);
    expect(chartKey({ index: 50, visible: null }, "ArrowLeft", n)!.index).toBe(49);
    expect(chartKey({ index: 50, visible: null }, "ArrowRight", n)!.index).toBe(51);
    expect(chartKey({ index: 0, visible: null }, "ArrowLeft", n)!.index).toBe(0);
    expect(chartKey({ index: 99, visible: null }, "ArrowRight", n)!.index).toBe(99);
  });
  it("Home / End jump to the first / last bar", () => {
    expect(chartKey({ index: 50, visible: null }, "Home", n)!.index).toBe(0);
    expect(chartKey({ index: 50, visible: null }, "End", n)!.index).toBe(99);
  });
  it("+ halves the visible bars down to MIN_VISIBLE; − doubles back to all", () => {
    let c = NO_CURSOR;
    c = chartKey(c, "+", n)!; expect(c.visible).toBe(50);
    c = chartKey(c, "=", n)!; expect(c.visible).toBe(25);
    for (let i = 0; i < 5; i++) c = chartKey(c, "+", n)!;
    expect(c.visible).toBe(MIN_VISIBLE);
    c = chartKey(c, "-", n)!; expect(c.visible).toBe(20);
    c = chartKey(c, "\u2212", n)!; expect(c.visible).toBe(40);
    c = chartKey(c, "_", n)!; expect(c.visible).toBe(80);
    c = chartKey(c, "-", n)!; expect(c.visible).toBeNull();
  });
  it("Escape clears the crosshair; other keys are not handled; no bars = nothing handled", () => {
    expect(chartKey({ index: 3, visible: null }, "Escape", n)).toEqual({ index: null, visible: null });
    expect(chartKey(NO_CURSOR, "Escape", n)).toBeNull();
    expect(chartKey(NO_CURSOR, "Enter", n)).toBeNull();
    expect(chartKey(NO_CURSOR, "ArrowLeft", 0)).toBeNull();
  });
  it("a zoom anchors at the newest bar and follows the crosshair left", () => {
    expect(visibleWindow(100, { index: null, visible: 10 })).toEqual({ from: 90, to: 99 });
    expect(visibleWindow(100, { index: 20, visible: 10 })).toEqual({ from: 20, to: 29 });
    expect(visibleWindow(100, { index: 95, visible: 10 })).toEqual({ from: 90, to: 99 });
    expect(visibleWindow(100, { index: null, visible: null })).toBeNull();
  });
});

describe("CandleChart with the library faked", () => {
  let el: HTMLDivElement; let root: Root;
  beforeEach(() => { lib.calls.length = 0; theme.hc = false; theme.fail = false; el = document.createElement("div"); document.body.append(el); root = createRoot(el); });
  afterEach(async () => { await act(async () => root.unmount()); el.remove(); });
  const outer = vi.fn();
  const render = (b: readonly Bar[], last: string | null = "42.18", extra: { onFail?: () => void; halted?: boolean } = {}) =>
    act(async () => root.render(createElement("div", { onKeyDown: outer }, createElement(CandleChart, { bars: b, last, halted: extra.halted ?? false, t: EN, locale: "en", label: "HALC price", onFail: extra.onFail ?? (() => {}) }))));
  const plot = () => el.querySelector('[data-testid="br-chart-canvas"]') as HTMLElement;
  const live = () => el.querySelector('[data-testid="br-chart-live"]')!.textContent;
  const press = (k: string) => act(async () => { plot().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });
  const ops = () => lib.calls.map((c) => c.op);

  it("options are the theme's token colours; candles gain/loss, volume on its own hidden scale; hc: outlined, no grid", async () => {
    await render(bars(30));
    const c = lib.opts.chart as { layout: { background: { color: string }; textColor: string }; grid: { vertLines: { color: string; visible: boolean } }; crosshair: { vertLine: { color: string } } };
    expect([c.layout.background.color, c.layout.textColor, c.grid.vertLines.color, c.crosshair.vertLine.color]).toEqual(["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)"]);
    expect(c.grid.vertLines.visible).toBe(true);
    expect(lib.opts.series).toMatchObject({ upColor: "rgb(8, 8, 8)", downColor: "rgb(9, 9, 9)", wickUpColor: "rgb(8, 8, 8)", wickDownColor: "rgb(9, 9, 9)", borderVisible: false, priceLineVisible: false, lastValueVisible: false });
    expect(lib.opts.volume).toMatchObject({ priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    expect(lib.opts.volScale).toEqual({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });
    // Axis marks get room for the longest label (day marks, EN and FR), so they never overlap at 520; bars stay candle-sized.
    const ts = (lib.opts.chart as { timeScale: { tickMarkMaxCharacterLength: number; maxBarSpacing: number } }).timeScale;
    for (const loc of ["en", "fr"]) expect(axisLabel(sec(720 * 98 * 120), 0 as TickMarkType, loc).length).toBeLessThanOrEqual(ts.tickMarkMaxCharacterLength);
    expect(ts.maxBarSpacing).toBe(24);
    const vol = lib.calls.find((x) => x.op === "volSetData")!.arg as { color: string }[];
    expect(vol).toHaveLength(30);
    expect(new Set(vol.map((v) => v.color))).toEqual(new Set(["rgb(10, 10, 10)"])); // flat demo bars: close = open → up colour
    expect(lib.calls.find((x) => x.op === "priceLine")!.arg).toMatchObject({ color: "rgb(6, 6, 6)", price: 42.18, lineStyle: 1, axisLabelVisible: false });
    await act(async () => root.unmount()); root = createRoot(el); theme.hc = true;
    await render(bars(30));
    expect((lib.opts.chart as { grid: { vertLines: { visible: boolean } } }).grid.vertLines.visible).toBe(false);
    expect(lib.opts.series.borderVisible).toBe(true);
  });
  it("tag shows ticker.last (decText) and the halted band + label only when halted", async () => {
    await render(bars(30), "1234.50");
    expect(el.querySelector('[data-testid="br-chart-tag"]')!.textContent).toBe("1,234.50");
    expect(el.querySelector('[data-testid="br-chart-halt"]')).toBeNull();
    await render(bars(30), "1234.50", { halted: true });
    expect(el.querySelector('[data-testid="br-chart-halted"]')!.textContent).toBe("Halted");
  });
  it("BR-7-06: same t → update; new t → update; a new range → setData + fit", async () => {
    const b = bars(30);
    await render(b);
    expect(ops().filter((o) => o === "setData")).toHaveLength(1);
    lib.calls.length = 0;
    const same = [...b.slice(0, -1), bar(b.at(-1)!.t, "43.00")];
    await render(same);
    expect(ops()).toContain("update");
    expect(ops()).not.toContain("setData");
    expect(lib.calls.filter((c) => c.op === "update").at(-1)!.arg).toEqual({ time: b.at(-1)!.t * 120, open: 43, high: 43, low: 43, close: 43 });
    expect(lib.calls.filter((c) => c.op === "volUpdate").at(-1)!.arg).toEqual({ time: b.at(-1)!.t * 120, value: 100, color: "rgb(10, 10, 10)" });
    lib.calls.length = 0;
    await render([...same, bar(b.at(-1)!.t + 1, "43.10")]);
    expect(ops()).not.toContain("setData");
    expect(lib.calls.filter((c) => c.op === "update").at(-1)!.arg).toEqual({ time: (b.at(-1)!.t + 1) * 120, open: 43.1, high: 43.1, low: 43.1, close: 43.1 });
    // M1-07 late volume: one older bar replaced in place (same t) is a historical update; the view (fit, cursor) stays.
    const grown = [...same, bar(b.at(-1)!.t + 1, "43.10")];
    await render(grown);
    for (const i of [grown.length - 2, 5, 0]) {
      lib.calls.length = 0;
      const fixed = grown.map((x, j) => (j === i ? ({ ...x, v: "250" }) as Bar : x));
      await render(fixed);
      expect(ops()).toEqual(["histUpdate", "volHistUpdate", "line"]);
      expect(lib.calls[1]!.arg).toMatchObject({ time: grown[i]!.t * 120, value: 250 });
      await render(grown);
    }
    lib.calls.length = 0;
    await render(bars(10, 5000));
    expect(ops()).toEqual(expect.arrayContaining(["setData", "volSetData", "fit"]));
  });
  it("M1-07 legend: the newest bar's O H L C Vol by default, the hovered bar under the pointer, back on leave", async () => {
    const b = [candle(100, "42.00", "42.40", "41.90", "42.30", "1200"), candle(101, "42.30", "42.30", "41.80", "41.95", "0")];
    await render(b);
    const legend = () => el.querySelector('[data-testid="br-chart-legend"]') as HTMLElement;
    const vals = () => [...legend().querySelectorAll("[data-k]")].map((x) => x.textContent);
    expect(legend().dataset.t).toBe("101");
    expect(vals()).toEqual(["O 42.30", "H 42.30", "L 41.80", "C 41.95", "Vol 0"]);
    await act(async () => lib.cross.fn!({ logical: 0, point: { x: 1, y: 1 } }));
    expect(legend().dataset.t).toBe("100");
    expect(vals()).toEqual(["O 42.00", "H 42.40", "L 41.90", "C 42.30", "Vol 1,200"]);
    await act(async () => lib.cross.fn!({ logical: undefined, point: undefined }));
    expect(legend().dataset.t).toBe("101");
  });
  it("BR-7-10: focusable img; ← announces time + the candle; Home/End; +/− set the visible range; Enter does not bubble-handle", async () => {
    const b = bars(100);
    await render(b);
    expect(plot().getAttribute("role")).toBe("img");
    expect(plot().tabIndex).toBe(0);
    expect(plot().getAttribute("aria-label")).toBe("HALC price");
    await press("ArrowLeft");
    const say = (x: Bar) => `${barTime(x.t, "en", EN)}: open ${x.o}, high ${x.h}, low ${x.l}, close ${x.c}, volume ${x.v}`;
    expect(live()).toBe(say(b[99]!));
    expect(lib.calls.filter((c) => c.op === "crosshair").at(-1)!.arg).toEqual([Number(b[99]!.c), b[99]!.t * 120]);
    await press("ArrowLeft");
    expect(live()).toBe(say(b[98]!));
    await press("Home");
    expect(live()).toBe(say(b[0]!));
    await press("End");
    expect(live()).toContain(`close ${b[99]!.c}`);
    lib.calls.length = 0;
    await press("+");
    expect(lib.calls.find((c) => c.op === "range")!.arg).toEqual({ from: 49.5, to: 99.5 });
    await press("-");
    expect(ops()).toContain("fit");
    outer.mockClear();
    await press("ArrowRight");
    expect(outer).not.toHaveBeenCalled(); // handled keys stop at the chart (the Broker's B/S/Enter handler never sees them)
    await press("Enter");
    expect(outer).toHaveBeenCalledTimes(1);
  });
  it("a theme that does not resolve → onFail (the container's error state), no chart", async () => {
    theme.fail = true;
    const onFail = vi.fn();
    await render(bars(5), "1.00", { onFail });
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(ops()).not.toContain("setData");
  });
});
