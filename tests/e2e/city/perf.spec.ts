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
    // Wall-clock fps and frame intervals are reported only: under box load they measure the box.
    // Asserted: per-frame budgets from the hook (draw calls, triangles, CPU ms to submit a frame).
    // Frame counts are asserted deterministically on the fake clock (test below).
    expect(iv.length).toBeGreaterThan(0);
    expect(d.drawCalls).toBeLessThanOrEqual(4);
    expect(d.triangles).toBeLessThanOrEqual(16_000);
    expect(percentile(b.cpu, 50), 'CPU ms per frame (p50)').toBeLessThanOrEqual(phone ? 16 : 8);
  }
  saveJson(`perf-${phone ? `phone-cpu${THROTTLE}x` : 'desktop'}.json`, { viewport: page.viewportSize(), cpuThrottle: phone ? THROTTLE : 1, results });
});

// Deterministic frame count: on Playwright's fake clock (rAF every 16 ms) a 2 s benchmark must
// render on every tick, whatever the box load, and stay within the per-frame budgets.
for (const tier of ['T2', 'T1'] as const) {
  test(`perf: benchmark renders every frame, within budgets (fake clock, ${tier})`, async ({ page }) => {
    const phone = isPhone(page);
    await page.clock.install();
    await openCity(page, `tier=${tier}`);
    await waitDrawn(page);
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    const r0 = (await diag(page)).renders;
    const pending = page.evaluate(() => (window as unknown as HarnessWindow).__city.benchmark(2000));
    await page.clock.runFor(2000 + 100);
    const b = await pending;
    const d = await diag(page);
    const frames = d.renders - r0;
    console.log(`perf fake-clock ${phone ? 'phone' : 'desktop'} ${tier}: frames ${frames}, samples ${b.cpu.length}, drawCalls ${d.drawCalls}, triangles ${d.triangles}`);
    // 2000 ms / 16 ms rAF ticks = 125; allow the edges
    expect(b.cpu.length).toBeGreaterThanOrEqual(120);
    expect(b.cpu.length).toBeLessThanOrEqual(130);
    expect(frames).toBeGreaterThanOrEqual(b.cpu.length);
    expect(Math.max(...b.intervals.slice(1))).toBeLessThanOrEqual(17); // no skipped tick
    expect(d.tier).toBe(tier);
    expect(d.drawCalls).toBeLessThanOrEqual(4);
    expect(d.triangles).toBeLessThanOrEqual(16_000);
  });
}
