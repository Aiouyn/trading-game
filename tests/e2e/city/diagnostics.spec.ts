import { test } from '@playwright/test';
import { diag, expect, isPhone, openCity, waitDrawn, type HarnessWindow } from './helpers';

test('C-15 every diagnostics field is a finite number after the first frame (auto tier)', async ({ page }) => {
  await openCity(page);
  await waitDrawn(page);
  await page.waitForFunction(() => (window as unknown as HarnessWindow).__city.diagnostics().fpsFirst2s !== null, null, { timeout: 30_000 });
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

test('C-05 dispose(): twice is a no-op; geometries and textures go to 0', async ({ page }) => {
  await openCity(page, 'tier=T2');
  await waitDrawn(page);
  const r = await page.evaluate(() => {
    const w = window as unknown as HarnessWindow;
    const before = w.__city.diagnostics();
    w.harness.renderer.dispose();
    const after = w.__city.diagnostics();
    let threw = false;
    try {
      w.harness.renderer.dispose();
    } catch {
      threw = true;
    }
    const again = w.__city.diagnostics();
    return { before: [before.geometries, before.textures], after: [after.geometries, after.textures], again: [again.geometries, again.textures], threw, canvases: document.querySelectorAll('canvas').length, roots: document.querySelectorAll('.city-root').length };
  });
  console.log('C-05', JSON.stringify(r));
  expect(r.before[0]).toBeGreaterThan(0);
  expect(r.after).toEqual([0, 0]);
  expect(r.again).toEqual([0, 0]);
  expect(r.threw).toBe(false);
  expect(r.canvases).toBe(0);
  expect(r.roots).toBe(0);
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
  const city = entries.find((c) => c.fileName.includes('city'))!;
  const bytes = (f: string) => [...closure(f)].reduce((a, x) => a + (by.get(x)?.threeBytes ?? 0), 0);
  console.log('C-04', JSON.stringify({ brokerStatic: bytes(broker.fileName), cityWindowStatic: bytes(city.fileName), threeChunks: report.filter((c) => c.threeBytes > 0).map((c) => [c.fileName, c.threeBytes]) }));
  expect(bytes(broker.fileName)).toBe(0);
  expect(bytes(city.fileName)).toBe(0); // even the City window loads three only on demand
  expect(report.filter((c) => c.threeBytes > 0).every((c) => !c.isEntry)).toBe(true);
});
