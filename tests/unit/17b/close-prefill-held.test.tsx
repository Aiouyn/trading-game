// @vitest-environment happy-dom
// Card 34: Close prefill is not held at the Broker window cap, across accounts, or mid-Place.
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrokerApp from "@/apps/broker/App";
import PortfolioApp from "@/apps/portfolio/App";
import { PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import { offerTicketPrefill, resetTicketPrefill, takeTicketPrefill } from "@/apps/broker/ticketPrefill";
import { AuthAccountBoundary } from "@/components/shell/AuthAccountBoundary";
import { ShellCtx } from "@/components/shell/ShellContext";
import * as authChrome from "@/shell/authChrome";
import type { AuthUiState } from "@/shell/authSession";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signedIn = (id: string): AuthUiState => ({
  status: "signed_in",
  account: { accountId: id, handle: id, createdAtMs: 0, worldId: "w" },
  player: { accountId: id, cashCents: 1_000_000, positions: {}, openOrders: {} },
  world: { worldId: "w", marketSeed: 1, persistence: "player_private" },
  sessionExpiresAtMs: Date.now() + 60_000,
});

describe("card 34 Close prefill holding", () => {
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
    vi.restoreAllMocks();
  });

  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const qa = (id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
  const click = (n: HTMLElement) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const settle = () => act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  const preview = () => act(async () => { vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS); });
  async function typeQty(value: string) {
    const input = q("br-qty") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await preview();
  }
  const brokerCtx = () => store.getState().local.windows.filter((w) => w.app === "broker").map((w) => w.context);

  it("Close HALC at the 4-Broker cap does not open a ticket and leaves nothing held", async () => {
    setFeed(new MockFeed({}, { tickMs: 1000 }));
    store.setState({ vw: 1440, vh: 900 });
    for (const c of ["NRON", "VOLT", "AVB", "GX"]) store.getState().open("broker", c);
    expect(brokerCtx()).toHaveLength(4);
    expect(brokerCtx()).not.toContain("HALC");

    const Host = () => createElement(ShellCtx.Provider, { value: store }, createElement("div", null,
      createElement(PortfolioApp),
      ...store.getState().local.windows.filter((w) => w.app === "broker").map((w) =>
        createElement("div", { key: w.context, "data-host": w.context }, createElement(BrokerApp, { context: w.context }))),
    ));
    await act(async () => { root.render(createElement(Host)); });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();

    const row = qa("pos-row").find((r) => r.getAttribute("data-asset") === "HALC")!;
    const close = row.querySelector('[data-testid="pos-close"]') as HTMLElement;
    await click(close);
    await settle();

    expect(brokerCtx()).not.toContain("HALC");
    expect(takeTicketPrefill()).toBeNull();
    expect(q("pos-close-cap")).not.toBeNull();

    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement("div", { "data-host": "late" },
        createElement(BrokerApp, { context: "HALC" }))));
    });
    await settle();
    const late = el.querySelector('[data-host="late"]')!;
    expect(late.querySelector('[data-testid="br-side-sell"]')?.getAttribute("aria-pressed")).not.toBe("true");
    expect((late.querySelector('[data-testid="br-qty"]') as HTMLInputElement).value).toBe("");
  });

  it("a held prefill is cleared when the account changes", async () => {
    let auth: AuthUiState = signedIn("acc_a");
    vi.spyOn(authChrome, "useAuthChrome").mockImplementation(() => auth);
    vi.spyOn(authChrome, "isSignedIn").mockImplementation((a) => a.status === "signed_in");

    function Harness() {
      const [, bump] = useState(0);
      (Harness as unknown as { bump: () => void }).bump = () => bump((n) => n + 1);
      return (
        <ShellCtx.Provider value={store}>
          <AuthAccountBoundary query="">
            <div data-testid="child" />
          </AuthAccountBoundary>
        </ShellCtx.Provider>
      );
    }

    await act(async () => { root.render(createElement(Harness)); });
    offerTicketPrefill({ assetId: "HALC", side: "SELL", qtyText: "7" });
    expect(takeTicketPrefill()).toEqual({ assetId: "HALC", side: "SELL", qtyText: "7" });
    offerTicketPrefill({ assetId: "HALC", side: "SELL", qtyText: "7" });

    auth = signedIn("acc_b");
    await act(async () => { (Harness as unknown as { bump: () => void }).bump(); });
    expect(takeTicketPrefill()).toBeNull();
  });

  it("Close mid-Place is disabled, one submit lands, and the ack is shown", async () => {
    const feed = new MockFeed({ replyMs: 3000 }, { tickMs: 1000 });
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
    await click(q("br-place")!);
    expect(q("broker")!.getAttribute("data-phase")).toBe("submitting");
    expect(submit).toHaveBeenCalledTimes(1);

    const row = qa("pos-row").find((r) => r.getAttribute("data-asset") === "HALC")!;
    const close = row.querySelector('[data-testid="pos-close"]') as HTMLElement;
    expect(close.getAttribute("aria-disabled") === "true" || (close as HTMLButtonElement).disabled).toBe(true);
    await click(close);
    expect(q("broker")!.getAttribute("data-phase")).toBe("submitting");
    expect(q("br-side-sell")?.getAttribute("aria-pressed")).not.toBe("true");

    await act(async () => { vi.advanceTimersByTime(3500); });
    await act(async () => { feed.advance(); });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(q("br-ack-title")).not.toBeNull();
    expect(q("broker")!.getAttribute("data-phase")).toBe("acked");
  });
});
