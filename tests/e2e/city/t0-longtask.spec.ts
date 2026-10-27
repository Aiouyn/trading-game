import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE, expect, openCity, saveJson, waitDrawn } from './helpers';

// T0 first picture: the build must never hold the main thread for over 1 s.
// Before the bitmap ground, the ~52k queued per-cell ground fills were painted in one
// synchronous flush at toDataURL (up to 6.9 s on a loaded box, 754 ms on CI).
const LONG_TASK_MAX_MS = 1000;

interface LongTaskWindow { __longTasks: { start: number; duration: number }[] }

test.describe('T0 picture long tasks', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as LongTaskWindow;
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) });
      }).observe({ type: 'longtask', buffered: true });
    });
  });

  const longTasks = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)))); // let the observer flush
    return page.evaluate(() => (window as unknown as LongTaskWindow).__longTasks);
  };

  test('no long task over 1 s while building the T0 picture', async ({ page }, info) => {
    await openCity(page, 'tier=T0');
    const d = await waitDrawn(page);
    expect(d.tier).toBe('T0');
    const tasks = await longTasks(page);
    const longest = Math.max(0, ...tasks.map((t) => t.duration));
    saveJson(`t0-longtasks-${info.project.name}.json`, { longest, tasks });
    console.log(`[t0-longtask] ${info.project.name}: longest ${longest} ms, ${tasks.length} long tasks`);
    expect(tasks.filter((t) => t.duration > LONG_TASK_MAX_MS), `long tasks > ${LONG_TASK_MAX_MS} ms`).toEqual([]);
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
