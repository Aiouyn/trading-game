// The one place the shell calls the City seam. `@/city` is dynamic-imported so three.js stays in
// the City chunk (S1-20). cityId is the canonical id from Spec 2 (`city_port_avalon`).
import type { CityRenderer, CityRendererOptions } from "@/city";

export const CITY_ID = "city_port_avalon";

export async function createShellCityRenderer(opts: Omit<CityRendererOptions, "cityId">): Promise<CityRenderer> {
  const mod = await import("@/city");
  return mod.createCityRenderer({ cityId: CITY_ID, ...opts });
}
