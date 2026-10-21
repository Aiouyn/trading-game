import { test } from '@playwright/test';
import { diag, expect, isPhone, openCity, saveJson, waitDrawn, type HarnessWindow } from './helpers';
import { percentile } from '../../../src/city/diagnostics/perf';

// Real frame timing in headless Chromium: rAF intervals while the camera moves every frame
// (continuous rendering forced through __city.benchmark). Phone-class = 390×844 @ DPR 3 with
// CDP CPU throttling (CITY_PHONE_CPU_THROTTLE, default 4×). Results go to the evidence folder.
const THROTTLE = Number(process.env.CITY_PHONE_CPU_THROTTLE ?? 4);

test('perf: frame timing, load and decode', async ({ page }) => {
  test.setTimeout(120_000);
  const phone = isPhone(page);
  const cdp = await page.context().newCDPSession(page);
  if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const results: Record<string, unknown> = {};
  for (const tier of phone ? (['T1', 'T2'] as const) : (['T2', 'T1'] as const)) {
    await openCity(page, `tier=${tier}`);
    await waitDrawn(page);
    await page.waitForTimeout(500);
    const b = await page.evaluate(() => (window as unknown as HarnessWindow).__city.benchmark(5000));
    const d = await diag(page);
    const extra = await page.evaluate(() => {
      const c = (window as unknown as HarnessWindow).__city;
      const gl = document.querySelector('canvas')!.getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        decodeMs: c.decodeMs(),
        decodeInWorker: c.decodeInWorker(),
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        heapMb: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ? (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1048576 : null,
        hardwareConcurrency: navigator.hardwareConcurrency,
      };
    });
    const iv = b.intervals.slice(5); // drop warm-up
    const mean = iv.reduce((a, x) => a + x, 0) / iv.length;
    results[tier] = {
      frames: iv.length,
      fpsMean: 1000 / mean,
      frameMs: { p50: percentile(iv, 50), p95: percentile(iv, 95), max: Math.max(...iv) },
      cpuRenderMs: { p50: percentile(b.cpu, 50), p95: percentile(b.cpu, 95) },
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      buildingParts: d.buildingParts,
      canvasPixels: d.canvasPixels,
      gpuMemEstimateMb: d.gpuMemEstimateMb,
      loadMs: d.loadMs,
      ...extra,
    };
    console.log(`perf ${phone ? 'phone' : 'desktop'} ${tier}`, JSON.stringify(results[tier]));
    expect(iv.length).toBeGreaterThan(10);
  }
  saveJson(`perf-${phone ? `phone-cpu${THROTTLE}x` : 'desktop'}.json`, { viewport: page.viewportSize(), cpuThrottle: phone ? THROTTLE : 1, results });
});
