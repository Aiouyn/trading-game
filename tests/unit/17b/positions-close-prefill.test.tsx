// @vitest-environment happy-dom
// Card 27: Positions Close pre-fills the existing Broker ticket (Sell + qty). Nothing is submitted.
// Fix pass: Place still works after Close following a fill (B1); prefill survives another open ticket (B2);
// Close is hidden on stale rows.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrokerApp from "@/apps/broker/App";
import PortfolioApp from "@/apps/portfolio/App";
import { PositionsView, type PositionsViewProps } from "@/apps/portfolio/Positions";
import { PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import { offerTicketPrefill, resetTicketPrefill } from "@/apps/broker/ticketPrefill";
import { ShellCtx } from "@/components/shell/ShellContext";
import type { MeTradingBody, TickerBody } from "@/shell/contracts/channels";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import type { ChannelView } from "@/shell/contracts/useChannel";
import { intentLog } from "@/shell/intentLog";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = new MockFeed({}).body("me") as MeTradingBody;
const ME_EMPTY = new MockFeed({ empty: true }).body("me") as MeTradingBody;
const TICK = (new MockFeed({}).body("ticker:wl_default") as TickerBody).rows;
const live = (body: MeTradingBody): ChannelView<MeTradingBody> => ({ state: "live", body, tick: 1 });
const html = (p: Partial<PositionsViewProps> = {}) =>
  renderToStaticMarkup(createElement(PositionsView, { view: live(ME), tickers: TICK, locale: "en", cards: false, phone: false, onRetry: () => {}, ...p }));

describe("card 27 Close is absent on non-live states", () => {
  it("loading skeleton has no Close", () => {
    const h = html({ view: { state: "loading", body: null, tick: null } });
    expect(h).not.toContain("pos-close");
  });
  it("empty cash book has no Close", () => {
    const h = html({ view: live(ME_EMPTY) });
    expect(h).not.toContain("pos-close");
    expect(h).toContain("pos-empty");
  });
  it("stale rows have no Close", () => {
    const h = html({ view: { state: "stale", body: ME, tick: 1 } });
    expect(h).toContain("data-state=\"stale\"");
    expect(h).not.toContain("pos-close");
  });
});

describe("card 27 live rows offer Close", () => {
  it("desktop table: each live row has Close, including HALC", () => {
    const h = html();
    expect(h).toContain("data-testid=\"pos-close\"");
    const halc = h.split(/data-asset="/).find((s) => s.startsWith("HALC"))!;
    expect(halc).toContain("data-testid=\"pos-close\"");
    expect(ME.positions.HALC.qty).toBe("1200");
  });
  it("phone cards: Close is on the HALC card too", () => {
    const h = html({ cards: true, phone: true });
    const halc = h.split(/data-asset="/).find((s) => s.startsWith("HALC"))!;
    expect(halc).toContain("data-testid=\"pos-close\"");
  });
});

describe("card 27 Close pre-fills Broker and does not submit", () => {
  let el: HTMLDivElement, root: Root, store: ShellStore;
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    store = createShellStore(defaultChannels());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    resetTicketPrefill();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    resetTicketPrefill();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const qa = (id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
  const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const settle = () => act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  const preview = () => act(async () => { vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS); });
  async function typeQty(value: string, scope: ParentNode = el) {
    const input = scope.querySelector('[data-testid="br-qty"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await preview();
  }

  it("clicking Close on HALC opens Broker in edit with Sell and qty 1200, and sends no intent", async () => {
    const feed = new MockFeed({}, { tickMs: 1000 });
    setFeed(feed);
    store.setState({ vw: 1440 });
    const before = intentLog().length;
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement("div", null,
        createElement(PortfolioApp),
        createElement(BrokerApp, { context: "HALC" }),
      )));
    });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();

    const row = qa("pos-row").find((r) => r.getAttribute("data-asset") === "HALC")!;
    const close = row.querySelector('[data-testid="pos-close"]') as HTMLElement | null;
    expect(close).not.toBeNull();
    await click(close!);
    await settle();

    const opened = store.getState().local.windows.filter((w) => w.app === "broker");
    expect(opened.some((w) => w.context === "HALC")).toBe(true);

    const ticket = q("broker")!;
    expect(ticket.getAttribute("data-phase")).toBe("edit");
    expect(q("br-side-sell")!.getAttribute("aria-pressed")).toBe("true");
    expect((q("br-qty") as HTMLInputElement).value).toBe("1200");
    expect((q("br-qty") as HTMLInputElement).value).not.toBe("1,200");
    expect(intentLog().length).toBe(before);
  });

  it("after a fill, Close on the same mounted ticket Places exactly once (double-click+Enter stays 1)", async () => {
    const feed = new MockFeed({}, { tickMs: 1000 });
    setFeed(feed);
    store.setState({ vw: 1440 });
    const submit = vi.spyOn(feed, "submit");
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement("div", null,
        createElement(PortfolioApp),
        createElement(BrokerApp, { context: "HALC" }),
      )));
    });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();

    await typeQty("7");
    await click(q("br-review")!);
    expect(q("broker")!.getAttribute("data-phase")).toBe("review");
    const firstLog = intentLog().length;
    await click(q("br-place")!);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(intentLog().length).toBe(firstLog + 1);
    await act(async () => { feed.advance(); });
    expect(q("br-ack")).not.toBeNull();

    const row = qa("pos-row").find((r) => r.getAttribute("data-asset") === "HALC")!;
    const close = row.querySelector('[data-testid="pos-close"]') as HTMLElement;
    expect(close).not.toBeNull();
    await click(close);
    await settle();

    const ticket = q("broker")!;
    expect(ticket.getAttribute("data-phase")).toBe("edit");
    expect(q("br-side-sell")!.getAttribute("aria-pressed")).toBe("true");
    const closeQty = (q("br-qty") as HTMLInputElement).value;
    expect(closeQty).toBeTruthy();

    await preview();
    await click(q("br-review")!);
    expect(ticket.getAttribute("data-phase")).toBe("review");

    const before = submit.mock.calls.length;
    const logBefore = intentLog().length;
    const placeBtn = q("br-place")!;
    const block = q("br-review-block")!;
    await act(async () => {
      const clickIt = () => placeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const enter = () => block.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      clickIt(); clickIt(); enter();
    });
    expect(submit.mock.calls.length).toBe(before + 1);
    expect(intentLog().length).toBe(logBefore + 1);
    const second = submit.mock.calls[before]![0] as { assetId: string; side: string; qty: string };
    expect(second.assetId).toBe("HALC");
    expect(second.side).toBe("SELL");
    expect(second.qty).toBe(closeQty);
  });

  it("Close on HALC while a Broker is mounted on NRON: the new HALC ticket gets Sell + qty, NRON draft stays", async () => {
    const feed = new MockFeed({}, { tickMs: 1000 });
    setFeed(feed);
    store.setState({ vw: 1440 });
    const Host = ({ ctxs }: { ctxs: string[] }) =>
      createElement(ShellCtx.Provider, { value: store }, createElement("div", null,
        ...ctxs.map((c) => createElement("div", { key: c, "data-host": c }, createElement(BrokerApp, { context: c }))),
      ));
    await act(async () => { root.render(createElement(Host, { ctxs: ["NRON"] })); });
    await settle();

    const nron = el.querySelector('[data-host="NRON"]') as HTMLElement;
    await typeQty("4", nron);
    expect((nron.querySelector('[data-testid="br-qty"]') as HTMLInputElement).value).toBe("4");
    expect(nron.querySelector('[data-testid="br-side-buy"]')!.getAttribute("aria-pressed")).toBe("true");

    await act(async () => { offerTicketPrefill({ assetId: "HALC", side: "SELL", qtyText: "1200" }); });
    await act(async () => { root.render(createElement(Host, { ctxs: ["NRON", "HALC"] })); });
    await settle();

    const halc = el.querySelector('[data-host="HALC"]') as HTMLElement;
    expect(halc.querySelector('[data-testid="br-side-sell"]')!.getAttribute("aria-pressed")).toBe("true");
    expect((halc.querySelector('[data-testid="br-qty"]') as HTMLInputElement).value).toBe("1200");
    expect(halc.querySelector('[data-testid="broker"]')!.getAttribute("data-phase")).toBe("edit");

    expect((nron.querySelector('[data-testid="br-qty"]') as HTMLInputElement).value).toBe("4");
    expect(nron.querySelector('[data-testid="br-side-buy"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(nron.querySelector('[data-testid="br-side-sell"]')!.getAttribute("aria-pressed")).not.toBe("true");
  });
});
