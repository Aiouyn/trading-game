// @vitest-environment happy-dom
// UI card 8: the Orders tab in the Portfolio frame on the real feed hook. PF-8-01 tabs / phone push, PF-8-02 the Broker
// list is the one mounted, PF-8-08 no primary, PF-8-09 states with one Retry for the tab.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioApp from "@/apps/portfolio/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import { countPrimaries } from "@/components/ui/Button";
import type { MeTradingBody, OrderDraft } from "@/shell/contracts/channels";
import { MockFeed, SNAP_DELAY_MS, type Scenario } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement, root: Root, store: ShellStore;
beforeEach(() => { vi.useFakeTimers(); el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); store = createShellStore(defaultChannels()); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); setFeed(null); vi.useRealTimers(); });

const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const LIMIT: OrderDraft = { assetId: "HALC", side: "BUY", type: "limit", qty: "40", limit: "42.10", tif: "day" };
const MARKET: OrderDraft = { assetId: "VOLT", side: "BUY", type: "market", qty: "10", tif: "day" };
/** A feed with one resting order and one fill, ticked by hand (the hour-long tick never fires in a test). */
function seeded(scenario: Partial<Scenario> = {}): MockFeed {
  const f = new MockFeed(scenario, { tickMs: 3_600_000 });
  f.submit(LIMIT);
  f.submit(MARKET);
  f.advance();
  return f;
}
async function mount(vw: number, feed: MockFeed = seeded()) {
  setFeed(feed);
  store.setState({ vw });
  await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PortfolioApp))); });
  await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  return feed;
}
const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const key = (k: string) => act(async () => { q("pf-tabs")!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
const selected = () => el.querySelector('[role="tab"][aria-selected="true"]')!.textContent;

describe("PF-8-01 desktop tab", () => {
  it("3 tabs; arrows cycle both ways; the Orders panel is labelled by its tab", async () => {
    await mount(1440);
    expect([...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Overview", "Positions", "Orders"]);
    await key("ArrowLeft");
    expect(selected()).toBe("Orders");
    expect(document.activeElement).toBe(q("pf-tab-orders"));
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect([panel.id, panel.getAttribute("aria-labelledby")]).toEqual(["pf-panel-orders", "pf-tab-orders"]);
    expect(q("pf-tab-orders")!.getAttribute("aria-controls")).toBe("pf-panel-orders");
    await key("ArrowRight");
    expect(selected()).toBe("Overview");
    await key("ArrowRight");
    await key("ArrowRight");
    expect(selected()).toBe("Orders");
  });
});

describe("PF-8-01 phone push", () => {
  it("an Orders nav row under Positions pushes 'Orders' with 'Back to Portfolio'", async () => {
    await mount(390);
    const rows = [...el.querySelectorAll(".pf-nav-item")] as HTMLElement[];
    expect(rows.map((r) => [r.dataset.testid, r.textContent])).toEqual([["pf-open-positions", "Positions"], ["pf-open-orders", "Orders"]]);
    expect(rows[1]!.tagName).toBe("BUTTON");
    expect(rows[1]!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    await click(q("pf-open-orders")!);
    const sub = store.getState().phoneSub!;
    expect([sub.title, sub.backLabel]).toEqual(["Orders", "Back to Portfolio"]);
    expect(q("pf-orders")!.className).toBe("pf-orders pf-orders-phone");
    expect(q("br-oo")!.closest(".br")!.className).toBe("br pf-oo-host br-phone");
    await act(async () => sub.onBack());
    expect(q("pf-overview")).not.toBeNull();
    expect(store.getState().phoneSub).toBeNull();
  });
  it("FR: 'Ordres' row and title", async () => {
    await act(async () => { store.setState({ prefs: { ...store.getState().prefs, locale: "fr" } }); });
    await mount(390);
    expect(q("pf-open-orders")!.textContent).toBe("Ordres");
    await click(q("pf-open-orders")!);
    expect([store.getState().phoneSub!.title, store.getState().phoneSub!.backLabel]).toEqual(["Ordres", "Retour au portefeuille"]);
  });
});

describe("PF-8-02 the Broker list, mounted once", () => {
  it("Open orders is Broker's OpenOrders (its testids, its row, its cancel) above Recent fills", async () => {
    const f = await mount(1440);
    await click(q("pf-tab-orders")!);
    const id = Object.keys((f.body("me") as MeTradingBody).orders)[0]!;
    expect(qa("br-oo")).toHaveLength(1);
    expect(q(`br-oo-row-${id}`)).not.toBeNull();
    expect(q("br-oo-cancel")!.textContent).toBe("Cancel");
    const order = [...q("pf-orders")!.querySelectorAll("section")].map((s) => s.dataset.testid);
    expect(order).toEqual(["br-oo", "pf-fills"]);
    expect(q("br-oo")!.closest(".br")!.className).toBe("br pf-oo-host");
    expect(qa("pf-fill")).toHaveLength(1);
  });
  it("text scale >= 1.5 stacks the Broker rows (br-stacked) and gives 3-line fill rows", async () => {
    await mount(1440);
    await click(q("pf-tab-orders")!);
    await act(async () => { store.setState({ prefs: { ...store.getState().prefs, textScale: 1.5 } }); });
    expect(q("br-oo")!.closest(".br")!.className).toBe("br pf-oo-host br-stacked");
    expect(q("pf-fills")!.dataset.layout).toBe("rows-3");
  });
  it("PF-8-08 no primary button in the Orders view", async () => {
    await mount(1440);
    await click(q("pf-tab-orders")!);
    expect(countPrimaries(q("pf-orders")!)).toBe(0);
  });
});

describe("PF-8-09 states", () => {
  it("loading: both headings, 3 skeleton rows each, no list and no fills yet", async () => {
    setFeed(new MockFeed({ feed: "loading" }, { tickMs: 1000 }));
    store.setState({ vw: 1440 });
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PortfolioApp))); });
    await click(q("pf-tab-orders")!);
    expect(q("pf-orders")!.dataset.state).toBe("loading");
    expect(q("pf-orders")!.getAttribute("aria-busy")).toBe("true");
    expect([q("pf-oo-skel")!.textContent, q("pf-fills-skel")!.textContent]).toEqual(["Open orders", "Recent fills"]);
    expect([q("pf-oo-skel")!, q("pf-fills-skel")!].map((s) => s.querySelectorAll('[data-testid="pf-orders-skel-row"]').length)).toEqual([3, 3]);
    expect(q("br-oo")).toBeNull();
    expect(q("pf-fills")).toBeNull();
  });
  for (const state of ["denied", "error"] as const) {
    it(`${state}: one "Couldn't load" + one Retry for the tab, which resyncs me`, async () => {
      const feed = new MockFeed({ feed: state }, { tickMs: 1000 });
      const spy = vi.spyOn(feed, "resync");
      await mount(1440, feed);
      await click(q("pf-tab-orders")!);
      expect(q("pf-orders")!.dataset.state).toBe(state);
      expect(q("pf-orders-error")!.textContent).toBe("Couldn't loadRetry");
      expect(q("pf-orders")!.querySelectorAll("button")).toHaveLength(1);
      expect(q("br-oo")).toBeNull();
      expect(q("pf-fills")).toBeNull();
      await click(q("pf-orders-retry")!);
      expect(spy).toHaveBeenCalledWith("me");
    });
  }
  it("stale: rows stay; 'Updating…' once for the tab (the Broker list's)", async () => {
    // A running 1 s feed: the stale script misses ticks and the watchdog marks the channel stale (as BR-6-09).
    const f = new MockFeed({ feed: "stale" }, { tickMs: 1000 });
    f.submit(MARKET);
    await mount(1440, f);
    await click(q("pf-tab-orders")!);
    for (let i = 0; i < 24 && q("pf-orders")!.dataset.state !== "stale"; i++) await act(async () => { vi.advanceTimersByTime(500); });
    expect(q("pf-orders")!.dataset.state).toBe("stale");
    expect(qa("pf-fill")).toHaveLength(1);
    expect(q("pf-orders")!.textContent!.match(/Updating…/g)).toHaveLength(1);
  });
  it("?empty=1: the Broker empty copy and 'No fills yet'", async () => {
    await mount(1440, new MockFeed({ empty: true }, { tickMs: 1000 }));
    await click(q("pf-tab-orders")!);
    expect(q("br-oo-empty")).not.toBeNull();
    expect(q("pf-fills-empty")!.textContent).toBe("No trades yet.");
    expect(q("pf-fills-count")!.textContent).toBe("0");
  });
});
