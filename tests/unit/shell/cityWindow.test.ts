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
  setReducedMotion: vi.fn(), setTier: vi.fn(), setMyPlaces: vi.fn(),
};
const createCityRenderer = vi.fn(async (o: CityRendererOptions) => { void o; return renderer as never; });
vi.mock("@/city", () => ({ createCityRenderer }));

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
  it("creates the renderer with cityId 'city_port_avalon', mounts it into the window and shows it", async () => {
    const host = await open();
    expect(createCityRenderer).toHaveBeenCalledTimes(1);
    expect(lastOpts().cityId).toBe("city_port_avalon");
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
});
