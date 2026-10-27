// @vitest-environment happy-dom
// UI card 2 (17B PF-A): the Portfolio frame mounted on the real feed hook (desktop tabs, phone push, states, e2e patch).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioApp, { patchMeFeed } from "@/apps/portfolio/App";
import { speakMoney } from "@/components/shell/MoneyText";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement, root: Root, store: ShellStore;
beforeEach(() => { vi.useFakeTimers(); el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); store = createShellStore(defaultChannels()); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); setFeed(null); vi.useRealTimers(); });

const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
async function mount(vw: number, feed = new MockFeed({}, { tickMs: 1000 })) {
  setFeed(feed);
  store.setState({ vw });
  await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PortfolioApp))); });
  await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  return feed;
}
const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

describe("PF-2-09 desktop frame", () => {
  it("tab row Overview · Positions; Positions shows ComingLater; arrows move selection", async () => {
    await mount(1440);
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => [t.textContent, t.getAttribute("aria-selected")]);
    expect(tabs).toEqual([["Overview", "true"], ["Positions", "false"]]);
    expect(q("pf-overview")?.dataset.state).toBe("live");
    await click(q("pf-tab-positions")!);
    expect(q("coming-later")).not.toBeNull();
    expect(q("pf-overview")).toBeNull();
    await act(async () => { q("pf-tabs")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(q("pf-tab-overview")!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(q("pf-tab-overview"));
  });
  it("segment stacks at text scale ≥ 1.5", async () => {
    await mount(1440);
    expect(q("pf-tabs")!.className).toBe("pf-seg");
    await act(async () => { store.setState({ prefs: { ...store.getState().prefs, textScale: 1.5 } }); });
    expect(q("pf-tabs")!.className).toBe("pf-seg stacked");
  });
});

describe("PF-2-10 phone push", () => {
  it("Overview is the root; Positions pushes with back label 'Back to Portfolio'; back pops; unmount clears", async () => {
    await mount(390);
    expect(q("pf-tabs")).toBeNull();
    expect(q("pf-overview")!.className).toBe("pf-ov pf-phone");
    expect(store.getState().phoneSub).toBeNull();
    await click(q("pf-open-positions")!);
    const sub = store.getState().phoneSub!;
    expect([sub.title, sub.backLabel]).toEqual(["Positions", "Back to Portfolio"]);
    expect(q("coming-later")).not.toBeNull();
    await act(async () => sub.onBack());
    expect(q("pf-overview")).not.toBeNull();
    expect(store.getState().phoneSub).toBeNull();
    await click(q("pf-open-positions")!);
    await act(async () => root.unmount());
    expect(store.getState().phoneSub).toBeNull();
    root = createRoot(el);
  });
});

describe("PF-2-08 states through the feed", () => {
  it("hero shows the mock's nominal nw once live", async () => {
    const feed = await mount(1440);
    const nw = (feed.body("me") as MeTradingBody).nw;
    expect(q("pf-hero-nw")!.querySelector("[role=img]")!.getAttribute("aria-label")).toBe(speakMoney(nw));
    expect(q("money-int")).not.toBeNull();
  });
  it("loading shows the skeleton until the snap", async () => {
    setFeed(new MockFeed({ feed: "loading" }, { tickMs: 1000 }));
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PortfolioApp))); });
    expect(q("pf-loading")).not.toBeNull();
  });
  it("error shows Retry, which asks the feed for a fresh snap", async () => {
    const feed = new MockFeed({ feed: "error" }, { tickMs: 1000 });
    const spy = vi.spyOn(feed, "resync");
    await mount(1440, feed);
    expect(q("pf-error")!.textContent).toBe("Couldn't loadRetry");
    await click(q("pf-retry")!);
    expect(spy).toHaveBeenCalledWith("me");
  });
  it("FR strings when the locale pref is fr", async () => {
    await act(async () => { store.setState({ prefs: { ...store.getState().prefs, locale: "fr" } }); });
    await mount(1440);
    expect(q("pf-tab-overview")!.textContent).toBe("Vue d’ensemble");
    expect(q("pf-hero")!.textContent).toContain("Patrimoine net");
  });
});

describe("e2e injection (QUAY_HOOKS only)", () => {
  it("patchMeFeed merges object fields into me snaps and leaves other channels alone", () => {
    const inner = new MockFeed({}, { tickMs: 1000 });
    const feed = patchMeFeed(inner, { balances: { MDOL: "1250.00" }, restricted: [{ reason: "AD", amount: "5.00", untilRealMs: null }] });
    const got: Record<string, unknown> = {};
    feed.subscribe("me", (f) => { got.me = f; });
    feed.subscribe("ticker:wl_default", (f) => { got.tick = f; });
    vi.advanceTimersByTime(SNAP_DELAY_MS);
    const me = (got.me as { body: MeTradingBody }).body;
    expect(Object.keys(me.balances)).toEqual(["FDL", "MDOL"]);
    expect(me.restricted).toHaveLength(1);
    expect(me.nw).toBe((inner.body("me") as MeTradingBody).nw);
    expect((got.tick as { body: object }).body).toEqual(inner.body("ticker:wl_default"));
  });
});
