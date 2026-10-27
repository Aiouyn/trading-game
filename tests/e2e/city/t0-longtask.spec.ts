import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE, expect, openCity, saveJson, waitDrawn } from './helpers';

// T0 first picture: the build must never hold the main thread for over 250 ms.
// Before the bitmap ground, the ~52k queued per-cell ground fills were painted in one
// synchronous flush at toDataURL (up to 6.9 s on a loaded box, 754 ms on CI). After the fix CI
// logged 80 ms desktop / 69 ms phone (run 40547475243); QA's local box 72–99 ms. QA's mutant
// "no willReadFrequently" (accelerated canvas on SwiftShader) took 428 ms locally.
const LONG_TASK_MAX_MS = 250;
// Time alone is machine-dependent (QA's per-pixel fillRect ground mutant took only 107 ms), so the
// canvas call count is the machine-independent signal: fill() + fillRect() + drawImage() on any
// 2D context. ~3.6k after the fix (part faces + a handful of fillRects + 1 drawImage); ~56k with
// per-cell ground fills, ~65k with a per-pixel fillRect ground bitmap.
const CANVAS_CALLS_MAX = 10_000;
// The ground is one bitmap mapped by one drawImage; nothing else in the T0 picture uses drawImage.
const GROUND_DRAW_IMAGES = 1;

interface Calls { fill: number; fillRect: number; drawImage: number }
interface LongTaskWindow { __longTasks: { start: number; duration: number }[]; __calls: Calls }

test.describe('T0 picture long tasks', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as LongTaskWindow;
      w.__longTasks = [];
      w.__calls = { fill: 0, fillRect: 0, drawImage: 0 };
      const proto = CanvasRenderingContext2D.prototype as unknown as Record<keyof Calls, (...a: unknown[]) => unknown>;
      for (const k of ['fill', 'fillRect', 'drawImage'] as const) {
        const orig = proto[k];
        proto[k] = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
          w.__calls[k]++;
          return orig.apply(this, a);
        };
      }
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) });
      }).observe({ type: 'longtask', buffered: true });
    });
  });

  const longTasks = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)))); // let the observer flush
    return page.evaluate(() => (window as unknown as LongTaskWindow).__longTasks);
  };

  test('no long task over 250 ms while building the T0 picture, < 10k canvas draws, ground in one drawImage', async ({ page }, info) => {
    await openCity(page, 'tier=T0');
    const d = await waitDrawn(page);
    expect(d.tier).toBe('T0');
    const tasks = await longTasks(page);
    const longest = Math.max(0, ...tasks.map((t) => t.duration));
    const calls = await page.evaluate(() => (window as unknown as LongTaskWindow).__calls);
    const total = calls.fill + calls.fillRect + calls.drawImage;
    saveJson(`t0-longtasks-${info.project.name}.json`, { longest, calls, total, tasks });
    console.log(`[t0-longtask] ${info.project.name}: longest ${longest} ms, ${tasks.length} long tasks, canvas calls ${JSON.stringify(calls)} total ${total}`);
    expect(tasks.filter((t) => t.duration > LONG_TASK_MAX_MS), `long tasks > ${LONG_TASK_MAX_MS} ms`).toEqual([]);
    expect(total, 'fill + fillRect + drawImage calls in the T0 build (per-cell or per-pixel ground draws are back?)').toBeLessThan(CANVAS_CALLS_MAX);
    expect(calls.drawImage, 'the T0 ground is one bitmap drawn by one drawImage').toBe(GROUND_DRAW_IMAGES);
    expect(calls.fill, 'the T0 picture drew its part faces').toBeGreaterThan(0);
  });

  test('evidence: T0 trace and picture', async ({ page, browser }, info) => {
    const name = info.project.name;
    await browser.startTracing(page, { path: join(EVIDENCE, `t0-trace-${name}.json`), categories: ['devtools.timeline', 'toplevel', 'v8.execute'] });
    await openCity(page, 'tier=T0');
    await waitDrawn(page);
    await browser.stopTracing();
    const src = await page.locator('.city-stage img[src^="data:"]').getAttribute('src');
    expect(src).toMatch(/^data:image\/png;base64,/);
    writeFileSync(join(EVIDENCE, `t0-picture-${name}.png`), Buffer.from(src!.split(',')[1], 'base64'));
    saveJson(`t0-trace-longtasks-${name}.json`, await longTasks(page));
  });
});
