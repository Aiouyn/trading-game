// Ambient fallback for `@/city` (Spec 1 §10). TypeScript only uses it while src/city/index.ts does
// not exist; once Spec 2 lands, the real module's types take over automatically.
declare module "@/city" {
  export interface CityPrefs { reducedMotion: "system" | "on" | "off"; tier: "auto" | "T0" | "T1" | "T2" }
  export interface CityRenderer { mount(el: HTMLElement): void; unmount(): void; dispose(): void }
  export function createCityRenderer(opts: { cityId: string; prefs: CityPrefs }): Promise<CityRenderer>;
}
