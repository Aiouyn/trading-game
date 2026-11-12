// @vitest-environment happy-dom
// Card 33: Portfolio names the $20k goal and a first-trade path.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioApp from "@/apps/portfolio/App";
import { ShellCtx } from "@/components/shell/ShellContext";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore, type ShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signedInBody = {
  account: { accountId: "acc_g", handle: "Nova", createdAtMs: 1, worldId: "world_port_avalon" },
  session: { sessionId: "ses_g", expiresAtMs: 9 },
  player: { accountId: "acc_g", cashCents: 1_000_000, positions: {}, openOrders: {} },
  world: { worldId: "world_port_avalon", marketSeed: 17, persistence: "player_private" },
};

describe("card 33 Portfolio goal and first-trade guide", () => {
  let el: HTMLDivElement;
  let root: Root;
  let store: ShellStore;
  const fetchMock = vi.fn();

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    store = createShellStore(mockChannels(new URLSearchParams()));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mount(vw = 1440) {
    store.setState({ vw });
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PortfolioApp)));
    });
    await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS + 20); await Promise.resolve(); });
  }

  it("signed-in Overview shows the $20k goal and Open Wire / Open Broker", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(signedInBody), { status: 200, headers: { "content-type": "application/json" } }));
    setFeed(new MockFeed({ empty: true }, { tickMs: 1000 }));
    applySignedInDemo(store, "acc_g", 17, { cashCents: 1_000_000 });
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const goal = el.querySelector("[data-testid=pf-goal]");
    expect(goal).not.toBeNull();
    expect(goal?.textContent ?? "").toMatch(/10,?000/);
    expect(goal?.textContent ?? "").toMatch(/20,?000/);
    expect(el.querySelector("[data-testid=pf-open-wire]")).not.toBeNull();
    expect(el.querySelector("[data-testid=pf-open-broker]")).not.toBeNull();
    expect(goal?.textContent ?? "").not.toMatch(/saved to (your|this) account/i);
    expect(el.querySelector("[data-testid=pf-goal-guest]")).toBeNull();
    await act(async () => { el.querySelector<HTMLButtonElement>("[data-testid=pf-open-broker]")!.click(); });
    expect(store.getState().local.windows.some((w) => w.app === "broker")).toBe(true);
  });

  it("a guest sees the sign-in invitation, not the signed-in guide", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    setFeed(new MockFeed({}, { tickMs: 1000 }));
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=pf-goal]")).toBeNull();
    const guest = el.querySelector("[data-testid=pf-goal-guest]")?.textContent ?? "";
    expect(guest).toMatch(/10,?000/);
    expect(guest).toMatch(/20,?000/);
  });

  it("while /api/auth/me is held, the signed-in guide and the guest invitation stay off", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    setFeed(new MockFeed({ empty: true }, { tickMs: 1000 }));
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=pf-goal]")).toBeNull();
    expect(el.querySelector("[data-testid=pf-goal-guest]")).toBeNull();
    expect(el.querySelector("[data-testid=pf-open-broker]")).toBeNull();
  });

  it("pushing Orders from a scrolled Overview zeros the phone app body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    setFeed(new MockFeed({}, { tickMs: 1000 }));
    const scroller = document.createElement("div");
    scroller.className = "phone-appbody";
    Object.assign(scroller.style, { overflow: "auto", height: "80px" });
    el.replaceWith(scroller);
    scroller.append(el);
    try {
      await mount(390);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      scroller.scrollTop = 48;
      expect(scroller.scrollTop).toBe(48);
      await act(async () => { el.querySelector<HTMLButtonElement>("[data-testid=pf-open-orders]")!.click(); });
      expect(el.querySelector("[data-testid=pf-orders]")).not.toBeNull();
      expect(scroller.scrollTop).toBe(0);
    } finally {
      scroller.remove();
    }
  });
});
