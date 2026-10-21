// The one place the shell calls the City seam. `@/city` is dynamic-imported so three.js stays in
// the City chunk (S1-20). cityId is the canonical id from Spec 2 (`cty_port_avalon`, errata E-26).
// cityId is spread last so no caller (even through a cast) can override it.
import type { CityRenderer, CityRendererOptions } from "@/city";

export const CITY_ID = "cty_port_avalon" as const;

/** e2e-only `?city=fail`: forces a city load failure. Unreachable in a production build unless that build opts in
 *  with NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL=1 (the e2e build does), same gate as `?phase=`. */
export const cityFailEnabled = () =>
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL === "1";
export const cityFailForced = (search: string) => cityFailEnabled() && new URLSearchParams(search).get("city") === "fail";

export async function createShellCityRenderer(opts: Omit<CityRendererOptions, "cityId">): Promise<CityRenderer> {
  if (typeof location !== "undefined" && cityFailForced(location.search)) throw new Error("forced city load failure (e2e)");
  const mod = await import("@/city");
  return mod.createCityRenderer({ ...opts, cityId: CITY_ID });
}
