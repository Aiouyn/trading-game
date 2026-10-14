import { test, expect } from '@playwright/test';
import { ready } from '../../tools/browser-ready.mjs';
test('Avalon produces a loaded canvas without page errors', async ({ page, baseURL }) => {
  const errors = await ready(page, `${baseURL}/?city=avalon&t=15`);
  const data = await page.evaluate(() => ({
    city: window.__cities.city.P.id,
    buildings: window.__cities.city.buildings.length,
    width: document.querySelector('#view').width,
  }));
  expect(data.city).toBe('avalon');
  expect(data.buildings).toBeGreaterThan(0);
  expect(data.width).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
