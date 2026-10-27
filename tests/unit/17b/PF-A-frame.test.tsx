// @vitest-environment happy-dom
// UI card 2 (17B PF-A): the Portfolio frame mounted on the real feed hook (desktop tabs, phone push, states, mock data, one NW).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioApp from "@/apps/portfolio/App";
import { MeNwBridge } from "@/components/shell/MeNwBridge";
import { speakMoney } from "@/components/shell/MoneyText";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { MeTradingBody } from "@/shell/contracts/channels";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { START_NW } from "@/shell/contracts/fixtures/me";
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
  it("Studio Q1: Positions is a nav row (whole row is one button, label + chevron), not a tab", async () => {
    await mount(390);
    const row = q("pf-open-positions")!;
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("role")).toBeNull();
    expect(row.className).toBe("pf-nav-item");
    expect([...row.children].map((c) => c.getAttribute("class"))).toEqual(["pf-nav-label", "pf-nav-chevron"]);
    expect(row.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(row.textContent).toBe("Positions");
    expect(el.querySelector('[role="tablist"]')).toBeNull();
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

describe("Producer 3/4: the me mock carries stats, a second currency and restricted rows", () => {
  it("renders nwStats (−4.2%), MDOL and AD / START rows from the plain mock", async () => {
    await mount(1440);
    expect(q("pf-overview")!.dataset.stats).toBe("1");
    expect(q("pf-drawdown")!.textContent).toBe("\u22124.2%");
    expect(q("pf-amount-MDOL")!.textContent).toBe("1,250.00 MDOL");
    const rows = [...el.querySelectorAll('[data-testid="pf-restricted-row"]')].map((r) => r.textContent);
    expect(rows).toEqual(["$500.00ADreleases in 3 hours", "$2,500.00STARTheld"]);
  });
  it("?empty=1 (new player): FDL only, no stats, no restricted", async () => {
    await mount(1440, new MockFeed({ empty: true }, { tickMs: 1000 }));
    expect(q("pf-overview")!.dataset.stats).toBe("0");
    expect(q("pf-restricted")).toBeNull();
    expect(q("pf-balance-MDOL")).toBeNull();
  });
  it("Studio fix c: rows stack at text scale ≥ 1.5", async () => {
    await mount(1440);
    expect(q("pf-overview")!.classList.contains("pf-stacked")).toBe(false);
    await act(async () => { store.setState({ prefs: { ...store.getState().prefs, textScale: 1.5 } }); });
    expect(q("pf-overview")!.classList.contains("pf-stacked")).toBe(true);
  });
});

describe("Producer 3 / Studio fix b: one NW source", () => {
  it("the shell boots on START_NW, the feed opens on START_NW, and every me frame lands in the shell store", async () => {
    expect(store.getState().channels.me.nw).toBe(START_NW);
    const feed = new MockFeed({}, { tickMs: 1000 });
    expect((feed.body("me") as MeTradingBody).nw).toBe(START_NW);
    setFeed(feed);
    store.setState({ vw: 1440 });
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(MeNwBridge), createElement(PortfolioApp))); });
    await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
    for (let i = 0; i < 5; i++) {
      await act(async () => { vi.advanceTimersByTime(1000); });
      const nw = (feed.body("me") as MeTradingBody).nw;
      expect(store.getState().channels.me.nw).toBe(nw);
      expect(q("pf-hero-nw")!.querySelector("[role=img]")!.getAttribute("aria-label")).toBe(speakMoney(nw));
    }
    expect(store.getState().channels.me.nw).not.toBe(START_NW); // the marks moved: the store follows the feed, not a constant
  });
  it("a ?nw= pin keeps me.nw exactly the pinned string while marks move", () => {
    const feed = new MockFeed({ nw: "200000" }, { tickMs: 1000, autoStart: false });
    for (let i = 0; i < 20; i++) { expect((feed.body("me") as MeTradingBody).nw).toBe("200000.00"); feed.advance(); }
  });
});
