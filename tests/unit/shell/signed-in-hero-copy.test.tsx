// @vitest-environment happy-dom
// Card 29: signed-in Home hero says Net worth, not “Demo balance” / starter placeholder.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { StatusStrip } from "@/components/shell/StatusStrip";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore } from "@/shell/store";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { setFeed } from "@/shell/contracts/useChannel";
import { SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { S } from "@/shell/strings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("card 29 signed-in hero copy", () => {
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
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function paint() {
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
  }

  function signInFetch(handle = "qa_hero") {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          account: { accountId: "acc_hero", handle, createdAtMs: 1, worldId: "world_port_avalon" },
          session: { sessionId: "ses_hero", expiresAtMs: 9 },
          player: { accountId: "acc_hero", cashCents: 1_000_000, positions: {}, openOrders: {} },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }

  it("signed-in phone Home labels the hero Net worth and has no starter disclaimer", async () => {
    signInFetch();
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_hero");
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await paint();

    expect(el.querySelector("[data-testid=account-chip-home]")?.textContent).toBe("qa_hero");
    const label = el.querySelector("[data-testid=widget] .label")?.textContent;
    expect(label).toBe(S.netWorth);
    expect(label).not.toBe(S.demoBalance);
    expect(el.querySelector("[data-testid=phone-demo-disclaimer]")).toBeNull();
    expect(el.textContent).not.toMatch(/not a live balance/i);
    expect(el.textContent).not.toMatch(/Demo balance/i);
    // The $10,000 starter figure may still appear as the NW amount; it is not captioned as a demo.
    expect(el.querySelector("[data-testid=hero-nw]")?.textContent).toMatch(/10,?000|10k/);
  });

  it("signed-in desktop strip has no Demo balance tag and shows today's %", async () => {
    signInFetch("qa_strip");
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_hero");
    const ch = store.getState().channels;
    store.getState().setChannels({
      ...ch,
      me: { ...ch.me, todayPct: "0.12" },
    });
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(StatusStrip)));
    });
    await paint();

    expect(el.querySelector("[data-testid=account-chip]")?.textContent).toBe("qa_strip");
    expect(el.querySelector("[data-testid=strip-demo-tag]")).toBeNull();
    expect(el.textContent).not.toMatch(/Demo balance/i);
    expect(el.querySelector("[data-testid=strip-nw]")?.textContent).toMatch(/0\.12|0,12/);
  });

  it("while /api/auth/me is held, first paint has no Demo balance and no starter disclaimer", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement("div", null,
        createElement(StatusStrip),
        createElement(PhoneHome),
      )));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-chip-home]")).toBeNull();
    expect(el.querySelector("[data-testid=account-chip]")).toBeNull();
    expect(el.querySelector("[data-testid=strip-demo-tag]")).toBeNull();
    expect(el.querySelector("[data-testid=phone-demo-disclaimer]")).toBeNull();
    expect(el.textContent).not.toMatch(/Demo balance/i);
    expect(el.textContent).not.toMatch(/not a live balance/i);
  });
});
