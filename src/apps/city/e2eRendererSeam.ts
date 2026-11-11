// Pull the 3D renderer into the Next client graph so a production build with
// NEXT_PUBLIC_CITY_E2E=1 still contains window.__city hook strings (prod-hook control).
// next.config.ts aliases @city-e2e-seam to e2eRendererSeam.off.ts when the flag is off,
// so a normal production build ships 0 hook strings and does not load this module.
//
// src/city/index.ts only dynamic-imports renderer/create, and a side-effect-only import
// of createShellCityRenderer is tree-shaken (no top-level work, factory never called).
// Import createRenderer statically and keep a live binding so the hook strings stay in
// .next/static. DistrictView does not mount the renderer.
import { createRenderer } from "../../city/renderer/create";

(globalThis as Record<string, unknown>).__cityE2eCreate = createRenderer;
