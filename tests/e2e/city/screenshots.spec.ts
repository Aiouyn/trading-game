import { test } from '@playwright/test';
import { join } from 'node:path';
import { EVIDENCE, expect, isPhone, openCity, waitDrawn, type HarnessWindow } from './helpers';

// C-16 evidence. Written outside the repo (CITY_EVIDENCE_DIR); never committed.
test('screenshots: T2, T1, T0 and table view', async ({ page }) => {
  const size = isPhone(page) ? '390x844' : '1280x800';
  for (const tier of ['T2', 'T1', 'T0'] as const) {
    await openCity(page, `tier=${tier}&reduced=1&mine=1`);
    await waitDrawn(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "Instrument Serif"'))).toBe(true);
    if (tier === 'T0') await page.evaluate(() => (window as unknown as HarnessWindow).harness.setVisibility('visible'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(EVIDENCE, `city-${size}-${tier}.png`) });
  }
  await page.evaluate(() => (window as unknown as HarnessWindow).harness.renderer.openTable());
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(EVIDENCE, `city-${size}-table.png`) });
  // see-through: a building behind towers, selected (cut-away), T2
  await openCity(page, 'tier=T2&reduced=1');
  await waitDrawn(page);
  await page.evaluate(async () => {
    const w = window as unknown as HarnessWindow;
    const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    for (const r of w.__city.tableRows().filter((x) => x.kind === 'property').slice(0, 400)) {
      w.harness.renderer.focus({ entityId: r.entityId });
      w.__city.setCamera({ zoom: 1.6 });
      await raf();
      if (w.__city.cutCount() > 2) break;
    }
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(EVIDENCE, `city-${size}-T2-cutaway.png`) });
  if (isPhone(page)) {
    await page.goto('about:blank');
    await openCity(page, 'tier=T1&reduced=1');
    await waitDrawn(page);
    await page.locator('.city-sheet-handle').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(EVIDENCE, `city-${size}-T1-sheet-open.png`) });
  }
});
