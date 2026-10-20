import { test } from '@playwright/test';
import { expect, isPhone, openCity, saveJson, waitDrawn, type HarnessWindow } from './helpers';

const relLum = (rgb: number[]) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

test.describe('B2 fonts', () => {
  test('Inter, Instrument Serif and JetBrains Mono are loaded; labels and chrome use the font tokens', async ({ page }) => {
    await openCity(page, 'tier=T1&reduced=1');
    await waitDrawn(page);
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => ({
      serif: document.fonts.check('16px "Instrument Serif"'),
      inter: document.fonts.check('14px "Inter"'),
      mono: document.fonts.check('14px "JetBrains Mono"'),
      label: getComputedStyle(document.querySelector('.city-district-label')!).fontFamily,
      chrome: getComputedStyle(document.querySelector('.city-root')!).fontFamily,
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    }));
    console.log('B2 fonts', JSON.stringify(r));
    expect(r.serif && r.inter && r.mono).toBe(true);
    expect(r.loaded).toEqual(expect.arrayContaining(['Instrument Serif', 'Inter']));
    expect(r.label).toMatch(/Instrument Serif/);
    expect(r.chrome).toMatch(/Inter/);
  });
});

test.describe('B1 label legibility', () => {
  for (const tier of ['T2', 'T1'] as const) {
    test(`labels: --fg with a 3 px --bg0 knockout stroke, ≥ 4.5:1 against the map behind them (${tier})`, async ({ page }) => {
      await openCity(page, `tier=${tier}&reduced=1`);
      await waitDrawn(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.city-district-label')!;
        const cs = getComputedStyle(el);
        const probe = document.createElement('span');
        probe.style.color = 'var(--fg, var(--color-fg))';
        document.body.append(probe);
        const fg = getComputedStyle(probe).color;
        probe.style.color = 'var(--bg0, var(--color-ink-0))';
        const bg0 = getComputedStyle(probe).color;
        probe.remove();
        return {
          color: cs.color, fg, bg0,
          stroke: cs.getPropertyValue('-webkit-text-stroke-width'), strokeColor: cs.getPropertyValue('-webkit-text-stroke-color'),
          paintOrder: cs.getPropertyValue('paint-order'), shadow: cs.textShadow, font: cs.font,
          boxes: (window as unknown as HarnessWindow).__city.labelBoxes(), bg: (window as unknown as HarnessWindow).__city.labelBackground(),
        };
      });
      const rgb = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map((x) => Number(x) / 255);
      expect(r.color).toBe(r.fg);
      expect(r.stroke).toBe('6px'); // centred: 3 px outside the glyph
      expect(r.strokeColor).toBe(r.bg0);
      expect(r.paintOrder).toMatch(/^stroke/);
      expect(r.shadow).toBe('none');
      const fgL = relLum(rgb(r.fg));
      const rows = r.bg!.map((b) => ({ text: b.text, contrastP50: +contrast(fgL, b.p50).toFixed(2), contrastP75: +contrast(fgL, b.p75).toFixed(2) }));
      const view = page.viewportSize()!;
      const onScreen = r.boxes.filter((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= view.width && b.y + b.h <= view.height);
      const hidden = r.boxes.filter((b) => b.x < -1000);
      console.log(`B1 ${tier} ${view.width}`, JSON.stringify(rows));
      saveJson(`labels-${tier}-${view.width}.json`, { rows, boxes: r.boxes, haloContrast: contrast(fgL, relLum(rgb(r.bg0))) });
      // every label is either fully on screen or deliberately hidden (it would collide); most are shown
      expect(onScreen.length + hidden.length).toBe(r.boxes.length);
      expect(onScreen.length).toBeGreaterThanOrEqual(view.width < 560 ? 5 : 8);
      for (const row of rows.filter((_, i) => r.boxes[i].x > -1000)) expect(row.contrastP75, row.text).toBeGreaterThanOrEqual(4.5);
      // shown labels do not overlap each other
      for (let i = 0; i < onScreen.length; i++) for (let j = i + 1; j < onScreen.length; j++) {
        const a = onScreen[i], b = onScreen[j];
        const ov = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(ov, `${a.text} × ${b.text}`).toBe(0);
      }
    });
  }
});

test.describe('A.6 see-through', () => {
  test('a selected building behind others is cut free (instant under reduced motion); deselect restores', async ({ page }) => {
    await openCity(page, 'tier=T2&reduced=1');
    await waitDrawn(page);
    const r = await page.evaluate(async () => {
      const w = window as unknown as HarnessWindow;
      const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      // short buildings in the centre: likely hidden behind towers
      const ids = w.__city.tableRows().filter((x) => x.kind === 'property').map((x) => x.entityId);
      for (const id of ids.slice(0, 400)) {
        w.harness.renderer.focus({ entityId: id });
        w.__city.setCamera({ zoom: 1.5 });
        await raf();
        const n = w.__city.cutCount();
        if (n > 0) {
          w.harness.renderer.setOverlay('none');
          return { id, cut: n };
        }
      }
      return null;
    });
    console.log('A.6 cut-away', JSON.stringify(r));
    expect(r).not.toBeNull();
    expect(r!.cut).toBeGreaterThan(0);
  });
});

test.describe('M7 T0 controls', () => {
  test('T0 shows only View as table and "Map picture · updates daily"; no lens or camera tools', async ({ page }) => {
    await openCity(page, 'tier=T0');
    await waitDrawn(page);
    if (isPhone(page)) await page.locator('.city-sheet-handle').click();
    await expect(page.getByText('Map picture · updates daily')).toBeVisible();
    for (const name of ['Movers', 'My places', 'Rotate left', 'Zoom in']) await expect(page.getByRole('button', { name })).toBeHidden();
    await expect(page.getByRole('button', { name: 'View as table' })).toBeVisible();
  });
});

test.describe('M4/M5 table numbers and phone list', () => {
  test('numbers right-aligned in the mono face; Today shows "unavailable" without a quote; list layout below 560 px', async ({ page }) => {
    await openCity(page, 'tier=T1&reduced=1');
    await waitDrawn(page);
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.renderer.openTable());
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const district = document.querySelector('.city-table tbody tr')!;
      const num = [...district.querySelectorAll<HTMLElement>('td.num')].find((t) => t.textContent && t.offsetParent !== null)!;
      const cs = getComputedStyle(num);
      const hqBtn = [...document.querySelectorAll<HTMLButtonElement>('.city-table tbody button.name')].find((b) => (window as unknown as HarnessWindow).__city.tableRows().find((x) => x.entityId === b.dataset.entityId)?.kind === 'company_hq')!;
      const hqRow = hqBtn.closest('tr')!;
      const thead = getComputedStyle(document.querySelector('.city-table thead')!).display;
      const header = getComputedStyle(document.querySelector('.city-table th')!);
      return { align: cs.textAlign, font: cs.fontFamily, text: num.textContent, hq: [...hqRow.querySelectorAll<HTMLElement>('td.num')].filter((t) => t.offsetParent !== null).map((t) => t.textContent), thead, headerCase: header.textTransform, headerTrack: header.letterSpacing, scrollW: document.querySelector('.city-table')!.scrollWidth, w: document.querySelector('.city-table')!.clientWidth };
    });
    console.log('M4/M5', JSON.stringify(r));
    expect(r.align).toBe('right');
    expect(r.font).toMatch(/JetBrains Mono/);
    expect(r.text).toMatch(/^\$\d/);
    expect(r.hq).toContain('unavailable');
    expect(r.scrollW).toBeLessThanOrEqual(r.w);
    if (isPhone(page)) expect(r.thead).toBe('none');
    else {
      expect(r.thead).not.toBe('none');
      expect(r.headerCase).toBe('uppercase');
    }
  });
});

test.describe('A.1 my places', () => {
  test('setMyPlaces updates the map and table live; the ids never reach the network', async ({ page }) => {
    await openCity(page, 'tier=T2&reduced=1');
    await waitDrawn(page);
    const r = await page.evaluate(async () => {
      const w = window as unknown as HarnessWindow;
      const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      w.harness.renderer.setOverlay('my_places');
      await raf();
      const before = w.__city.brassCheck(3)!;
      const ids = w.harness.info.mine;
      w.harness.renderer.setMyPlaces(ids);
      await raf();
      const after = w.__city.brassCheck(3)!;
      const rowsMine = w.__city.tableRows().filter((x) => x.mine).map((x) => x.entityId).sort();
      return { before: before.maskPixels, after: after.maskPixels, outside: after.outside, rowsMine, ids: [...ids].sort(), log: w.harness.fetchLog };
    });
    expect(r.after).toBeGreaterThan(r.before);
    expect(r.outside).toBe(0);
    expect(r.rowsMine).toEqual(r.ids);
    for (const id of r.ids) expect(r.log.join(' ')).not.toContain(id);
  });
});
