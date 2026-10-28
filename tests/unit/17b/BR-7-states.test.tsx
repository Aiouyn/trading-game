// @vitest-environment happy-dom
// UI card 7 (17B BRK-B): the chart container on the real feed hook and the mock history. The plot chunk is faked
// (its own suite is BR-7-chart). BR-7-02 one request per range, latest wins; BR-7-03 a malformed reply is the
// error state, never a partial plot, and so is a malformed live candle; BR-7-06 live frames update/append; BR-7-11 loading / empty / error / stale and
// Retry = exactly one new request.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandleChartProps } from "@/components/market/CandleChart";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import type { CandleHistoryReq, CandlesBody } from "@/shell/contracts/channels";
import { MANUAL_TICK_MS, click, mount, q, setup, teardown, tick, wait, type Harness } from "./br-harness";

const fake = vi.hoisted(() => ({ fail: false }));
vi.mock("@/components/market/CandleChart", () => ({
  CandleChart: (p: CandleChartProps) => {
    if (fake.fail) queueMicrotask(p.onFail);
    return createElement("div", { "data-testid": "fake-plot", "data-n": p.bars.length, "data-t": p.bars.at(-1)?.t, "data-c": p.bars.at(-1)?.c, "data-last": p.last });
  },
}));

const state = (h: Harness) => q(h, "br-chart")?.dataset.state;
const plot = (h: Harness) => q(h, "fake-plot")?.dataset ?? null;
const rangeBtn = (h: Harness, r: string) => q(h, "br-chart-ranges")!.querySelector(`[data-range="${r}"]`) as HTMLElement;
/** A new res subscribes to a new candles channel: its snap lands after SNAP_DELAY_MS, then the request leaves. */
const flush = () => wait(SNAP_DELAY_MS);

let h: Harness;
beforeEach(() => { fake.fail = false; h = setup(); });
afterEach(() => teardown(h));

function spied(o: ConstructorParameters<typeof MockFeed>[0] = {}) {
  const feed = new MockFeed(o, { tickMs: MANUAL_TICK_MS });
  const real = feed.candleHistory.bind(feed);
  const spy = vi.spyOn(feed, "candleHistory");
  spy.mockImplementation(real);
  return { feed, real, spy, reqs: () => spy.mock.calls.map((c) => c[0] as CandleHistoryReq) };
}

describe("BR-7-02 / -06 plot and live", () => {
  it("1D by default: one tick request ending at the live bar; the plot's last bar is the live candle", async () => {
    const { feed, reqs } = spied();
    await mount(h, { context: "HALC", feed });
    await flush();
    expect(state(h)).toBe("plot");
    expect(reqs()).toHaveLength(1);
    expect(reqs()[0]).toMatchObject({ assetId: "HALC", res: "tick", to: feed.tick, from: feed.tick - 719 });
    expect(plot(h)).toMatchObject({ n: "720", t: String(feed.tick) });
    expect(rangeBtn(h, "1D").getAttribute("aria-pressed")).toBe("true");
  });
  it("20 live ticks: each new tick appends one bar, the newest bar follows the candle; no new request", async () => {
    const { feed, reqs } = spied();
    await mount(h, { context: "HALC", feed });
    await flush();
    for (let i = 1; i <= 20; i++) {
      await tick(feed);
      expect(plot(h)).toMatchObject({ n: String(720 + i), t: String(feed.tick) });
    }
    expect(reqs()).toHaveLength(1);
  });
  it("a range change asks once with the range's res; the tag is ticker.last whatever the range", async () => {
    const { feed, reqs } = spied();
    await mount(h, { context: "HALC", feed });
    await flush();
    const last = plot(h)!.last;
    await click(rangeBtn(h, "1W"));
    await flush();
    expect(reqs().at(-1)).toMatchObject({ res: "hour" });
    expect(state(h)).toBe("plot");
    expect(plot(h)!.last).toBe(last);
    await click(rangeBtn(h, "1W")); // same range: no request
    expect(reqs()).toHaveLength(2);
  });
  it("latest wins: a slow 1W reply that lands after 1Y is dropped", async () => {
    const { feed, real, spy } = spied();
    await mount(h, { context: "HALC", feed });
    await flush();
    let release!: () => void;
    spy.mockImplementationOnce((r) => new Promise((ok) => { release = () => ok(real(r)); }) as never);
    await click(rangeBtn(h, "1W"));
    await flush();
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ res: "hour" }); // left, held
    expect(state(h)).toBe("loading");
    await click(rangeBtn(h, "1Y"));
    await flush();
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ res: "day" });
    expect(state(h)).toBe("plot");
    const yearN = plot(h)!.n;
    release();
    await flush();
    expect(q(h, "br-chart")!.dataset.range).toBe("1Y");
    expect(plot(h)!.n).toBe(yearN);
    expect(rangeBtn(h, "1Y").getAttribute("aria-pressed")).toBe("true");
  });
  it("before the reply: the skeleton at the chart's place (role=status, aria-busy)", async () => {
    const { feed, spy } = spied();
    spy.mockImplementation(() => new Promise(() => {}) as never);
    await mount(h, { context: "HALC", feed });
    await flush();
    expect(state(h)).toBe("loading");
    expect(q(h, "br-chart-loading")!.getAttribute("aria-busy")).toBe("true");
  });
});

describe("BR-7-03 / -11 states", () => {
  it("a malformed bar (close 'x') → error, no plot; Retry asks exactly once and plots", async () => {
    const { feed, real, spy, reqs } = spied();
    spy.mockImplementationOnce((r) => ({ bars: [...real(r).bars.slice(0, -1), { t: r.to, o: "1", h: "1", l: "1", c: "x", v: "0" }] }) as never);
    await mount(h, { context: "HALC", feed });
    await flush();
    expect(state(h)).toBe("error");
    expect(q(h, "fake-plot")).toBeNull();
    expect(q(h, "br-chart-error")!.textContent).toContain("Couldn't load chart");
    await click(q(h, "br-chart-retry")!);
    await flush();
    expect(reqs()).toHaveLength(2);
    expect(state(h)).toBe("plot");
  });
  it("a live candle off its span (1W, t + 1) → error, never a plot; the next good candle brings the plot back", async () => {
    // The frame schema already drops a non-decimal field (useChannel resyncs), so the live bar that reaches the chart
    // and breaks parseBar is one whose t is not on the res span (PriceChart: live === "bad").
    const { feed, reqs } = spied();
    const real = feed.body.bind(feed);
    let bad = true;
    vi.spyOn(feed, "body").mockImplementation((ch) => {
      const b = real(ch);
      if (!bad || !ch.endsWith(":hour")) return b;
      const c = b as CandlesBody;
      return { ...c, live: { ...c.live, t: c.live.t + 1 } };
    });
    await mount(h, { context: "HALC", feed });
    await flush();
    expect(state(h)).toBe("plot");
    await click(rangeBtn(h, "1W"));
    await flush();
    expect(state(h)).toBe("error");
    expect(q(h, "fake-plot")).toBeNull();
    expect(reqs()).toHaveLength(1); // no 1W request leaves on a bad live bar
    bad = false; // the next good live bar sends the 1W request by itself
    await tick(feed);
    await flush();
    expect(state(h)).toBe("plot");
    expect(reqs()).toHaveLength(2);
    expect(reqs().at(-1)).toMatchObject({ res: "hour" });
    bad = true; // a bad candle after the plot drew: the error state, not a stale or partial plot
    await tick(feed);
    expect(state(h)).toBe("error");
    expect(q(h, "fake-plot")).toBeNull();
    expect(q(h, "br-chart-error")!.textContent).toContain("Couldn't load chart");
  });
  it("a rejected request → error; one Retry = one request", async () => {
    const { feed, spy, reqs } = spied();
    spy.mockImplementationOnce(() => Promise.reject(new Error("net")) as never);
    await mount(h, { context: "HALC", feed });
    await flush();
    expect(state(h)).toBe("error");
    await click(q(h, "br-chart-retry")!);
    await flush();
    expect(reqs()).toHaveLength(2);
  });
  it("?empty=1: zero bars → 'No price history yet.' and no toggle", async () => {
    await mount(h, { context: "HALC", scenario: { empty: true } });
    await flush();
    expect(state(h)).toBe("empty");
    expect(q(h, "br-chart-empty")!.textContent).toBe("No price history yet.");
    expect(q(h, "br-chart-toggle")!.closest(".br-chart-foot")!.classList.contains("off")).toBe(true);
  });
  it("the plot throws → error; Retry brings the plot back", async () => {
    fake.fail = true;
    const { feed } = spied();
    await mount(h, { context: "HALC", feed });
    await flush(); await flush();
    expect(state(h)).toBe("error");
    fake.fail = false;
    await click(q(h, "br-chart-retry")!);
    await flush();
    expect(state(h)).toBe("plot");
  });
  it("candles stale → dimmed box, and 'Updating…' once (the frame's line covers it when the ticker is stale too)", async () => {
    const feed = new MockFeed({ feed: "stale" }, { tickMs: MANUAL_TICK_MS });
    await mount(h, { context: "HALC", feed });
    await flush();
    for (let i = 0; i < 4; i++) await tick(feed);
    await wait(5000);
    const updating = h.el.ownerDocument.querySelectorAll('[data-testid="br-chart-updating"], [data-testid="br-updating"]');
    expect(updating.length).toBeLessThanOrEqual(1);
  });
  it("FR copy", async () => {
    const { feed, spy } = spied();
    spy.mockImplementationOnce(() => Promise.reject(new Error("net")) as never);
    await mount(h, { context: "HALC", feed, locale: "fr" });
    await flush();
    expect(q(h, "br-chart-error")!.textContent).toContain("Impossible de charger le graphique");
    expect(rangeBtn(h, "1D").textContent).toBe("1\u202fj");
  });
});
