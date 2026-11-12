// @vitest-environment happy-dom
// Card 31: unbuilt apps are not offered in the phone grid, desktop shelf, or launcher.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneHome } from "@/components/shell/PhoneHome";
import { Shelf } from "@/components/shell/Shelf";
import { ShellCtx } from "@/components/shell/ShellContext";
import { search } from "@/shell/launcher";
import { mockChannels } from "@/shell/mockChannels";
import { authSession } from "@/shell/authSession";
import { createShellStore } from "@/shell/store";
import { evaluate } from "@/shell/unlock";
import { setFeed } from "@/shell/contracts/useChannel";
import { SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const visUnlocked = evaluate(mockChannels(new URLSearchParams({ rank: "R6", nw: "200000", lic: "LIC2" })), new Set()).vis;

describe("card 31 launcher does not offer unbuilt apps", () => {
  it("search('markets') does not return the Markets app; Broker is still offered", () => {
    const hits = search("markets", visUnlocked, []);
    expect(hits.some((i) => i.app === "markets")).toBe(false);
    expect(search("broker", visUnlocked, []).some((i) => i.app === "broker")).toBe(true);
    expect(search("settings", visUnlocked, []).some((i) => i.app === "settings")).toBe(true);
  });

  it("Recents in the empty-query launcher drop unbuilt ids", () => {
    const rec = search("", visUnlocked, ["markets", "broker", "messages"]);
    expect(rec.map((i) => i.app)).toEqual(["broker"]);
  });
});

describe("card 31 phone grid and desktop shelf omit unbuilt tiles", () => {
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

  // #105 merge: Boards (M2-03), City (M1-10 district view) and Launchpad have bodies on this branch, so they are built and
  // offered; card 31's rule (only built apps are offered) is asserted with apps that are still unbuilt here.
  it("phone Home grid has Settings and the built apps, not Markets or other unbuilt apps", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const store = createShellStore(mockChannels(new URLSearchParams({ rank: "R6", nw: "200000" })));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
    const grid = el.querySelector("[data-testid=app-grid]")!;
    expect(grid.querySelector("[data-testid=icon-settings]")).not.toBeNull();
    expect(grid.querySelector("[data-testid=icon-markets]")).toBeNull();
    for (const built of ["boards", "city", "launchpad"]) expect(grid.querySelector(`[data-testid=icon-${built}]`)).not.toBeNull();
    for (const unbuilt of ["research", "risk", "businesses", "bank", "contracts", "profile", "help"]) {
      expect(grid.querySelector(`[data-testid=icon-${unbuilt}]`), unbuilt).toBeNull();
    }
    expect(grid.querySelector("[data-testid=group-shadow]")).toBeNull();
    const offered = Array.from(grid.querySelectorAll("[data-testid^=icon-]")).map((e) => e.getAttribute("data-testid"));
    expect(offered.sort()).toEqual(["icon-boards", "icon-city", "icon-launchpad", "icon-settings"]);
  });

  it("desktop shelf has Broker, not Markets", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const store = createShellStore(mockChannels(new URLSearchParams({ rank: "R6", nw: "200000" })));
    store.setState({ vw: 1440, vh: 900 });
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(Shelf)));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 20); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=tile-broker]")).not.toBeNull();
    expect(el.querySelector("[data-testid=tile-portfolio]")).not.toBeNull();
    expect(el.querySelector("[data-testid=tile-wire]")).not.toBeNull();
    expect(el.querySelector("[data-testid=tile-settings]")).not.toBeNull();
    expect(el.querySelector("[data-testid=tile-markets]")).toBeNull();
    expect(el.querySelector("[data-testid=tile-messages]")).toBeNull();
  });

  it("while /api/auth/me is held, unbuilt tiles do not flash on the grid", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => { /* held */ }));
    const store = createShellStore(mockChannels(new URLSearchParams()));
    await act(async () => {
      root.render(createElement(ShellCtx.Provider, { value: store }, createElement(PhoneHome)));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(el.querySelector("[data-testid=account-chip-home]")).toBeNull();
    expect(el.querySelector("[data-testid=app-grid] [data-testid=icon-markets]")).toBeNull();
    expect(el.querySelector("[data-testid=app-grid] [data-testid=icon-settings]")).not.toBeNull();
  });
});
