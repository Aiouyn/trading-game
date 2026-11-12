// @vitest-environment happy-dom
// Card 27: Positions Close pre-fills the existing Broker ticket (Sell + qty). Nothing is submitted.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrokerApp from "@/apps/broker/App";
import PortfolioApp from "@/apps/portfolio/App";
import { PositionsView, type PositionsViewProps } from "@/apps/portfolio/Positions";
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
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const qa = (id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
  const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const settle = () => act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });

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

    const opened = store.getState().windows.filter((w) => w.app === "broker");
    expect(opened.some((w) => w.context === "HALC")).toBe(true);

    const ticket = q("broker")!;
    expect(ticket.getAttribute("data-phase")).toBe("edit");
    expect(q("br-side-sell")!.getAttribute("aria-pressed")).toBe("true");
    expect((q("br-qty") as HTMLInputElement).value).toBe("1200");
    expect((q("br-qty") as HTMLInputElement).value).not.toBe("1,200");
    expect(intentLog().length).toBe(before);
  });
});
