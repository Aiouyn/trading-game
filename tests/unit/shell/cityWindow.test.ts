// @vitest-environment happy-dom
// CityWindow-level seam test: renders the real component with `@/city` mocked, so any path that calls
// createCityRenderer with a different cityId (including a direct `@/city` import) fails here.
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityRendererOptions } from "@/city";

const renderer = {
  mount: vi.fn(async () => {}), unmount: vi.fn(), dispose: vi.fn(), setVisibility: vi.fn(),
  setReducedMotion: vi.fn(), setTier: vi.fn(), setMyPlaces: vi.fn(),
};
const createCityRenderer = vi.fn(async (o: CityRendererOptions) => { void o; return renderer as never; });
vi.mock("@/city", () => ({ createCityRenderer }));

const state = {
  prefs: { reducedMotion: "off" },
  local: { renderTierOverride: "auto", myCityOverlay: false },
  channels: { me: { myPlaces: [] as string[] } },
};
vi.mock("@/components/shell/ShellContext", () => ({
  useShell: <T,>(sel: (s: typeof state) => T): T => sel(state),
}));

import { CityWindow } from "@/apps/city/CityWindow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CityWindow → @/city", () => {
  let root: ReturnType<typeof createRoot> | undefined;
  afterEach(() => { act(() => root?.unmount()); });

  it("creates the renderer with cityId 'city_port_avalon' and mounts it", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(CityWindow, { state: { focused: true, collapsed: false, background: false } }));
    });
    await vi.waitFor(() => expect(renderer.mount).toHaveBeenCalledTimes(1));
    expect(createCityRenderer).toHaveBeenCalledTimes(1);
    expect(createCityRenderer.mock.calls[0][0].cityId).toBe("city_port_avalon");
  });
});
