// The one place the shell calls the City seam. `@/city` is dynamic-imported so three.js stays in
// the City chunk (S1-20). cityId is the canonical id from Spec 2 (`cty_port_avalon`, errata E-26).
// cityId is spread last so no caller (even through a cast) can override it.
import type { CityRenderer, CityRendererOptions } from "@/city";

export const CITY_ID = "cty_port_avalon" as const;

/** e2e-only `?city=fail`: forces a city load failure. Build-time gate: NODE_ENV and NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL
 *  (always defined as "1"/"0" in next.config.ts) are inlined as literals, so in a production build without the e2e
 *  opt-in CITY_FAIL_HOOK folds to `false` and the hook below is eliminated as dead code. The e2e build opts in. */
export const CITY_FAIL_HOOK: boolean =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL === "1";
export const cityFailForced: (search: string) => boolean = CITY_FAIL_HOOK
  ? (search) => new URLSearchParams(search).get("city") === "fail"
  : () => false;

export async function createShellCityRenderer(opts: Omit<CityRendererOptions, "cityId">): Promise<CityRenderer> {
  if (CITY_FAIL_HOOK && typeof location !== "undefined" && cityFailForced(location.search)) throw new Error("forced city load failure (e2e)");
  const mod = await import("@/city");
  return mod.createCityRenderer({ ...opts, cityId: CITY_ID });
}
