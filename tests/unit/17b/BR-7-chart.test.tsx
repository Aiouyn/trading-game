// @vitest-environment happy-dom
// UI card 7 (17B BRK-B): the plot's logic with the library faked. BR-7-10 keyboard (←/→, +/−, Home/End, live
// region); toPoints (time = t × 120 s, gaps stay gaps); game-clock labels at day boundaries and in FR, with no Date
// (TZ-independent); BR-7-06 unit side: a same-t frame is update(), a new t is update(), anything else setData();
// BR-7-05 unit side: the options are the theme's token colours, hc = 2 px and no grid.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BR_STRINGS } from "@/apps/broker/strings";
import type { TickMarkType, UTCTimestamp } from "lightweight-charts";
import type { Bar } from "@/shell/contracts/history";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lib = vi.hoisted(() => {
  const calls: { op: string; arg?: unknown }[] = [];
  const opts: { chart: Record<string, unknown>; series: Record<string, unknown> } = { chart: {}, series: {} };
  const series = {
    setData: (d: unknown) => calls.push({ op: "setData", arg: d }),
    update: (d: unknown) => calls.push({ op: "update", arg: d }),
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
    addSeries: (_t: unknown, o: Record<string, unknown>) => { opts.series = o; return series; },
    applyOptions: (o: Record<string, unknown>) => { opts.chart = { ...opts.chart, ...o }; },
    options: () => opts.chart,
    timeScale: () => timeScale,
    paneSize: () => ({ width: 300, height: 200 }),
    setCrosshairPosition: (v: number, t: number) => calls.push({ op: "crosshair", arg: [v, t] }),
    clearCrosshairPosition: () => calls.push({ op: "clear" }),
    remove: () => calls.push({ op: "remove" }),
  };
  return { calls, opts, createChart: (_el: unknown, o: Record<string, unknown>) => { opts.chart = o; return chart; } };
});
vi.mock("lightweight-charts", () => ({
  createChart: lib.createChart, LineSeries: {}, ColorType: { Solid: "solid" }, CrosshairMode: { Magnet: 1 }, LineStyle: { Dotted: 1 },
  TickMarkType: { Year: 0, Month: 1, DayOfMonth: 2, Time: 3, TimeWithSeconds: 4 },
}));
const theme = vi.hoisted(() => ({ hc: false, fail: false }));
vi.mock("@/components/market/chartTheme", () => ({
  THEME_ATTRS: ["data-hc"],
  CHART_TOKENS: {},
  readChartTheme: () => theme.fail ? null : ({
    colours: { bg: "rgb(1, 1, 1)", text: "rgb(2, 2, 2)", grid: "rgb(3, 3, 3)", crosshair: "rgb(4, 4, 4)", series: "rgb(5, 5, 5)", lastLine: "rgb(6, 6, 6)", label: "rgb(7, 7, 7)" },
    hc: theme.hc, reducedMotion: false, fontFamily: "mono", fontSize: 12,
  }),
}));

const { CandleChart, MIN_VISIBLE, NO_CURSOR, SECONDS_PER_TICK, axisLabel, chartKey, decimalsOf, toPoints, visibleWindow } = await import("@/components/market/CandleChart");
const { barTime } = await import("@/components/market/ChartTable");

const bar = (t: number, c = "42.10"): Bar => ({ t, o: c, h: c, l: c, c, v: "100" }) as unknown as Bar;
const bars = (n: number, t0 = 1000) => Array.from({ length: n }, (_, i) => bar(t0 + i, `42.${String(i % 100).padStart(2, "0")}`));
const EN = BR_STRINGS.en, FR = BR_STRINGS.fr;
const sec = (n: number) => n as UTCTimestamp;

describe("toPoints (G1's one number site)", () => {
  it("time = t × 120 s, value = the close; a gap of missed ticks stays a gap (no fill, no interpolation)", () => {
    const p = toPoints([bar(10, "1.50"), bar(11, "1.60"), bar(15, "1.20")], "1.25");
    expect(SECONDS_PER_TICK).toBe(120);
    expect(p.data).toEqual([{ time: 1200, value: 1.5 }, { time: 1320, value: 1.6 }, { time: 1800, value: 1.2 }]);
    expect(p.last).toBe(1.25);
    expect(toPoints([], null)).toEqual({ data: [], last: null });
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

  it("options are the theme's token colours; line 1 px with grid; hc: 2 px, no grid", async () => {
    await render(bars(30));
    const c = lib.opts.chart as { layout: { background: { color: string }; textColor: string }; grid: { vertLines: { color: string; visible: boolean } }; crosshair: { vertLine: { color: string } } };
    expect([c.layout.background.color, c.layout.textColor, c.grid.vertLines.color, c.crosshair.vertLine.color]).toEqual(["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)"]);
    expect(c.grid.vertLines.visible).toBe(true);
    expect(lib.opts.series).toMatchObject({ color: "rgb(5, 5, 5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    expect(lib.calls.find((x) => x.op === "priceLine")!.arg).toMatchObject({ color: "rgb(6, 6, 6)", price: 42.18, lineStyle: 1, axisLabelVisible: false });
    await act(async () => root.unmount()); root = createRoot(el); theme.hc = true;
    await render(bars(30));
    expect((lib.opts.chart as { grid: { vertLines: { visible: boolean } } }).grid.vertLines.visible).toBe(false);
    expect(lib.opts.series.lineWidth).toBe(2);
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
    expect(lib.calls.filter((c) => c.op === "update").at(-1)!.arg).toEqual({ time: b.at(-1)!.t * 120, value: 43 });
    lib.calls.length = 0;
    await render([...same, bar(b.at(-1)!.t + 1, "43.10")]);
    expect(ops()).not.toContain("setData");
    expect(lib.calls.filter((c) => c.op === "update").at(-1)!.arg).toEqual({ time: (b.at(-1)!.t + 1) * 120, value: 43.1 });
    lib.calls.length = 0;
    await render(bars(10, 5000));
    expect(ops()).toEqual(expect.arrayContaining(["setData", "fit"]));
  });
  it("BR-7-10: focusable img; ← announces time + close; Home/End; +/− set the visible range; Enter does not bubble-handle", async () => {
    const b = bars(100);
    await render(b);
    expect(plot().getAttribute("role")).toBe("img");
    expect(plot().tabIndex).toBe(0);
    expect(plot().getAttribute("aria-label")).toBe("HALC price");
    await press("ArrowLeft");
    expect(live()).toBe(`${barTime(b[99]!.t, "en", EN)}: close ${b[99]!.c}`);
    expect(lib.calls.filter((c) => c.op === "crosshair").at(-1)!.arg).toEqual([Number(b[99]!.c), b[99]!.t * 120]);
    await press("ArrowLeft");
    expect(live()).toBe(`${barTime(b[98]!.t, "en", EN)}: close ${b[98]!.c}`);
    await press("Home");
    expect(live()).toBe(`${barTime(b[0]!.t, "en", EN)}: close ${b[0]!.c}`);
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
