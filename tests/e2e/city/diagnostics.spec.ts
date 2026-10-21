import { test } from '@playwright/test';
import { diag, expect, waitFpsFirst2s, waitState, isPhone, openCity, waitDrawn, type HarnessWindow } from './helpers';

test('C-15 every diagnostics field is a finite number after the first frame (auto tier)', async ({ page }) => {
  await openCity(page);
  await waitDrawn(page);
  await waitFpsFirst2s(page);
  const d = await diag(page);
  console.log('C-15', JSON.stringify(d));
  const nums: [string, unknown][] = [
    ['fpsFirst2s', d.fpsFirst2s], ['frameMsP95', d.frameMsP95], ['drawCalls', d.drawCalls], ['triangles', d.triangles],
    ['buildingParts', d.buildingParts], ['canvasPixels', d.canvasPixels], ['geometries', d.geometries], ['textures', d.textures],
    ['gpuMemEstimateMb', d.gpuMemEstimateMb], ['renders', d.renders], ['framesWhileHidden', d.framesWhileHidden],
    ['loadMs.importThree', d.loadMs.importThree], ['loadMs.firstChunk', d.loadMs.firstChunk], ['loadMs.firstFrame', d.loadMs.firstFrame], ['stateVersion', d.stateVersion],
  ];
  for (const [k, v] of nums) expect(Number.isFinite(v), k).toBe(true);
  expect(['T1', 'T2']).toContain(d.tier);
  expect(typeof d.subscribed).toBe('boolean');
});

test('C-15 one ui.perf sample per minute while visible, to onPerfSample; none while background', async ({ page }) => {
  test.skip(isPhone(page), 'desktop only (130 s)');
  test.setTimeout(200_000);
  await openCity(page, 'tier=T1');
  await waitDrawn(page);
  // the window event exists only behind the dev/e2e window.__city hook
  await page.evaluate(() => {
    (window as unknown as { __perf: unknown[] }).__perf = [];
    window.addEventListener('ui.perf', (e) => (window as unknown as { __perf: unknown[] }).__perf.push((e as CustomEvent).detail));
  });
  await page.waitForTimeout(61_000);
  const sink = await page.evaluate(() => (window as unknown as HarnessWindow).harness.perf);
  const events = await page.evaluate(() => (window as unknown as { __perf: unknown[] }).__perf);
  console.log('C-15 onPerfSample', JSON.stringify(sink));
  expect(sink.length).toBe(1);
  expect(Object.keys(sink[0]).sort()).toEqual(['fps', 'heapMb', 'renderTier', 'tickRenderMsP50', 'tickRenderMsP95']);
  expect(events).toEqual(sink);
  await page.evaluate(() => (window as unknown as HarnessWindow).harness.setVisibility('background'));
  await page.waitForTimeout(61_000);
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).harness.perf.length)).toBe(1);
});

for (const tier of ['T1', 'T0'] as const) {
  test(`C-15 fps is null (never NaN) when no frames were drawn since the last sample (${tier})`, async ({ page }) => {
    await openCity(page, `tier=${tier}&reduced=1`);
    await waitDrawn(page);
    const r = await page.evaluate(async () => {
      const w = window as unknown as HarnessWindow;
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      await sleep(1500); // render on demand: idle, no frames
      w.__city.samplePerfNow(); // flushes whatever was drawn while loading
      await sleep(1500);
      w.__city.samplePerfNow(); // nothing drawn since the previous sample
      const last = w.harness.perf[w.harness.perf.length - 1];
      const values = w.harness.perf.flatMap((p) => [p.fps]);
      return { fps: last.fps, isNull: last.fps === null, anyNaN: values.some((v) => typeof v === 'number' && Number.isNaN(v)), rafPending: w.__city.rafPending() };
    });
    console.log(`C-15 idle ${tier}`, JSON.stringify(r));
    expect(r.rafPending).toBe(false);
    expect(r.isNull).toBe(true);
    expect(r.anyNaN).toBe(false);
  });
}

test('C-05 the real CityWindow.tsx (Spec 1) drives the seam: mount, setters, perf sink, unmount → dispose', async ({ page }) => {
  await page.goto('/citywindow.html?places=bnd_000000_parcel');
  type W = Window & {
    cityWindow: { setBody: (s: { focused: boolean; collapsed: boolean; background: boolean; hidden?: boolean }) => void; setTierOverride: (t: 'auto' | 'T0' | 'T1' | 'T2') => void; setMyPlaces: (ids: string[]) => void; unmount: () => void };
    __quayPerf?: () => readonly { event: string; fps: number | null; renderTier: string }[];
  } & HarnessWindow;
  await waitState(page, 'C-05: CityWindow mount (.city-root + __city) not present', () => !!document.querySelector('[data-testid="city-mount"] .city-root') && !!(window as unknown as W).__city);
  // data arrives through the real window's own fetchChunk (cityChannel.ts)
  await waitState(page, 'C-05: no building parts from the real fetchChunk', () => (window as unknown as W).__city.diagnostics().buildingParts > 0);
  await expect(page.locator('[data-testid="city-body"]')).toHaveAttribute('data-visibility', 'visible');
  // store → renderer setters, through the component's effects
  await page.evaluate(() => (window as unknown as W).cityWindow.setBody({ focused: false, collapsed: false, background: true }));
  await expect(page.locator('[data-testid="city-body"]')).toHaveAttribute('data-visibility', 'background');
  await page.evaluate(() => (window as unknown as W).cityWindow.setBody({ focused: true, collapsed: false, background: false }));
  await page.evaluate(() => (window as unknown as W).cityWindow.setTierOverride('T1'));
  await page.waitForFunction(() => (window as unknown as W).__city.diagnostics().tier === 'T1', null, { timeout: 10_000 });
  await page.evaluate(() => (window as unknown as W).cityWindow.setMyPlaces(['bnd_000001_parcel']));
  const r = await page.evaluate(async () => {
    const w = window as unknown as W;
    // the perf sink is Spec 1's recordPerf
    w.__city.samplePerfNow();
    const perf = w.__quayPerf?.() ?? [];
    const before = w.__city.diagnostics();
    const api = w.__city;
    w.cityWindow.unmount(); // CityWindow cleanup: unmount() + dispose()
    await new Promise((res) => setTimeout(res, 100));
    const after = api.diagnostics();
    return {
      perf: perf.map((p) => ({ event: p.event, tier: p.renderTier, fpsOk: p.fps === null || Number.isFinite(p.fps) })),
      before: [before.geometries, before.textures], after: [after.geometries, after.textures],
      canvases: document.querySelectorAll('canvas').length, roots: document.querySelectorAll('.city-root').length,
      body: document.querySelectorAll('[data-testid="city-body"]').length,
    };
  });
  console.log('C-05 real CityWindow', JSON.stringify(r));
  expect(r.perf.length).toBeGreaterThanOrEqual(1);
  expect(r.perf.at(-1)).toEqual({ event: 'ui.perf', tier: 'T1', fpsOk: true });
  expect(r.before[0]).toBeGreaterThan(0);
  expect(r.after).toEqual([0, 0]);
  expect(r.canvases).toBe(0);
  expect(r.roots).toBe(0);
  expect(r.body).toBe(0);
});

test('C-05 dispose() twice is a no-op; geometries and textures go to 0', async ({ page }) => {
  await openCity(page, 'tier=T2');
  await waitDrawn(page);
  const r = await page.evaluate(() => {
    const w = window as unknown as HarnessWindow;
    const before = w.__city.diagnostics();
    w.harness.renderer.dispose();
    let threw = false;
    try {
      w.harness.renderer.dispose();
    } catch {
      threw = true;
    }
    const again = w.__city.diagnostics();
    return { before: [before.geometries, before.textures], again: [again.geometries, again.textures], threw, canvases: document.querySelectorAll('canvas').length };
  });
  expect(r.before[0]).toBeGreaterThan(0);
  expect(r.again).toEqual([0, 0]);
  expect(r.threw).toBe(false);
  expect(r.canvases).toBe(0);
});

test('C-04 bundle: three.js only in a dynamically loaded chunk; Broker entry has 0 bytes of it', async ({ request }) => {
  const report = (await (await request.get('/bundle-report.json')).json()) as { fileName: string; isEntry: boolean; imports: string[]; threeBytes: number }[];
  const by = new Map(report.map((c) => [c.fileName, c]));
  const closure = (f: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(f)) return seen;
    seen.add(f);
    for (const i of by.get(f)?.imports ?? []) closure(i, seen);
    return seen;
  };
  const entries = report.filter((c) => c.isEntry);
  const broker = entries.find((c) => c.fileName.includes('broker'))!;
  const city = entries.find((c) => /(^|\/)city-/.test(c.fileName))!;
  const realWindow = entries.find((c) => /(^|\/)citywindow-/.test(c.fileName))!;
  const bytes = (f: string) => [...closure(f)].reduce((a, x) => a + (by.get(x)?.threeBytes ?? 0), 0);
  console.log('C-04', JSON.stringify({ brokerStatic: bytes(broker.fileName), cityWindowStatic: bytes(city.fileName), realCityWindowStatic: bytes(realWindow.fileName), threeChunks: report.filter((c) => c.threeBytes > 0).map((c) => [c.fileName, c.threeBytes]) }));
  expect(bytes(broker.fileName)).toBe(0);
  expect(bytes(city.fileName)).toBe(0); // even the City window loads three only on demand
  expect(bytes(realWindow.fileName)).toBe(0); // Spec 1's real CityWindow.tsx too
  expect(report.filter((c) => c.threeBytes > 0).every((c) => !c.isEntry)).toBe(true);
});
