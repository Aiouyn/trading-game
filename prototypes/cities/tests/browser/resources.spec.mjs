import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ready } from '../../tools/browser-ready.mjs';

test('diagnostics exposes serializable metrics and frame() has no synchronous readPixels call', async ({ page, baseURL }) => {
  const src = await readFile(new URL('../../src/render.js', import.meta.url), 'utf8');
  const frameBlock = src.slice(src.indexOf('frame(dt)'), src.indexOf('applyLOD()'));
  expect(frameBlock).not.toMatch(/readPixels/);

  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const diag = await page.evaluate(() => window.__cities.diagnostics());
  expect(diag.cityId).toBe('avalon');
  expect(diag.seed).toBe(1701);
  expect(typeof diag.version).toBe('string');
  expect(typeof diag.renderer.renderer).toBe('string');
  expect(diag.drawCalls).toBeGreaterThan(0);
  expect(diag.triangles).toBeGreaterThan(0);
  expect(diag.memory.geometries).toBeGreaterThan(0);
  expect(diag.memory.textures).toBeGreaterThan(0);
  expect(Array.isArray(diag.activeCacheIds)).toBe(true);
});

test('cycling Avalon and Kaiyo ten times plateaus geometry and texture counts and bounds LRU cache to 2 cities', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const result = await page.evaluate(async () => {
    const a = window.__cities;
    // Warm up both cities plus a third to test LRU bound
    await a.open('kaiyo');
    await a.open('meridia');
    await a.open('avalon');
    const afterWarmup = a.diagnostics();
    const samples = [];
    for (let i = 0; i < 10; i++) {
      await a.open(i % 2 === 0 ? 'kaiyo' : 'avalon');
      a.view.dirty = true;
      a.view.frame(0);
      samples.push(a.diagnostics());
    }
    return { afterWarmup, samples };
  });

  expect(result.afterWarmup.activeCacheIds.length).toBeLessThanOrEqual(2);
  // Compare Avalon on cycle 1 vs cycle 9, and Kaiyo on cycle 0 vs cycle 8
  const kaiyo0 = result.samples[0].memory;
  const kaiyo8 = result.samples[8].memory;
  const avalon1 = result.samples[1].memory;
  const avalon9 = result.samples[9].memory;
  expect(kaiyo8.geometries).toBe(kaiyo0.geometries);
  expect(kaiyo8.textures).toBe(kaiyo0.textures);
  expect(avalon9.geometries).toBe(avalon1.geometries);
  expect(avalon9.textures).toBe(avalon1.textures);
});

test('rapid Avalon -> Kaiyo -> Avalon switching settles cleanly on the latest requested city', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const finalCity = await page.evaluate(async () => {
    const a = window.__cities;
    const p1 = a.open('nordhaven');
    const p2 = a.open('kaiyo');
    const p3 = a.open('avalon');
    await Promise.allSettled([p1, p2, p3]);
    return a.city.P.id;
  });
  expect(finalCity).toBe('avalon');
});
