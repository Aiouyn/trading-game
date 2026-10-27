import { test } from '@playwright/test';
import { diag, expect, isPhone, openCity, card1Limit, saveJson, waitDrawn, type HarnessWindow } from './helpers';

// C-10. Reference seed, default view, then the worst case (zoomed fully out).
test('C-10 budgets', async ({ page }) => {
  const phone = isPhone(page);
  await openCity(page, phone ? 'tier=T1' : 'tier=T2');
  await waitDrawn(page);
  await page.waitForTimeout(300);
  const views: Record<string, unknown> = {};
  for (const [name, zoom] of [['default', 1], ['zoomed-out', 0.25], ['zoomed-in', 4]] as const) {
    await page.evaluate((z) => (window as unknown as HarnessWindow).__city.setCamera({ zoom: z }), zoom);
    await page.waitForTimeout(300);
    const d = await diag(page);
    views[name] = d;
    // card 1 (ground + coast): +1 call, +2k triangles over #41
    const LIMIT = card1Limit(phone);
    expect(d.drawCalls, `${name}: draw calls`).toBeLessThanOrEqual(LIMIT.calls);
    expect(d.triangles, `${name}: triangles`).toBeLessThanOrEqual(LIMIT.tris);
    if (phone) {
      expect(d.tier).toBe('T1');
      expect(d.drawCalls).toBeLessThanOrEqual(60);
      expect(d.triangles).toBeLessThanOrEqual(150_000);
      expect(d.buildingParts).toBeLessThanOrEqual(12_000);
      expect(d.canvasPixels).toBeLessThanOrEqual(2_000_000);
      expect(d.gpuMemEstimateMb).toBeLessThanOrEqual(32);
    } else {
      expect(d.tier).toBe('T2');
      expect(d.drawCalls).toBeLessThanOrEqual(120);
      expect(d.triangles).toBeLessThanOrEqual(400_000);
      expect(d.canvasPixels).toBeLessThanOrEqual(2_400_000);
      expect(d.gpuMemEstimateMb).toBeLessThanOrEqual(64);
    }
    expect(d.loadMs.firstFrame).toBeLessThanOrEqual(2000);
  }
  const dpr = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    return { devicePixelRatio, renderScale: c.width / c.clientWidth };
  });
  expect(dpr.renderScale).toBeLessThanOrEqual(phone ? 1.0 : 1.5);
  saveJson(`budgets-${phone ? 'phone-T1' : 'desktop-T2'}.json`, { viewport: page.viewportSize(), dpr, views });
});
