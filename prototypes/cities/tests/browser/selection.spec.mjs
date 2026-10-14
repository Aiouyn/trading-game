import { test, expect } from '@playwright/test';
import { ready } from '../../tools/browser-ready.mjs';

test('default cutaway is selected-only; no buildings cut at initial load; Off clears occluders', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const initial = await page.evaluate(() => ({
    seeMode: window.__cities.seeMode,
    focusIds: [...window.__cities.view.focusIds],
    occ: [...window.__cities.view.occ],
    selectedChipOn: document.querySelector('.chip[data-see="selected"]').classList.contains('on'),
  }));
  expect(initial.seeMode).toBe('selected');
  expect(initial.focusIds).toEqual([]);
  expect(initial.occ).toEqual([]);
  expect(initial.selectedChipOn).toBe(true);

  // Select a midrise occluded by taller neighbours
  const afterSelect = await page.evaluate(() => {
    const a = window.__cities;
    const office = a.city.buildings.find((b) => b.mineRole === 'company') ?? a.city.buildings[10];
    a.select(office.id);
    a.view.dirty = true;
    a.view.frame(0);
    return {
      focusIds: [...a.view.focusIds],
      occLen: a.view.occ.length,
    };
  });
  expect(afterSelect.focusIds.length).toBe(1);

  // Switch to Off and advance frame: occluders clear
  const afterOff = await page.evaluate(() => {
    const a = window.__cities;
    a.setSee('off');
    a.view.dirty = true;
    a.view.frame(1.0);
    return {
      focusIds: [...a.view.focusIds],
      occ: [...a.view.occ],
    };
  });
  expect(afterOff.focusIds).toEqual([]);
  expect(afterOff.occ).toEqual([]);
});

test('Find my buildings is clickable with Market legend open at 1440x900, 390x844 and 844x390 with no horizontal overflow', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  await page.evaluate(() => window.__cities.setLens('market'));

  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      window.__cities.select(null);
      const dock = document.getElementById('right-dock');
      dock.dataset.tab = 'map';
      dock.classList.remove('sheet-collapsed');
    });
    const findBtn = page.locator('#find');
    await findBtn.scrollIntoViewIfNeeded();
    await findBtn.click();

    const metrics = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      infoOpen: document.getElementById('info').style.display === 'block',
      dockHeight: document.getElementById('right-dock').getBoundingClientRect().height,
      vh: window.innerHeight,
    }));
    expect(metrics.scrollW).toBeLessThanOrEqual(metrics.clientW);
    expect(metrics.infoOpen).toBe(true);
    if (width <= 900 || height <= 520) {
      expect(metrics.dockHeight).toBeLessThanOrEqual(metrics.vh * 0.46 + 2);
    }
  }
});

test('pointer drag pans without selecting, Escape closes topmost panel, and action buttons meet 44x44 CSS px hit areas', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  await page.evaluate(() => window.__cities.select(null));

  const beforeTarget = await page.evaluate(() => [window.__cities.view.target.x, window.__cities.view.target.z]);
  await page.mouse.move(600, 450);
  await page.mouse.down();
  await page.mouse.move(680, 510, { steps: 5 });
  await page.mouse.up();

  const afterDrag = await page.evaluate(() => ({
    target: [window.__cities.view.target.x, window.__cities.view.target.z],
    infoOpen: document.getElementById('info').style.display === 'block',
  }));
  expect(afterDrag.infoOpen).toBe(false);
  expect(Math.hypot(afterDrag.target[0] - beforeTarget[0], afterDrag.target[1] - beforeTarget[1])).toBeGreaterThan(1);

  // Select a building, verify Escape closes info card
  await page.evaluate(() => window.__cities.select(1));
  await expect(page.locator('#info')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#info')).toBeHidden();

  // Check 44px height on primary controls
  const sizes = await page.evaluate(() => {
    return ['#try-live', '#find', '#play', '#rotl', '#rotr', '#lbls', '#home'].map((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { sel, w: Math.round(r.width), h: Math.round(r.height) };
    });
  });
  for (const s of sizes) {
    expect(s.w, `${s.sel} width < 44`).toBeGreaterThanOrEqual(44);
    expect(s.h, `${s.sel} height < 44`).toBeGreaterThanOrEqual(44);
  }
});
