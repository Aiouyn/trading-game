// The one place the shell calls the City seam. `@/city` is dynamic-imported so three.js stays in
// the City chunk (S1-20). cityId is the canonical id from Spec 2 (`cty_port_avalon`, errata E-26).
// cityId is spread last so no caller (even through a cast) can override it.
import type { CityRenderer, CityRendererOptions } from "@/city";

export const CITY_ID = "cty_port_avalon" as const;

export async function createShellCityRenderer(opts: Omit<CityRendererOptions, "cityId">): Promise<CityRenderer> {
  const mod = await import("@/city");
  return mod.createCityRenderer({ ...opts, cityId: CITY_ID });
}
