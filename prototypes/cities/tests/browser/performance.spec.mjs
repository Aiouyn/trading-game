import { test, expect } from '@playwright/test';
import { ready } from '../../tools/browser-ready.mjs';

test('culled road and terrain tiles return when the camera pans back', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const result = await page.evaluate(() => {
    const v = window.__cities.view;
    v.motion = false; v.fly = null; v.setPlan(false); v.scale = 0.22;
    const draw = (x, z) => { v.target.set(x, 0, z); v.dirty = true; v.frame(0); };
    draw(0, -150);
    const visible = v.objects.filter(o => o.visible && ['ground', 'roads'].includes(o.userData.layer));
    draw(-1000, -1000);
    const culled = visible.filter(o => !o.visible);
    draw(0, -150);
    return { culled: culled.length, restored: culled.filter(o => o.visible).length, layers: [...new Set(culled.map(o => o.userData.layer))] };
  });
  expect(result.culled).toBeGreaterThan(0);
  expect(result.layers).toContain('ground'); expect(result.layers).toContain('roads');
  expect(result.restored).toBe(result.culled);
});

test('deferred scene chunks finish without the capture-only flush hook', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?city=avalon&t=15`);
  await page.waitForFunction(() => window.__cities?.view?.chunksReady === true, null, { timeout: 45000 });
  const state = await page.evaluate(() => ({ remaining: window.__cities.view.chunkQueue.length, buildings: window.__cities.city.buildings.length }));
  expect(state.remaining).toBe(0); expect(state.buildings).toBeGreaterThan(500);
});

test('selection outlines submit only selected building instances', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const result = await page.evaluate(() => {
    const a = window.__cities, b = a.city.buildings.find(b => b.d.id === 'oldharbor' && b.kind !== 'Landmark');
    a.select(b.id); a.view.dirty = true; a.view.frame(0);
    return { outlined: a.view.outlines.reduce((s, m) => s + m.geometry.instanceCount, 0), all: Object.values(a.city.parts).reduce((s, arr) => s + arr.length / 18, 0) };
  });
  expect(result.outlined).toBeGreaterThan(0);
  expect(result.outlined).toBeLessThan(result.all / 10);
});

test('low quality caps a 4K framebuffer and preserves the same city data', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const buildings = await page.evaluate(() => { const v = window.__cities.view; v.motion = false; v.setQualityTier('low'); return window.__cities.city.buildings.length; });
  await page.setViewportSize({ width: 3840, height: 2160 });
  const result = await page.evaluate(() => {
    const v = window.__cities.view; v.resize(); v.dirty = true; v.frame(0);
    const gl = v.renderer.getContext();
    return { pixels: gl.drawingBufferWidth * gl.drawingBufferHeight, buildings: window.__cities.city.buildings.length };
  });
  expect(result.pixels).toBeLessThanOrEqual(700000);
  expect(result.pixels).toBeGreaterThan(100000);
  expect(result.buildings).toBe(buildings);
});
