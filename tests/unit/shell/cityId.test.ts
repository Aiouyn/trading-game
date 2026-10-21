import { describe, expect, it, vi } from "vitest";
import type { CityRendererOptions } from "@/city";

const createCityRenderer = vi.fn(async (o: CityRendererOptions) => { void o; return {} as never; });
vi.mock("@/city", () => ({ createCityRenderer }));

import { createShellCityRenderer } from "@/apps/city/createShellCityRenderer";

describe("CityWindow → createCityRenderer", () => {
  it("passes cityId 'city_port_avalon'", async () => {
    await createShellCityRenderer({
      tierOverride: "auto", reducedMotion: false, myCityOverlay: false,
      channel: { subscribe: () => () => {}, stateVersion: () => null },
      fetchChunk: async () => new ArrayBuffer(0), locale: "en", myEntityIds: [],
    });
    expect(createCityRenderer).toHaveBeenCalledTimes(1);
    expect(createCityRenderer.mock.calls[0][0].cityId).toBe("city_port_avalon");
  });
});

describe("cityId lock", () => {
  it("ignores a caller-supplied cityId smuggled in through a cast", async () => {
    createCityRenderer.mockClear();
    const opts = {
      tierOverride: "auto", reducedMotion: false, myCityOverlay: false,
      channel: { subscribe: () => () => {}, stateVersion: () => null },
      fetchChunk: async () => new ArrayBuffer(0), locale: "en", myEntityIds: [],
      cityId: "evil",
    } as unknown as Parameters<typeof createShellCityRenderer>[0];
    await createShellCityRenderer(opts);
    expect(createCityRenderer).toHaveBeenCalledTimes(1);
    expect(createCityRenderer.mock.calls[0][0].cityId).toBe("city_port_avalon");
  });
});
