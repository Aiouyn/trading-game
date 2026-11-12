// @vitest-environment happy-dom
// Card 30: phone dock is Broker, Portfolio, Wire — not Messages.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { ShellCtx } from "@/components/shell/ShellContext";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore } from "@/shell/store";
import { setFeed } from "@/shell/contracts/useChannel";
import { SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("card 30 phone dock is the three V1 apps", () => {
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

  const dockIds = () => [...el.querySelectorAll("[data-testid=bottom-row] [data-testid^=icon-]")].map((n) => n.getAttribute("data-testid"));

  it("dock is exactly Broker, Portfolio, Wire — no Messages", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
    expect(dockIds()).toEqual(["icon-broker", "icon-portfolio", "icon-wire"]);
    expect(el.querySelector("[data-testid=bottom-row] [data-testid=icon-messages]")).toBeNull();
  });

  it("while /api/auth/me is held, the dock is already the three built apps — Messages does not flash in", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(dockIds()).toEqual(["icon-broker", "icon-portfolio", "icon-wire"]);
    expect(el.querySelector("[data-testid=bottom-row] [data-testid=icon-messages]")).toBeNull();
    expect(el.querySelector("[data-testid=account-chip-home]")).toBeNull();
  });
});
