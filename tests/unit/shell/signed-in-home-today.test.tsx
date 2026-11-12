// @vitest-environment happy-dom
// Card 25 fail-first: a signed-in phone Home shows today's change and the $20,000 rank bar.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore } from "@/shell/store";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { getFeed, setFeed } from "@/shell/contracts/useChannel";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { S } from "@/shell/strings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("card 25 signed-in phone Home today and $20k progress", () => {
  let el: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    authSession._resetForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    setLiveMarketForTests(undefined);
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function paint() {
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
  }

  it("signed-in: today slot is the live change, and the rank bar names Hustler at $20,000", async () => {
    // This branch's signed-in `me` is the saved server ledger at server marks (M1-06): Home shows today and the rank bar
    // once NW is known, so the session, market and ledger reads are each answered by URL.
    const market = new LiveMarket();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/api/auth/me")) {
        return Response.json({
          account: { accountId: "acc_today", handle: "qa_today", createdAtMs: 1, worldId: "world_port_avalon" },
          session: { sessionId: "ses_today", expiresAtMs: 9 },
          player: { accountId: "acc_today", cashCents: 1_000_000, positions: {}, openOrders: {} },
        });
      }
      if (url.endsWith("/api/market")) return Response.json(market.snapshot());
      if (url.endsWith("/api/broker/me")) {
        return Response.json({ tick: market.snapshot().tick, cashCents: 1_000_000, reservedCashCents: 0, positions: {}, orders: {}, fills: [], intents: [], coins: [] });
      }
      return new Response("not stubbed", { status: 404 });
    });
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_today");
    const ch = store.getState().channels;
    store.getState().setChannels({
      ...ch,
      me: { ...ch.me, todayChg: "12.50", todayPct: "0.12" },
    });
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await (getFeed() as MockFeed).serverSync(); // the signed-in server half is a lazy chunk (serverSync.ts)
    await paint();
    await paint();

    expect(el.querySelector("[data-testid=account-chip-home]")?.textContent).toBe("qa_today");
    const today = el.querySelector("[data-testid=today]");
    expect(today?.textContent).toMatch(/12\.50/);
    expect(today?.textContent).toMatch(/0\.12/);
    expect(today?.textContent).not.toBe(S.demoTradingNote);
    const next = el.querySelector("[data-testid=rank-next]");
    expect(next?.textContent).toMatch(/Hustler/);
    expect(next?.textContent).toMatch(/20k|20,000|20000/);
    expect(el.querySelector("[data-testid=rank-bar]")).not.toBeNull();
  });

  it("while /api/auth/me is held, first paint has no signed-in handle and no Hustler bar", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-chip-home]")).toBeNull();
    expect(el.querySelector("[data-testid=rank-next]")?.textContent ?? "").not.toMatch(/Hustler/);
  });
});
