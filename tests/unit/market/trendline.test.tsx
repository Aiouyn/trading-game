// @vitest-environment happy-dom
// Broker trend lines: the layer's placing / select / adjust / cancel rules on a fake chart mapping, the tick <-> bar
// index mapping, and the device store's account / asset isolation and reload (IndexedDB faked as one device's map).
// The alignment with the real canvas (pan, zoom, resize, new bars) is the e2e's job: happy-dom cannot draw the plot.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BR_STRINGS } from "@/apps/broker/strings";
import { TrendLayer, tickScale, type Geo } from "@/components/market/TrendLayer";
import type { TrendDraw, Trendline } from "@/components/market/trendlines";

const device = vi.hoisted(() => ({ kept: new Map<string, unknown>(), writes: [] as string[] }));
vi.mock("@/shell/persist", () => ({
  loadDrawings: async (scope: string) => structuredClone(device.kept.get(`quay.${scope}.drawings`) ?? null),
  queueDrawings: async (scope: string, v: unknown) => { device.writes.push(scope); device.kept.set(`quay.${scope}.drawings`, structuredClone(v)); },
}));
const store = await import("@/components/market/trendlines");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A pane 400 x 200: tick t at x = (t - 100) * 4 + view, price p at y = (60 - p) * 10 (price 60 at the top). */
function fakeGeo(view = 0, top = 60): Geo {
  return {
    key: `${view}|${top}`, width: 400, height: 200,
    tickToX: (t) => (t - 100) * 4 + view,
    xToTick: (x) => Math.max(0, Math.round((x - view) / 4 + 100)),
    priceToY: (p) => (top - p) * 10,
    yToPrice: (y) => top - y / 10,
    stepTick: (t, dir) => t + dir,
  };
}

let el: HTMLDivElement, root: Root, redraw: Set<() => void>, geo: Geo;
let state: { lines: readonly Trendline[]; placing: number | null; selected: string | null; placed: number };
const draw = (): TrendDraw => ({
  lines: state.lines, placing: state.placing, selected: state.selected,
  onChange: (l) => { state.lines = l; }, onSelect: (id) => { state.selected = id; }, onPlaced: () => { state.placing = null; state.placed += 1; },
});
async function render() {
  await act(async () => {
    root.render(createElement(TrendLayer, { draw: draw(), geoOf: () => geo, redraw, t: BR_STRINGS.en, locale: "en", precision: 2 }));
  });
}
async function chartRedraws(g: Geo) { geo = g; await act(async () => { redraw.forEach((f) => f()); }); }
const layer = () => el.querySelector<SVGSVGElement>('[data-testid="br-trend-layer"]');
const ptr = (n: Element, type: string, x: number, y: number) => act(async () => {
  n.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
});
const lineXY = (id: string) => {
  const l = el.querySelector(`[data-testid="br-trend-${id}"] [data-testid="br-trend-line"]`)!;
  return ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k)));
};

beforeEach(async () => {
  el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  redraw = new Set(); geo = fakeGeo();
  state = { lines: [], placing: null, selected: null, placed: 0 };
  await render();
  await chartRedraws(geo); // the chart's first paint
});
afterEach(async () => { await act(async () => root.unmount()); el.remove(); });

describe("trend layer on the chart's mapping", () => {
  it("nothing until the chart has painted; then an empty layer that lets the pointer through", async () => {
    await act(async () => root.unmount());
    root = createRoot(el); redraw = new Set();
    await render();
    expect(layer()).toBeNull();
    await chartRedraws(fakeGeo());
    expect(layer()).not.toBeNull();
    expect(layer()!.classList.contains("placing")).toBe(false); // CSS: pointer-events none, so the chart pans
  });

  it("tap, tap: the first point waits, the second places the line in tick and price, selects it, ends the tool", async () => {
    state.placing = 1; await render();
    expect(layer()!.classList.contains("placing")).toBe(true); // takes the pointer: no chart drag while drawing
    await ptr(layer()!, "pointerdown", 40, 100); await ptr(layer()!, "pointerup", 40, 100);
    expect(layer()!.hasAttribute("data-first")).toBe(true);
    expect(state.lines).toEqual([]);
    await ptr(layer()!, "pointermove", 200, 50);
    expect(el.querySelector('[data-testid="br-trend-draft"]')).not.toBeNull();
    await ptr(layer()!, "pointerdown", 200, 50);
    expect(state.lines).toEqual([{ id: "l1", a: { t: 110, p: 50 }, b: { t: 150, p: 55 } }]);
    expect(state.selected).toBe("l1");
    expect(state.placed).toBe(1);
  });

  it("press, drag, release places it too (touch)", async () => {
    state.placing = 1; await render();
    await ptr(layer()!, "pointerdown", 40, 100);
    await ptr(layer()!, "pointermove", 120, 20);
    await ptr(layer()!, "pointerup", 120, 20);
    expect(state.lines).toEqual([{ id: "l1", a: { t: 110, p: 50 }, b: { t: 130, p: 58 } }]);
  });

  it("cancel drops the first point: a new placing session starts clean", async () => {
    state.placing = 1; await render();
    await ptr(layer()!, "pointerdown", 40, 100); await ptr(layer()!, "pointerup", 40, 100);
    state.placing = null; await render(); // Cancel / Esc
    expect(layer()!.hasAttribute("data-first")).toBe(false);
    state.placing = 2; await render();
    expect(layer()!.hasAttribute("data-first")).toBe(false);
    await ptr(layer()!, "pointerdown", 200, 50); await ptr(layer()!, "pointerup", 200, 50);
    expect(state.lines).toEqual([]); // that tap is a new first point, not the end of the cancelled line
  });

  it("a press outside the pane or on the price axis places nothing", async () => {
    state.placing = 1; await render();
    await ptr(layer()!, "pointerdown", 450, 100);
    expect(layer()!.hasAttribute("data-first")).toBe(false);
  });

  it("select, drag one end: only that end moves, in tick and price; the other stays", async () => {
    state.lines = [{ id: "l1", a: { t: 110, p: 50 }, b: { t: 150, p: 55 } }]; await render();
    await ptr(el.querySelector('[data-testid="br-trend-l1"] .cc-trend-hit')!, "pointerdown", 100, 75);
    expect(state.selected).toBe("l1");
    await render();
    const end = el.querySelector('[data-testid="br-trend-handle-b"]')!;
    expect(end).not.toBeNull();
    await ptr(end, "pointerdown", 200, 50);
    await ptr(end, "pointermove", 300, 30);
    await render();
    expect(lineXY("l1")).toEqual([40, 100, 300, 30]); // the drag shows live
    await ptr(end, "pointerup", 320, 20);
    expect(state.lines).toEqual([{ id: "l1", a: { t: 110, p: 50 }, b: { t: 180, p: 58 } }]);
  });

  it("keyboard: an end moves one bar with left/right and a few pixels of price with up/down", async () => {
    state.lines = [{ id: "l1", a: { t: 110, p: 50 }, b: { t: 150, p: 55 } }]; state.selected = "l1"; await render();
    const a = el.querySelector<SVGElement>('[data-testid="br-trend-handle-a"]')!;
    expect(a.getAttribute("aria-label")).toMatch(/^Line start: .+ at 50\.00\. Arrow keys move it\.$/);
    await act(async () => { a.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
    expect(state.lines[0]!.a).toEqual({ t: 111, p: 50 });
    await render();
    await act(async () => { a.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })); });
    expect(state.lines[0]!.a).toEqual({ t: 111, p: 50.4 });
  });

  it("stays on its tick and price when the chart pans, zooms or rescales (re-mapped on each redraw)", async () => {
    state.lines = [{ id: "l1", a: { t: 110, p: 50 }, b: { t: 150, p: 55 } }]; await render();
    expect(lineXY("l1")).toEqual([40, 100, 200, 50]);
    await chartRedraws(fakeGeo(-30, 58)); // panned 30 px, the price scale moved 2
    expect(lineXY("l1")).toEqual([10, 80, 170, 30]);
    expect(state.lines[0]).toEqual({ id: "l1", a: { t: 110, p: 50 }, b: { t: 150, p: 55 } }); // the anchor never changes
  });

  it("each line is a labelled, focusable button (focus selects it)", async () => {
    state.lines = [{ id: "l1", a: { t: 110, p: 50 }, b: { t: 150, p: 55 } }]; await render();
    const g = el.querySelector<SVGElement>('[data-testid="br-trend-l1"]')!;
    expect(g.getAttribute("role")).toBe("button");
    expect(g.getAttribute("tabindex")).toBe("0");
    expect(g.getAttribute("aria-label")).toMatch(/^Trend line 1: .+ at 50\.00 to .+ at 55\.00$/);
    await act(async () => { g.dispatchEvent(new FocusEvent("focus")); g.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(state.selected).toBe("l1");
  });
});

describe("tick <-> bar index", () => {
  it("between bars, at bars, and past either end at the average spacing", () => {
    const s = tickScale([100, 101, 103, 110]);
    expect([s.toLogical(100), s.toLogical(101), s.toLogical(102), s.toLogical(110)]).toEqual([0, 1, 1.5, 3]);
    expect(s.toLogical(120)).toBeCloseTo(3 + 10 / (10 / 3));
    expect(s.toLogical(90)).toBeCloseTo(-3);
    for (const t of [95, 100, 102, 106, 110, 130]) expect(s.toTick(s.toLogical(t))).toBeCloseTo(t);
  });
  it("one bar", () => {
    const s = tickScale([50]);
    expect([s.toLogical(50), s.toLogical(52), s.toTick(-1)]).toEqual([0, 2, 49]);
  });
});

describe("device store: per account, per asset, kept across a reload", () => {
  const L = (id: string, t: number): Trendline => ({ id, a: { t, p: 10 }, b: { t: t + 5, p: 11 } });
  beforeEach(() => { device.kept.clear(); device.writes.length = 0; store._resetTrendlinesForTests(); });
  /** What a chart mounted for (scope, asset) shows once the device copy is read (useTrendlines starts the read). */
  const ready = async (scope: string, asset: string) => {
    const host = document.createElement("div");
    const r = createRoot(host);
    let seen: readonly Trendline[] | null = null;
    const P = () => { seen = store.useTrendlines(scope, asset); return null; };
    await act(async () => { r.render(createElement(P)); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    await act(async () => r.unmount());
    return seen;
  };

  it("no scope (session resolving) shows nothing; the read is per scope", async () => {
    expect(store.trendlinesOf(null, "HALC")).toBeNull();
    expect(store.drawScope({ status: "loading" })).toBeNull();
    expect(store.drawScope({ status: "signed_out" })).toBe("guest");
  });

  it("guest lines never show in an account, A's never in B's, HALC's never on MRDN; a reload keeps each", async () => {
    expect(await ready("guest", "HALC")).toEqual([]);
    store.setTrendlines("guest", "HALC", [L("l1", 100)]);
    expect(await ready("accA", "HALC")).toEqual([]);
    store.setTrendlines("accA", "HALC", [L("l1", 200), L("l2", 300)]);
    store.setTrendlines("accA", "MRDN", [L("l1", 400)]);
    expect(await ready("accB", "HALC")).toEqual([]);
    store.setTrendlines("accA", "MRDN", []); // the last MRDN line deleted
    await Promise.resolve();
    store._resetTrendlinesForTests(); // reload: only the device copy is left
    expect(await ready("accA", "HALC")).toEqual([L("l1", 200), L("l2", 300)]);
    expect(await ready("accA", "MRDN")).toEqual([]);
    expect(await ready("guest", "HALC")).toEqual([L("l1", 100)]);
    expect(await ready("accB", "HALC")).toEqual([]);
    expect(device.kept.has("quay.accB.drawings")).toBe(false); // reading never writes
  });

  it("a broken or foreign device copy is dropped, never shown", () => {
    expect(store.parseSaved({ HALC: [{ id: "l1", a: { t: 1, p: 2 }, b: { t: 3, p: 4 } }, { id: "x", a: { t: -1, p: 2 }, b: { t: 3, p: 4 } }, { id: "y", a: { t: 1.5, p: 2 }, b: { t: 3, p: 4 } }, { id: "z", a: { t: 1, p: 0 }, b: { t: 3, p: 4 } }, "bad"], "<script>": [{ id: "l1", a: { t: 1, p: 2 }, b: { t: 3, p: 4 } }], MRDN: "x" }))
      .toEqual({ HALC: [{ id: "l1", a: { t: 1, p: 2 }, b: { t: 3, p: 4 } }] });
    expect(store.parseSaved(null)).toEqual({});
    expect(store.parseSaved([1, 2])).toEqual({});
  });

  it("new ids never repeat one in the list", () => {
    expect(store.newLineId([L("l1", 1), L("l3", 2)])).toBe("l4");
    expect(store.newLineId([L("l3", 1)])).toBe("l2");
  });
});
