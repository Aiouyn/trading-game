// @vitest-environment happy-dom
// QA #67 follow-ups d + e: NW unlock rules and the Appearance preview read the live NW (useNw, the me feed), never the
// shell store's boot NW (channels.me.nw) or a hardcoded figure.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearancePreview } from "@/apps/settings/AppearancePreview";
import { speakMoney } from "@/components/shell/MoneyText";
import { ShellCtx } from "@/components/shell/ShellContext";
import { LiveNwUnlock } from "@/components/shell/useNw";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { setFeed } from "@/shell/contracts/useChannel";
import { clockAt, defaultChannels } from "@/shell/mockChannels";
import { createShellStore, type ShellStore } from "@/shell/store";
import type { Channels } from "@/shell/channels";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const boot = (nw: string): Channels => { const c = defaultChannels(); return { ...c, me: { ...c.me, nw } }; };

describe("store: unlock rules use liveNw (unlock.ts case nw via withLiveNw)", () => {
  it("AI Lab ($100k) unlocks on the live NW while channels.me.nw keeps the boot value", () => {
    const store = createShellStore(boot("50000"));
    expect(store.getState().vis.ailab).not.toBe("unlocked");
    store.getState().setLiveNw("99999.99");
    expect(store.getState().vis.ailab).not.toBe("unlocked");
    // A clock tick re-evaluates with the live NW, not the boot NW.
    const c = store.getState().channels;
    store.getState().setChannels({ ...c, clock: clockAt(c.clock.tick + 1) });
    expect(store.getState().liveNw).toBe("99999.99");
    store.getState().setLiveNw("100000");
    expect(store.getState().vis.ailab).toBe("unlocked");
    expect(store.getState().fresh.has("ailab")).toBe(true);
    expect(store.getState().channels.me.nw).toBe("50000");
  });

  it("a boot NW at the threshold still unlocks before the first frame (liveNw null)", () => {
    const store = createShellStore(boot("100000"));
    expect(store.getState().liveNw).toBeNull();
    expect(store.getState().vis.ailab).toBe("unlocked");
  });
});

describe("mounted on the me feed", () => {
  let el: HTMLDivElement, root: Root, store: ShellStore;
  beforeEach(() => { vi.useFakeTimers(); el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); });
  afterEach(async () => { await act(async () => root.unmount()); el.remove(); setFeed(null); vi.useRealTimers(); });
  async function mount(feedNw: string, ...children: Parameters<typeof createElement>[0][]) {
    store = createShellStore(boot("50000"));
    store.getState().setBooted();
    setFeed(new MockFeed({ nw: feedNw }, { tickMs: 1000 }));
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, ...children.map((c) => createElement(c)))); });
    await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
  }

  it("LiveNwUnlock: the feed's 150,000 unlocks AI Lab although the store booted on 50,000", async () => {
    await mount("150000", LiveNwUnlock);
    expect(store.getState().liveNw).toBe("150000.00");
    expect(store.getState().vis.ailab).toBe("unlocked");
    expect(store.getState().channels.me.nw).toBe("50000");
  });

  it("LiveNwUnlock opens nothing before boot (the shell clock stays the first timer, 17A T3-01), then syncs once booted", async () => {
    store = createShellStore(boot("50000"));
    const feed = new MockFeed({ nw: "150000" }, { tickMs: 1000 });
    const subscribe = vi.spyOn(feed, "subscribe");
    setFeed(feed);
    await act(async () => { root.render(createElement(ShellCtx.Provider, { value: store }, createElement(LiveNwUnlock))); });
    await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
    expect(subscribe).not.toHaveBeenCalled();
    expect(store.getState().liveNw).toBeNull();
    await act(async () => { store.getState().setBooted(); });
    await act(async () => { vi.advanceTimersByTime(SNAP_DELAY_MS); });
    expect(subscribe).toHaveBeenCalledWith("me", expect.any(Function));
    expect(store.getState().vis.ailab).toBe("unlocked");
  });

  it("AppearancePreview: the preview hero prints the feed's NW", async () => {
    await mount("150000", AppearancePreview);
    const hero = el.querySelector("[data-testid=scale-preview] .preview-hero [role=img]")!;
    expect(hero.getAttribute("aria-label")).toBe(speakMoney("150000.00"));
    expect(el.textContent).not.toContain("412,860");
  });
});
