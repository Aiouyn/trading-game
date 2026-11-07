// @vitest-environment happy-dom
/**
 * M1-01 regression: setFeed while useChannel is mounted must not crash retain().
 * Browser (GK m1-01-r3): shared.clear() between render acquire and subscribe retain
 * yields TypeError reading closeTimer on undefined. Guest works; signed-in dies.
 */
import { act, createElement, useLayoutEffect, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShellCtx } from "@/components/shell/ShellContext";
import { LiveNwUnlock } from "@/components/shell/useNw";
import { applySignedInDemo, DEMO_STARTER_NW } from "@/shell/accountDemoBoundary";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed, useChannel, getFeed } from "@/shell/contracts/useChannel";
import { createShellStore } from "@/shell/store";
import { mockChannels } from "@/shell/mockChannels";
import { portAvalonServer } from "../helpers/portAvalonServer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ label = "probe" }: { label?: string }) {
  const v = useChannel("me");
  return createElement(
    "p",
    { "data-testid": label, "data-state": v.state },
    v.state === "live" || v.state === "stale" ? v.body.nw : v.state,
  );
}

describe("useChannel feed swap while mounted", () => {
  let el: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    setFeed(new MockFeed({ nw: "412860.15" }, { tickMs: 1000 }));
    // M1-06: a signed-in feed's `me` waits for the saved server ledger and server marks.
    vi.stubGlobal("fetch", vi.fn(portAvalonServer({ cashCents: 1_000_000 })));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("setFeed between render acquire and subscribe retain does not throw", async () => {
    /** Parent layout effect runs after child render/acquire, before child passive retain. */
    function SwapOnLayout({ children }: { children: React.ReactNode }) {
      useLayoutEffect(() => {
        setFeed(new MockFeed({ empty: true, nw: DEMO_STARTER_NW }, { tickMs: 1000 }));
      }, []);
      return createElement("div", null, children);
    }

    await act(async () => {
      root.render(createElement(SwapOnLayout, null, createElement(Probe)));
    });
    await act(async () => {
      vi.advanceTimersByTime(SNAP_DELAY_MS);
    });
    expect(el.querySelector("[data-testid=probe]")?.getAttribute("data-state")).toBe("live");
    expect(el.querySelector("[data-testid=probe]")?.textContent).toBe(DEMO_STARTER_NW);
  });

  it("applySignedInDemo with LiveNwUnlock + Probe (production dual subscribers) does not crash", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setBooted();

    await act(async () => {
      root.render(
        createElement(
          ShellCtx.Provider,
          { value: store },
          createElement(LiveNwUnlock),
          createElement(Probe, { label: "probe-a" }),
          createElement(Probe, { label: "probe-b" }),
        ),
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(SNAP_DELAY_MS);
    });
    expect(el.querySelector("[data-testid=probe-a]")?.textContent).toMatch(/^412860/);

    await act(async () => {
      applySignedInDemo(store, "acc_crash_repro");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    });

    expect(el.querySelector("[data-testid=probe-a]")?.getAttribute("data-state")).toBe("live");
    expect(el.querySelector("[data-testid=probe-a]")?.textContent).toBe(DEMO_STARTER_NW);
    expect(el.querySelector("[data-testid=probe-b]")?.textContent).toBe(DEMO_STARTER_NW);
    expect(store.getState().channels.me.nw).toBe(DEMO_STARTER_NW);
    expect(store.getState().channels.rank.rank).toBe("R0");
  });

  it("account remount key + feed swap releases old listeners; demo NW survives rerender", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setBooted();

    function Host({ accountId }: { accountId: string | null }) {
      const key = accountId ?? "guest";
      useEffect(() => {
        if (accountId) applySignedInDemo(store, accountId);
        else setFeed(new MockFeed({ nw: "412860.15" }, { tickMs: 1000 }));
      }, [accountId]);
      return createElement("div", { key }, createElement(Probe));
    }

    function App() {
      const [accountId, setAccountId] = useState<string | null>(null);
      useEffect(() => {
        const t = setTimeout(() => setAccountId("acc_trade"), 5);
        return () => clearTimeout(t);
      }, []);
      return createElement(
        ShellCtx.Provider,
        { value: store },
        createElement(LiveNwUnlock),
        createElement(Host, { accountId }),
      );
    }

    await act(async () => {
      root.render(createElement(App));
    });
    // Guest mount setFeed + snap
    await act(async () => {
      vi.advanceTimersByTime(SNAP_DELAY_MS);
    });
    // Account id timeout (5ms) → remount + applySignedInDemo
    await act(async () => {
      vi.advanceTimersByTime(5);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    });
    expect(el.querySelector("[data-testid=probe]")?.getAttribute("data-state")).toBe("live");
    expect(el.querySelector("[data-testid=probe]")?.textContent).toBe(DEMO_STARTER_NW);

    // Rerender must not crash or revive Owner fixture.
    await act(async () => {
      root.render(createElement(App));
    });
    await act(async () => {
      vi.advanceTimersByTime(SNAP_DELAY_MS);
    });
    expect(el.querySelector("[data-testid=probe]")?.textContent).toBe(DEMO_STARTER_NW);
    expect(getFeed()).toBeTruthy();
  });
});
