// @vitest-environment happy-dom
// UI card 10 seams outside the Broker: Wire's window context selects a story (BR-10-08), the single-instance window
// takes a new context when opened on one, and the `?news=` mock hook (its own error/loading, Retry recovers, off
// without QUAY_HOOKS).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WireApp from "@/apps/wire/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { ChannelName, NewsBody } from "@/shell/contracts/channels";
import { NEWS } from "@/shell/contracts/fixtures/news";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed, type FeedTransport } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";
import { openApp } from "@/shell/wm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class HandFeed implements FeedTransport {
  readonly tickMs = 3_600_000;
  private readonly subs = new Map<ChannelName, Set<(raw: unknown) => void>>();
  private seq = 0;
  subscribe(ch: ChannelName, fn: (raw: unknown) => void) {
    const s = this.subs.get(ch) ?? new Set();
    s.add(fn);
    this.subs.set(ch, s);
    return () => { s.delete(fn); };
  }
  resync() {}
  async snap(body: NewsBody) {
    await act(async () => { for (const fn of this.subs.get("news") ?? []) fn({ t: "snap", ch: "news", seq: ++this.seq, tick: 27_700, body }); });
  }
}

describe("Wire selects its window context (BR-10-08)", () => {
  let el: HTMLDivElement, root: Root, store: ShellStore, feed: HandFeed;
  beforeEach(() => {
    el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
    store = createShellStore(defaultChannels());
    feed = new HandFeed();
    setFeed(feed);
  });
  afterEach(async () => { await act(async () => root.unmount()); el.remove(); setFeed(null); });
  const render = (context?: string) => act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(WireApp, { context }))); });
  const openId = () => el.querySelector<HTMLElement>('[data-testid="wire"]')?.dataset.open ?? null;
  const detailId = () => el.querySelector<HTMLElement>('[data-testid="wire-detail"]')?.dataset.id ?? null;

  it("context n-1: once the feed snaps, n-1's detail is open", async () => {
    await render("n-1");
    expect(detailId()).toBeNull();
    await feed.snap({ items: [...NEWS] });
    expect([openId(), detailId()]).toEqual(["n-1", "n-1"]);
  });
  it("a new context switches the selection; an id no longer in the ring shows the feed with nothing selected", async () => {
    await render("n-1");
    await feed.snap({ items: [...NEWS] });
    await render("n-3");
    expect(detailId()).toBe("n-3");
    await render("n-gone");
    expect([openId(), detailId()]).toEqual([null, null]);
    expect(el.querySelector('[data-testid="wire-feed"]')!.hasAttribute("hidden")).toBe(false);
  });
  it("the same context again does not reopen a story the player closed; no context selects nothing", async () => {
    await render();
    await feed.snap({ items: [...NEWS] });
    expect(openId()).toBeNull();
    await render("n-2");
    expect(detailId()).toBe("n-2");
    await act(async () => { el.querySelector<HTMLElement>('[data-testid="wire-back"]')!.click(); });
    expect(openId()).toBeNull();
    await render("n-2");
    expect(openId()).toBeNull();
  });
});

describe("wm.openApp: a single-instance app takes a new context", () => {
  const A = { x: 0, y: 0, w: 1424, h: 798 };
  it("Wire open on n-1 then opened on n-3: one window, same place, context n-3, on top", () => {
    let w = openApp([], "wire", A, "n-1").windows;
    w = openApp(w, "markets", A).windows;
    const first = w.find((x) => x.app === "wire")!;
    const r = openApp(w, "wire", A, "n-3");
    expect(r.opened).toBe(false);
    expect(r.windows.filter((x) => x.app === "wire")).toHaveLength(1);
    expect(r.focused).toEqual({ ...first, context: "n-3" });
    expect(r.windows.at(-1)).toBe(r.focused);
  });
  it("no context keeps the window's context; multi-instance Broker is unchanged (a new window per ticker)", () => {
    const w = openApp([], "wire", A, "n-1").windows;
    expect(openApp(w, "wire", A).focused.context).toBe("n-1");
    const b = openApp(openApp([], "broker", A, "HALC").windows, "broker", A, "NRON");
    expect(b.opened).toBe(true);
    expect(b.windows.map((x) => x.context)).toEqual(["HALC", "NRON"]);
  });
  it("multi-instance Broker at its cap (4) opened on a 5th ticker: no new window, no retarget; the main instance comes to the front as it was", () => {
    let w: ReturnType<typeof openApp>["windows"] = [];
    for (const t of ["HALC", "NRON", "VOLT", "GX"]) w = openApp(w, "broker", A, t).windows;
    const before = w.map((x) => ({ ...x }));
    const r = openApp(w, "broker", A, "OKRA");
    expect(r.opened).toBe(false);
    expect(r.windows.filter((x) => x.app === "broker").map((x) => x.context).sort()).toEqual(["GX", "HALC", "NRON", "VOLT"]);
    expect(r.focused).toEqual(before[0]);
    expect(r.windows.at(-1)).toEqual(before[0]);
  });
});

describe("?news= mock hook", () => {
  const frames = (f: MockFeed) => {
    const got: string[] = [];
    f.subscribe("news", (r) => got.push((r as { t: string }).t));
    f.subscribe("ticker:wl_default", (r) => got.push(`ticker:${(r as { t: string }).t}`));
    vi.advanceTimersByTime(SNAP_DELAY_MS);
    return got;
  };
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules(); });
  it("error: news gets err, other channels snap; resync('news') recovers once", () => {
    const f = new MockFeed({ news: "error" }, { autoStart: false });
    const got = frames(f);
    expect(got).toEqual(["err", "ticker:snap"]);
    f.resync("news");
    expect(got).toEqual(["err", "ticker:snap", "snap"]);
  });
  it("loading: news never snaps, resync does not wake it", () => {
    const f = new MockFeed({ news: "loading" }, { autoStart: false });
    const got = frames(f);
    f.resync("news");
    expect(got).toEqual(["ticker:snap"]);
  });
  it("without QUAY_HOOKS the hook is compiled out: news snaps", async () => {
    vi.resetModules();
    vi.stubEnv("QUAY_HOOKS", "0");
    const m = await import("@/shell/contracts/mockFeed");
    const f = new m.MockFeed({ news: "error" }, { autoStart: false });
    expect(frames(f as unknown as MockFeed)).toEqual(["snap", "ticker:snap"]);
  });
});
