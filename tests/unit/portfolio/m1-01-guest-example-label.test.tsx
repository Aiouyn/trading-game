// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShellCtx } from "@/components/shell/ShellContext";
import { PortfolioFrame } from "@/apps/portfolio/PortfolioFrame";
import { setFeed } from "@/shell/contracts/useChannel";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { createShellStore } from "@/shell/store";
import { mockChannels } from "@/shell/mockChannels";
import * as authSession from "@/shell/authSession";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("M1-01 guest portfolio example label", () => {
  let el: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.spyOn(authSession, "useAuthSession").mockReturnValue({ status: "signed_out" });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("guest Portfolio shows Example portfolio · not your account", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    store.getState().setBooted();
    store.getState().setViewport(1440, 900);
    setFeed(new MockFeed({ nw: "412860.15" }, { tickMs: 1000 }));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PortfolioFrame)));
    });
    await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
    const label = el.querySelector("[data-testid=pf-guest-example]")?.textContent ?? "";
    expect(label).toMatch(/Example portfolio/i);
    expect(label).toMatch(/not your account/i);
    // Card 20: the example book's R2 is not presented as the visitor's rank.
    expect(el.querySelector("[data-testid=pf-rank-chip]")).toBeNull();
    expect(el.querySelector("[data-testid=pf-next]")).toBeNull();
    expect(el.textContent).not.toMatch(/R2\s*·\s*Owner/);
  });
});
