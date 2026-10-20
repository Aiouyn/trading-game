import { test } from '@playwright/test';
import AxeBuilderSource from './axe-source';
import { expect, isPhone, openCity, waitDrawn, type HarnessWindow } from './helpers';

test.describe('C-02 map ↔ table (17-AT-24 list part)', () => {
  test('every map-pickable entity is a table row, and a map pick equals the row pick', async ({ page }) => {
    test.skip(isPhone(page), 'one full sweep is enough; run on desktop');
    test.setTimeout(600_000);
    // reduced motion: focus() jumps instead of tweening, so the sweep is deterministic
    await openCity(page, 'tier=T1&reduced=1');
    await waitDrawn(page);
    const result = await page.evaluate(async () => {
      const w = window as unknown as HarnessWindow;
      const city = w.__city;
      const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const pickable = city.pickableIds();
      const rows = city.tableRows();
      const rowIds = rows.map((r) => r.entityId).sort();
      const canvas = document.querySelector('canvas')!;
      const districtIds = new Set(rows.filter((r) => r.kind === 'district').map((r) => r.entityId));
      w.harness.renderer.openTable();
      const mismatches: string[] = [];
      const unreachable: string[] = [];
      let checked = 0;
      const taps: number[] = [];
      for (const id of pickable) {
        let mapPick: unknown = null;
        for (const rotation of [0, 1, 2, 3] as const) {
          // centre the camera on the entity, zoomed in, and tap its roof-top anchor
          city.setCamera({ rotation, zoom: 4 });
          if (!districtIds.has(id)) {
            w.harness.renderer.focus({ entityId: id });
            city.setCamera({ rotation, zoom: 4 });
          }
          await raf();
          const a = city.anchorOf(id)!;
          w.harness.picks.length = 0;
          if (districtIds.has(id)) {
            const label = [...document.querySelectorAll<HTMLButtonElement>('.city-district-label')].find((b) => b.textContent === rows.find((r) => r.entityId === id)!.name)!;
            label.click();
          } else {
            const r = canvas.getBoundingClientRect();
            const opts = { clientX: r.left + a.x, clientY: r.top + a.y, pointerId: 1, bubbles: true };
            canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
            canvas.dispatchEvent(new PointerEvent('pointerup', opts));
          }
          // a repeated tap on the same spot cycles to the entity behind (see-through)
          for (let tap = 0; tap < 8 && !mapPick; tap++) {
            const p = w.harness.picks[tap];
            if (p && p.entityId === id) mapPick = p;
            else if (!districtIds.has(id) && p) {
              const r = canvas.getBoundingClientRect();
              const opts = { clientX: r.left + a.x, clientY: r.top + a.y, pointerId: 1, bubbles: true };
              canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
              canvas.dispatchEvent(new PointerEvent('pointerup', opts));
            } else break;
          }
          if (mapPick) {
            taps.push(w.harness.picks.length);
            break;
          }
        }
        if (!mapPick) {
          unreachable.push(id);
          continue;
        }
        // same camera: activate the table row
        w.harness.picks.length = 0;
        const btn = document.querySelector<HTMLButtonElement>(`.city-table button[data-entity-id="${id}"]`)!;
        btn.click();
        const rowPick = w.harness.picks[0];
        if (JSON.stringify(rowPick) !== JSON.stringify(mapPick)) mismatches.push(`${id}: ${JSON.stringify(mapPick)} vs ${JSON.stringify(rowPick)}`);
        checked++;
      }
      return { tapsNeeded: taps.reduce((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {} as Record<number, number>), pickable: pickable.length, rows: rowIds.length, sameSet: JSON.stringify([...pickable].sort()) === JSON.stringify(rowIds), checked, unreachable, mismatches: mismatches.slice(0, 10), mismatchCount: mismatches.length };
    });
    console.log('C-02', JSON.stringify({ ...result, unreachable: result.unreachable.slice(0, 20), unreachableCount: result.unreachable.length }));
    expect(result.sameSet).toBe(true);
    expect(result.unreachable).toEqual([]);
    expect(result.mismatchCount).toBe(0);
    expect(result.checked).toBe(result.rows);
  });
});

test.describe('C-03 View as table: present, focusable, accessible', () => {
  for (const tier of ['T0', 'T1', 'T2'] as const) {
    test(`${tier}`, async ({ page }) => {
      await openCity(page, `tier=${tier}`);
      await waitDrawn(page);
      const btn = page.getByRole('button', { name: 'View as table' });
      await expect(btn).toBeVisible();
      // keyboard: Tab reaches it, Enter opens the table, search gets focus
      let reached = false;
      for (let i = 0; i < 40 && !reached; i++) {
        await page.keyboard.press('Tab');
        reached = await btn.evaluate((b) => b === document.activeElement);
      }
      expect(reached).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('region', { name: 'City as a table' })).toBeVisible();
      await expect(page.getByLabel('Search the city')).toBeFocused();
      await page.keyboard.type('Crown');
      await expect(page.locator('.city-table tbody tr')).toHaveCount(3);
      // Tab order: search → Back to map → first row
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Back to map' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('.city-table tbody button').first()).toBeFocused();
      await page.addScriptTag({ content: AxeBuilderSource });
      const res = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
        const r = await axe.run({ include: [['.city-table']] }, { resultTypes: ['violations'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }));
      });
      console.log(`C-03 ${tier} axe violations`, JSON.stringify(res));
      expect(res.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('region', { name: 'City as a table' })).toBeHidden();
    });
  }
});
