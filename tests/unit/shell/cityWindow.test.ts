// @vitest-environment happy-dom
// CityWindow-level seam tests: render the real component with `@/city` mocked and drive it through its
// inputs (BodyState props from WindowFrame/Desktop, and the shell store). Covers cityId, visibility on
// collapse / workspace switch / hidden, reduced motion, unmount + dispose on close, and ui.perf via
// onPerfSample -> recordPerf (including fps: null).
import { act, createElement, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CityRendererOptions } from "@/city";
import type { BodyState } from "@/components/shell/AppBody";

const renderer = {
  mount: vi.fn(async (el: HTMLElement) => { void el; }), unmount: vi.fn(), dispose: vi.fn(), setVisibility: vi.fn(),
  setReducedMotion: vi.fn(), setTier: vi.fn(), setMyPlaces: vi.fn(), setOverlay: vi.fn(),
};
const createCityRenderer = vi.fn(async (o: CityRendererOptions) => { void o; return renderer as never; });
vi.mock("@/city", () => ({ createCityRenderer }));
const retryLoad = vi.fn();
vi.mock("@/shell/loader", () => ({ retryLoad, initLoader: vi.fn() }));

// Minimal reactive stand-in for the shell store: components re-render when `setStore` changes it.
type Store = { prefs: { reducedMotion: "on" | "off" | "system" }; local: { renderTierOverride: string; myCityOverlay: boolean }; channels: { me: { myPlaces: string[] } } };
const initial = (): Store => ({ prefs: { reducedMotion: "off" }, local: { renderTierOverride: "auto", myCityOverlay: false }, channels: { me: { myPlaces: [] } } });
let store = initial();
const listeners = new Set<() => void>();
const setStore = (next: Store) => { store = next; listeners.forEach((l) => l()); };
vi.mock("@/components/shell/ShellContext", () => ({
  useShell: <T,>(sel: (s: Store) => T): T =>
    useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(store)),
}));

import { CityWindow } from "@/apps/city/CityWindow";
import { perfLog } from "@/shell/telemetry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VISIBLE: BodyState = { focused: true, collapsed: false, background: false };
let root: Root | undefined;

async function render(state: BodyState) {
  await act(async () => { root!.render(createElement(CityWindow, { state })); });
}

/** Mounts CityWindow and waits until the renderer is mounted and shown. */
async function open(state: BodyState = VISIBLE) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await render(state);
  await vi.waitFor(() => expect(renderer.setVisibility).toHaveBeenCalled());
  return host;
}

const lastOpts = () => createCityRenderer.mock.calls.at(-1)![0];

beforeEach(() => {
  vi.clearAllMocks();
  store = initial();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { act(() => root?.unmount()); root = undefined; document.body.innerHTML = ""; });

describe("CityWindow → @/city", () => {
  it("creates the renderer with cityId 'cty_port_avalon', mounts it into the window and shows it", async () => {
    const host = await open();
    expect(createCityRenderer).toHaveBeenCalledTimes(1);
    expect(lastOpts().cityId).toBe("cty_port_avalon");
    expect(renderer.mount).toHaveBeenCalledWith(host.querySelector("[data-testid=city-mount]"));
    expect(renderer.setVisibility).toHaveBeenLastCalledWith("visible");
  });

  it("collapse sets background; expand sets visible again", async () => {
    await open();
    await render({ ...VISIBLE, collapsed: true });
    expect(renderer.setVisibility).toHaveBeenLastCalledWith("background");
    await render(VISIBLE);
    expect(renderer.setVisibility).toHaveBeenLastCalledWith("visible");
  });

  it("switching to another workspace (window in background) sets background; hidden sets hidden", async () => {
    await open();
    await render({ ...VISIBLE, focused: false, background: true });
    expect(renderer.setVisibility).toHaveBeenLastCalledWith("background");
    await render({ ...VISIBLE, hidden: true });
    expect(renderer.setVisibility).toHaveBeenLastCalledWith("hidden");
  });

  it("starts with the current reduced-motion pref and follows changes to it", async () => {
    setStore({ ...store, prefs: { reducedMotion: "on" } });
    await open();
    expect(lastOpts().reducedMotion).toBe(true);
    await act(async () => setStore({ ...store, prefs: { reducedMotion: "off" } }));
    expect(renderer.setReducedMotion).toHaveBeenLastCalledWith(false);
    await act(async () => setStore({ ...store, prefs: { reducedMotion: "on" } }));
    expect(renderer.setReducedMotion).toHaveBeenLastCalledWith(true);
  });

  it("closing the window unmounts then disposes the renderer", async () => {
    await open();
    act(() => root!.unmount());
    root = undefined;
    expect(renderer.unmount).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.unmount.mock.invocationCallOrder[0]).toBeLessThan(renderer.dispose.mock.invocationCallOrder[0]);
  });

  it("closing before the renderer resolves still disposes it and never mounts", async () => {
    let resolve!: (r: never) => void;
    createCityRenderer.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await render(VISIBLE);
    act(() => root!.unmount());
    root = undefined;
    await act(async () => resolve(renderer as never));
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.mount).not.toHaveBeenCalled();
  });

  it("ui.perf samples from onPerfSample land in shell telemetry, fps null kept as null", async () => {
    await open();
    const sink = lastOpts().onPerfSample!;
    const before = perfLog().length;
    sink({ tickRenderMsP50: 1, tickRenderMsP95: 2, fps: null, heapMb: 3, renderTier: "T1" });
    sink({ tickRenderMsP50: 1, tickRenderMsP95: 2, fps: 58, heapMb: 3, renderTier: "T2" });
    expect(perfLog().slice(before)).toEqual([
      { event: "ui.perf", tickRenderMsP50: 1, tickRenderMsP95: 2, fps: null, heapMb: 3, renderTier: "T1" },
      { event: "ui.perf", tickRenderMsP50: 1, tickRenderMsP95: 2, fps: 58, heapMb: 3, renderTier: "T2" },
    ]);
  });

  it("toggling the my-city overlay after mount calls setOverlay", async () => {
    await open();
    await act(async () => setStore({ ...store, local: { ...store.local, myCityOverlay: true } }));
    expect(renderer.setOverlay).toHaveBeenLastCalledWith("my_places");
    await act(async () => setStore({ ...store, local: { ...store.local, myCityOverlay: false } }));
    expect(renderer.setOverlay).toHaveBeenLastCalledWith("none");
  });

  it("tier, reduced motion, overlay and my places changed while loading are applied when ready (latest wins)", async () => {
    let resolve!: (r: never) => void;
    createCityRenderer.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await render(VISIBLE);
    expect(lastOpts()).toMatchObject({ tierOverride: "auto", reducedMotion: false, myCityOverlay: false, myEntityIds: [] });
    // Two changes each while loading: only the latest may reach the renderer.
    await act(async () => setStore({ prefs: { reducedMotion: "on" }, local: { renderTierOverride: "T1", myCityOverlay: true }, channels: { me: { myPlaces: ["a"] } } }));
    await act(async () => setStore({ prefs: { reducedMotion: "off" }, local: { renderTierOverride: "T0", myCityOverlay: false }, channels: { me: { myPlaces: ["a", "b"] } } }));
    await act(async () => setStore({ ...store, prefs: { reducedMotion: "on" }, local: { renderTierOverride: "T2", myCityOverlay: true } }));
    await act(async () => resolve(renderer as never));
    await vi.waitFor(() => expect(renderer.setVisibility).toHaveBeenCalled());
    // Exactly once each, with the latest value.
    for (const [fn, v] of [[renderer.setTier, "T2"], [renderer.setReducedMotion, true], [renderer.setOverlay, "my_places"], [renderer.setMyPlaces, ["a", "b"]]] as const) {
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(v);
    }
  });

  it("nothing changed while loading → no extra setter calls on ready (setTier would re-run tier detection)", async () => {
    await open();
    expect(renderer.setTier).not.toHaveBeenCalled();
    expect(renderer.setReducedMotion).not.toHaveBeenCalled();
    expect(renderer.setOverlay).not.toHaveBeenCalled();
    expect(renderer.setMyPlaces).not.toHaveBeenCalled();
  });

  // ---- hardening ----
  it("createCityRenderer rejecting shows the error state, not 'Loading city…' forever", async () => {
    createCityRenderer.mockImplementationOnce(async () => { throw new Error("chunk 500"); });
    const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await render(VISIBLE);
    await vi.waitFor(() => expect(host.querySelector("[data-testid=city-error]")).not.toBeNull());
    const err = host.querySelector("[data-testid=city-error]")!;
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toBe("Couldn't load the city");
    expect(host.textContent).not.toContain("Loading city");
    expect(renderer.mount).not.toHaveBeenCalled();
  });

  it("mount() rejecting shows the error state and disposes the renderer (never unmounts a failed mount)", async () => {
    renderer.mount.mockImplementationOnce(async () => { throw new Error("webgl lost"); });
    const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await render(VISIBLE);
    await vi.waitFor(() => expect(host.querySelector("[role=alert]")?.textContent).toBe("Couldn't load the city"));
    expect(host.textContent).not.toContain("Loading city");
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.unmount).not.toHaveBeenCalled();
    expect(renderer.setVisibility).not.toHaveBeenCalled();
    act(() => root!.unmount()); root = undefined;
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("non-default initial options reach createCityRenderer; nothing re-applied on ready", async () => {
    store = { prefs: { reducedMotion: "on" }, local: { renderTierOverride: "T1", myCityOverlay: true }, channels: { me: { myPlaces: ["p1", "p2"] } } };
    await open();
    expect(lastOpts()).toMatchObject({ cityId: "cty_port_avalon", tierOverride: "T1", reducedMotion: true, myCityOverlay: true, myEntityIds: ["p1", "p2"] });
    for (const fn of [renderer.setTier, renderer.setReducedMotion, renderer.setOverlay, renderer.setMyPlaces]) expect(fn).not.toHaveBeenCalled();
  });

  it("after mount, a tier override change calls setTier once with the new tier", async () => {
    await open();
    await act(async () => setStore({ ...store, local: { ...store.local, renderTierOverride: "T0" } }));
    expect(renderer.setTier).toHaveBeenCalledTimes(1);
    expect(renderer.setTier).toHaveBeenCalledWith("T0");
  });

  it("after mount, myPlaces is compared by content: a new array with the same ids is ignored, new ids are applied", async () => {
    store = { ...initial(), channels: { me: { myPlaces: ["a"] } } };
    await open();
    await act(async () => setStore({ ...store, channels: { me: { myPlaces: ["a"] } } }));
    expect(renderer.setMyPlaces).not.toHaveBeenCalled();
    await act(async () => setStore({ ...store, channels: { me: { myPlaces: ["a", "b"] } } }));
    expect(renderer.setMyPlaces).toHaveBeenCalledTimes(1);
    expect(renderer.setMyPlaces).toHaveBeenCalledWith(["a", "b"]);
    await act(async () => setStore({ ...store, channels: { me: { myPlaces: ["a", "b"] } } }));
    expect(renderer.setMyPlaces).toHaveBeenCalledTimes(1);
  });

  it("while loading, a same-content myPlaces array is not re-applied on ready", async () => {
    let resolve!: (r: never) => void;
    createCityRenderer.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await render(VISIBLE);
    await act(async () => setStore({ ...store, channels: { me: { myPlaces: [] } } }));
    await act(async () => resolve(renderer as never));
    await vi.waitFor(() => expect(renderer.setVisibility).toHaveBeenCalled());
    expect(renderer.setMyPlaces).not.toHaveBeenCalled();
  });

  it("closing during mount() unmounts and disposes once mount settles, and never shows it", async () => {
    let settle!: () => void;
    renderer.mount.mockImplementationOnce(() => new Promise<void>((r) => { settle = r; }));
    const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await render(VISIBLE);
    await vi.waitFor(() => expect(renderer.mount).toHaveBeenCalledTimes(1));
    act(() => root!.unmount()); root = undefined;
    expect(renderer.dispose).not.toHaveBeenCalled();
    await act(async () => settle());
    expect(renderer.unmount).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.setVisibility).not.toHaveBeenCalled();
  });

  it("the window's own Retry disposes the failed renderer and re-creates only the CityRenderer (never the shell)", async () => {
    renderer.mount.mockImplementationOnce(async () => { throw new Error("webgl lost"); });
    const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await render(VISIBLE);
    await vi.waitFor(() => expect(host.querySelector("[data-testid=city-retry]")).not.toBeNull());
    const retry = host.querySelector<HTMLButtonElement>("[data-testid=city-retry]")!;
    expect(retry.className).toContain("btn-secondary");
    expect(retry.textContent).toBe("Retry");
    expect(host.textContent).not.toContain("View as table");
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    await act(async () => retry.click());
    await vi.waitFor(() => expect(renderer.setVisibility).toHaveBeenCalled());
    expect(createCityRenderer).toHaveBeenCalledTimes(2);
    expect(renderer.mount).toHaveBeenCalledTimes(2);
    expect(host.querySelector("[data-testid=city-error]")).toBeNull();
    expect(host.querySelector("[data-testid=city-retry]")).toBeNull();
    expect(retryLoad).not.toHaveBeenCalled();
  });
});
