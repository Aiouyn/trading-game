import { test } from '@playwright/test';
import { expect, openCity, waitDrawn, saveJson, type HarnessWindow } from './helpers';

// C-12: brass pixels (ΔE < 3 from --acc, --acc-hi or --acc-lo) only inside the mask of my places, crown towers and the
// selection outline. The mask is rendered from the same scene with only those elements white.
test.describe('C-12 brass discipline', () => {
  const cases = [
    { name: 'default view', q: 'tier=T2&reduced=1', setup: () => undefined },
    {
      name: 'my places overlay + selection',
      q: 'tier=T2&reduced=1&mine=1',
      setup: () => {
        const w = window as unknown as HarnessWindow;
        w.harness.renderer.setOverlay('my_places');
        w.harness.renderer.focus({ entityId: w.harness.info.mine[0] });
        w.__city.setCamera({ zoom: 1 });
      },
    },
    { name: 'movers overlay', q: 'tier=T2&reduced=1', setup: () => (window as unknown as HarnessWindow).harness.renderer.setOverlay('movers') },
  ];
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await openCity(page, c.q);
      await waitDrawn(page);
      await page.evaluate(c.setup);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => (window as unknown as HarnessWindow).__city.brassCheck(3));
      console.log('C-12', c.name, JSON.stringify(r));
      saveJson(`brass-${c.name.replace(/\W+/g, '-')}-${page.viewportSize()!.width}.json`, r);
      expect(r).not.toBeNull();
      expect(r!.brass).toBeGreaterThan(0); // crown towers are on screen: the test can see brass
      expect(r!.outside).toBe(0);
      const share = r!.brass / (page.viewportSize()!.width * page.viewportSize()!.height);
      console.log('C-12 brass share', (share * 100).toFixed(2), '%');
      if (c.name === 'default view') expect(share).toBeLessThanOrEqual(0.02); // review M2 [P]
    });
  }

  for (const tier of ['T0', 'T1', 'T2']) {
    test(`chrome has ≤ 1 accent button (${tier})`, async ({ page }) => {
      await openCity(page, `tier=${tier}`);
      await waitDrawn(page);
      const n = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--acc)';
        document.body.append(probe);
        const acc = getComputedStyle(probe).color;
        probe.remove();
        return [...document.querySelectorAll('.city-root button')].filter((b) => getComputedStyle(b).backgroundColor === acc && (b as HTMLElement).offsetParent !== null).length;
      });
      expect(n).toBeLessThanOrEqual(1);
    });
  }
});
