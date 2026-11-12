// @vitest-environment happy-dom
// Card 40: Close busy is a per-ticket count. A cap miss on another asset, a second Broker on the same asset,
// StrictMode, an unmount, or an account switch must not drop (or leak) another ticket's mid-Place flag.
// Grounded in Gatekeeper probe 6 (230bb397 / f4c5c1fe), A and B fail first.
import { act, createElement, StrictMode, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrokerApp from "@/apps/broker/App";
import PortfolioApp from "@/apps/portfolio/App";
import { PREVIEW_DEBOUNCE_MS } from "@/apps/broker/BrokerFrame";
import { isTicketSubmitting, offerTicketPrefill, resetTicketPrefill, takeTicketPrefill } from "@/apps/broker/ticketPrefill";
import { AuthAccountBoundary } from "@/components/shell/AuthAccountBoundary";
import { ShellCtx } from "@/components/shell/ShellContext";
import * as accountDemo from "@/shell/accountDemoBoundary";
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

describe("card 40 Close busy is per ticket", () => {
  let el: HTMLDivElement, root: Root, store: ShellStore;
  let errs: string[] = [];
  beforeEach(() => {
    errs = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { errs.push(a.map(String).join(" ")); });
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

  const q = (id: string, s: ParentNode = el) => s.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const host = (name: string) => el.querySelector(`[data-host="${name}"]`) as HTMLElement;
  const settle = () => act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  const preview = () => act(async () => { vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS); });
  const click = (n: Element) => act(async () => { n.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  async function typeQty(value: string, scope: ParentNode = el) {
    const input = scope.querySelector('[data-testid="br-qty"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await preview();
  }
  async function placeIn(scope: HTMLElement, qty = "7") {
    await typeQty(qty, scope);
    await click(q("br-review", scope)!);
    await click(q("br-place", scope)!);
    expect(q("broker", scope)!.getAttribute("data-phase")).toBe("submitting");
  }
  const reply = async () => {
    await act(async () => { vi.advanceTimersByTime(3500); });
    await act(async () => { feed().advance(); });
    await settle();
  };
  let current: MockFeed | null = null;
  const feed = () => current!;
  const installFeed = (f: MockFeed) => { current = f; setFeed(f); return f; };
  const brokerCtx = () => store.getState().local.windows.filter((w) => w.app === "broker").map((w) => w.context);
  const closeBtn = (a: string) => el.querySelector(`[data-asset="${a}"] [data-testid="pos-close"]`) as HTMLButtonElement | null;
  const closeOff = (a: string) => { const b = closeBtn(a)!; return b.disabled || b.getAttribute("aria-disabled") === "true"; };
  const wrap = (children: ReactNode[]) => createElement(ShellCtx.Provider, { value: store }, createElement("div", null, createElement(PortfolioApp), ...children));
  const broker = (name: string, context: string) => createElement("div", { key: name, "data-host": name }, createElement(BrokerApp, { context }));
  const capHost = () => wrap(brokerCtx().filter((c): c is string => !!c).map((c) => broker(c, c)));

  async function fourBrokersHalcMidPlace() {
    const f = installFeed(new MockFeed({ replyMs: 3000 }, { tickMs: 1000 }));
    store.setState({ vw: 1440, vh: 900 });
    for (const c of ["NRON", "VOLT", "ORCA", "HALC"]) store.getState().open("broker", c);
    await act(async () => { root.render(capHost()); });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    await placeIn(host("HALC"));
    expect(closeOff("HALC")).toBe(true);
    const other = [...el.querySelectorAll('[data-testid="pos-row"]')].map((r) => r.getAttribute("data-asset"))
      .find((a) => a && !brokerCtx().includes(a))!;
    expect(other).toBeTruthy();
    return { f, other };
  }

  it("cap notice on another asset while HALC is mid-Place: HALC Close stays disabled", async () => {
    const { f, other } = await fourBrokersHalcMidPlace();
    const submit = vi.spyOn(f, "submit");
    await click(closeBtn(other)!);
    expect(q("pos-close-cap")).not.toBeNull();
    expect(closeOff("HALC")).toBe(true);

    await click(closeBtn("HALC")!);
    expect(q("broker", host("HALC"))!.getAttribute("data-phase")).toBe("submitting");
    expect(q("br-side-sell", host("HALC"))?.getAttribute("aria-pressed")).not.toBe("true");
    await reply();
    expect(submit).toHaveBeenCalledTimes(0); // the one Place went out before the spy; Close sent nothing
    expect(q("br-ack-title", host("HALC"))).not.toBeNull();
    expect(closeOff("HALC")).toBe(false);
  });

  it("a cap reset still clears the held prefill and shows the notice", async () => {
    const { other } = await fourBrokersHalcMidPlace();
    await click(closeBtn(other)!);
    expect(q("pos-close-cap")).not.toBeNull();
    expect(brokerCtx()).not.toContain(other);
    expect(takeTicketPrefill()).toBeNull();
  });

  it("second Broker on the same asset mounts mid-Place: HALC Close stays disabled", async () => {
    const f = installFeed(new MockFeed({ replyMs: 3000 }, { tickMs: 1000 }));
    store.setState({ vw: 1440 });
    const submit = vi.spyOn(f, "submit");
    await act(async () => { root.render(wrap([broker("HALC", "HALC")])); });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    await placeIn(host("HALC"));
    expect(closeOff("HALC")).toBe(true);

    await act(async () => { root.render(wrap([broker("HALC", "HALC"), broker("HALC2", "HALC")])); });
    expect(closeOff("HALC")).toBe(true);
    expect(q("broker", host("HALC"))!.getAttribute("data-phase")).toBe("submitting");

    await reply();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(q("br-ack-title", host("HALC"))).not.toBeNull();
    expect(closeOff("HALC")).toBe(false);
  });

  it("a Broker in StrictMode mid-Place keeps HALC Close disabled, and frees it after the ack", async () => {
    const f = installFeed(new MockFeed({ replyMs: 3000 }, { tickMs: 1000 }));
    store.setState({ vw: 1440 });
    const submit = vi.spyOn(f, "submit");
    await act(async () => { root.render(createElement(StrictMode, null, wrap([broker("HALC", "HALC")]))); });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    await placeIn(host("HALC"));
    expect(closeOff("HALC")).toBe(true);
    // a re-render (ticks + a parent render) must not mint a new instance and drop the old one
    await act(async () => { root.render(createElement(StrictMode, null, wrap([broker("HALC", "HALC")]))); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(closeOff("HALC")).toBe(true);

    await reply();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(q("br-ack-title", host("HALC"))).not.toBeNull();
    expect(closeOff("HALC")).toBe(false);
    expect(isTicketSubmitting("HALC")).toBe(false);
  });

  it("a ticket that unmounts mid-Place drops only its own entry; Close re-enables when the last is gone, with no leak", async () => {
    installFeed(new MockFeed({ replyMs: 3000 }, { tickMs: 1000 }));
    store.setState({ vw: 1440 });
    const render = (names: string[]) => act(async () => { root.render(wrap(names.map((n) => broker(n, "HALC")))); });
    await render(["H1", "H2"]);
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    await placeIn(host("H1"));
    await placeIn(host("H2"), "3");
    expect(closeOff("HALC")).toBe(true);

    await render(["H2"]);
    expect(closeOff("HALC")).toBe(true);
    expect(q("broker", host("H2"))!.getAttribute("data-phase")).toBe("submitting");

    await render([]);
    expect(closeOff("HALC")).toBe(false);
    expect(isTicketSubmitting("HALC")).toBe(false);
    await reply();
    expect(closeOff("HALC")).toBe(false);

    // place, ack, Close, unmount: nothing left behind
    await render(["H3"]);
    await settle();
    await placeIn(host("H3"));
    expect(closeOff("HALC")).toBe(true);
    await reply();
    expect(closeOff("HALC")).toBe(false);
    await click(closeBtn("HALC")!);
    expect(q("br-side-sell", host("H3"))?.getAttribute("aria-pressed")).toBe("true");
    await render([]);
    expect(isTicketSubmitting("HALC")).toBe(false);
    expect(closeOff("HALC")).toBe(false);
  });

  it("account switch mid-Place: account B never sees A's HALC busy flag", async () => {
    let auth: AuthUiState = signedIn("acc_a");
    vi.spyOn(authChrome, "useAuthChrome").mockImplementation(() => auth);
    vi.spyOn(authChrome, "isSignedIn").mockImplementation((a) => a.status === "signed_in");
    // the boundary installs a guest-style mock per account, so both accounts hold HALC
    vi.spyOn(accountDemo, "applySignedInDemo").mockImplementation(() => { installFeed(new MockFeed({ replyMs: 3000 }, { tickMs: 1000 })); });
    store.setState({ vw: 1440 });
    function Harness() {
      const [, bump] = useState(0);
      (Harness as unknown as { bump: () => void }).bump = () => bump((n) => n + 1);
      return (
        <ShellCtx.Provider value={store}>
          <AuthAccountBoundary query="">
            <div><PortfolioApp />{broker("HALC", "HALC")}</div>
          </AuthAccountBoundary>
        </ShellCtx.Provider>
      );
    }
    await act(async () => { root.render(createElement(Harness)); });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    await placeIn(host("HALC"));
    expect(closeOff("HALC")).toBe(true);
    offerTicketPrefill({ assetId: "NRON", side: "SELL", qtyText: "1" });

    auth = signedIn("acc_b");
    await act(async () => { (Harness as unknown as { bump: () => void }).bump(); });
    expect(el.querySelector('[data-testid="auth-account-boundary"]')!.getAttribute("data-account")).toBe("acc_b");
    expect(isTicketSubmitting("HALC")).toBe(false);
    expect(takeTicketPrefill()).toBeNull();
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    expect(closeBtn("HALC")).not.toBeNull();
    expect(closeOff("HALC")).toBe(false);
    await reply(); // A's late reply lands on a feed B no longer reads
    expect(closeOff("HALC")).toBe(false);
  });

  // Regression guards (probe 6 C and D: green on card 34 and must stay green)
  it("Broker unmounted mid-Place: Close is not stuck afterwards", async () => {
    installFeed(new MockFeed({ replyMs: 3000 }, { tickMs: 1000 }));
    store.setState({ vw: 1440 });
    await act(async () => { root.render(wrap([broker("HALC", "HALC")])); });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    await placeIn(host("HALC"));
    expect(closeOff("HALC")).toBe(true);
    await act(async () => { root.render(wrap([])); });
    expect(closeOff("HALC")).toBe(false);
    await reply();
    expect(closeOff("HALC")).toBe(false);
  });

  it("no getSnapshot or update-depth warnings across a buy and a Close", async () => {
    const f = installFeed(new MockFeed({ replyMs: 0 }, { tickMs: 1000 }));
    store.setState({ vw: 1440 });
    await act(async () => { root.render(wrap([broker("HALC", "HALC")])); });
    await settle();
    await click(q("pf-tab-positions")!);
    await settle();
    await typeQty("7");
    await click(q("br-review")!);
    await click(q("br-place")!);
    await act(async () => { vi.advanceTimersByTime(500); });
    await act(async () => { f.advance(); });
    await settle();
    await click(closeBtn("HALC")!);
    await settle();
    expect(q("br-side-sell")?.getAttribute("aria-pressed")).toBe("true");
    expect(errs.filter((e) => /getSnapshot|Maximum update depth|infinite loop/i.test(e))).toEqual([]);
  });
});
