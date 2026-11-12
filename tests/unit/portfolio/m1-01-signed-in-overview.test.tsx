// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Overview } from "@/apps/portfolio/Overview";
import { AppearancePreview } from "@/apps/settings/AppearancePreview";
import { ShellCtx } from "@/components/shell/ShellContext";
import { applySignedInDemo, DEMO_STARTER_NW, leaksCannedOwnerMock } from "@/shell/accountDemoBoundary";
import { START_NW } from "@/shell/contracts/fixtures/me";
import { setFeed } from "@/shell/contracts/useChannel";
import { SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";
import { portAvalonServer } from "../helpers/portAvalonServer";
import { serverHalfLoaded } from "../helpers/serverHalf";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("M1-01 signed-in Portfolio + Appearance use account demo boundary", () => {
  let el: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    vi.useFakeTimers();
    // M1-06: signed-in `me` is the saved server ledger at server marks.
    vi.stubGlobal("fetch", vi.fn(portAvalonServer({ cashCents: 1_000_000 })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
    setFeed(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("Portfolio overview after applySignedInDemo: $10k, R0, no Owner/412k/Sharpe", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_pf");
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(Overview, { phone: false })));
    });
    await serverHalfLoaded();
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); });
    const text = el.textContent ?? "";
    expect(el.querySelector("[data-testid=pf-hero-nw]")?.textContent).toMatch(/\$10k|10,?000/);
    expect(el.querySelector("[data-testid=pf-rank-chip]")?.textContent).toMatch(/R0\s*·\s*Starter/);
    expect(text).not.toMatch(/\bBroke\b/);
    expect(text).not.toMatch(/R2\s*·\s*Owner/);
    expect(text).not.toMatch(/412/);
    expect(text).not.toMatch(/Sharpe/i);
    expect(text).not.toMatch(/Drawdown/i);
    expect(leaksCannedOwnerMock({
      nw: store.getState().channels.me.nw,
      rank: store.getState().channels.rank.rank,
      hasNwStats: false,
      positionCount: 0,
    })).toBe(false);
    expect(store.getState().channels.me.nw).toBe(DEMO_STARTER_NW);
    expect(START_NW).not.toBe(DEMO_STARTER_NW);
  });

  it("Appearance preview NW follows starter demo, not START_NW", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_ap");
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(AppearancePreview)));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); });
    const text = el.textContent ?? "";
    expect(text).toMatch(/\$10k|10,?000/);
    expect(text).not.toMatch(/412/);
  });
});
