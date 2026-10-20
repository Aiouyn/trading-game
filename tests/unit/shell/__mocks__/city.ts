// Type-only stand-in for src/city/index.ts (owned by Spec 2) until City Dev's PR lands (Spec 1 §10).
// The real module replaces this automatically: see next.config.ts and tsconfig.json paths.
export interface CityPrefs { reducedMotion: "system" | "on" | "off"; tier: "auto" | "T0" | "T1" | "T2" }
export interface CityRenderer { mount(el: HTMLElement): void; unmount(): void; dispose(): void }

export async function createCityRenderer(_opts: { cityId: string; prefs: CityPrefs }): Promise<CityRenderer> {
  void _opts;
  return { mount() {}, unmount() {}, dispose() {} };
}
