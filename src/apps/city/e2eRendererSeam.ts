// Emit the 3D renderer as an async chunk in a NEXT_PUBLIC_CITY_E2E=1 Next build
// so prod-hook still finds window.__city / projectGround in .next/static.
// next.config.ts aliases @city-e2e-seam to e2eRendererSeam.off.ts when the flag
// is off, so a normal production build ships 0 hook strings.
//
// The import must stay dynamic: S1-20 requires that opening City (M1-10's static
// DistrictView) loads no WebGLRenderer / three.js. A static import of
// createRenderer put three.js in the City chunk and failed that check. The
// factory is kept on globalThis so the bundler still emits the chunk; DistrictView
// does not call it or mount the renderer.
export function loadCityE2eRenderer() {
  return import("../../city/renderer/create");
}

(globalThis as Record<string, unknown>).__cityE2eLoad = loadCityE2eRenderer;
