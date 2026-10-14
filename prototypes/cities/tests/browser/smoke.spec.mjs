import { test, expect } from '@playwright/test';
import { ready } from '../../tools/browser-ready.mjs';
import { CITY_ORDER } from '../../src/personalities.js';

test('Avalon produces a loaded canvas without page errors and all six cities load', async ({ page, baseURL }) => {
  const errors = await ready(page, `${baseURL}/?city=avalon&t=15`);
  const data = await page.evaluate(() => ({
    city: window.__cities.city.P.id,
    buildings: window.__cities.city.buildings.length,
    width: document.querySelector('#view').width,
  }));
  expect(data.city).toBe('avalon');
  expect(data.buildings).toBeGreaterThan(0);
  expect(data.width).toBeGreaterThan(0);
  for (const id of CITY_ORDER) {
    if (id === 'avalon') continue;
    await page.evaluate(async (cityId) => { await window.__cities.open(cityId); }, id);
    const cur = await page.evaluate(() => ({ id: window.__cities.city.P.id, b: window.__cities.city.buildings.length }));
    expect(cur.id).toBe(id);
    expect(cur.b).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});
