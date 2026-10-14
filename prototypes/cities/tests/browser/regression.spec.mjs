import { test, expect } from '@playwright/test';
import { ready } from '../../tools/browser-ready.mjs';
import { CITY_ORDER } from '../../src/personalities.js';
import { LENS_IDS } from '../../src/lenses.js';

test('all six scenes x all eight lenses smoke cleanly without page or WebGL errors', async ({ page, baseURL }) => {
  const errors = await ready(page, `${baseURL}/?city=avalon&t=15`);
  const summary = await page.evaluate(async ({ cities, lenses }) => {
    const a = window.__cities;
    const out = [];
    for (const cid of cities) {
      await a.open(cid);
      for (const lid of lenses) {
        a.setLens(lid);
        a.view.dirty = true;
        a.view.frame(0);
      }
      a.setLens('normal');
      out.push({ id: a.city.P.id, buildings: a.city.buildings.length });
    }
    return out;
  }, { cities: CITY_ORDER, lenses: LENS_IDS });

  expect(summary.length).toBe(6);
  for (const s of summary) {
    expect(s.buildings).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('controls: time of day, generation preview, battery saver, legal pan corners, max zoom and rotation keep scene valid', async ({ page, baseURL }) => {
  const errors = await ready(page, `${baseURL}/?city=avalon&t=15`);
  const state = await page.evaluate(() => {
    const a = window.__cities, v = a.view;
    a.setTime(7);
    a.setTime(22.5);
    a.setGrowth(500);
    a.setGrowth(1000);
    a.setSaver(true);
    a.setSaver(false);
    v.rotate(1);
    v.frame(0.5);
    // Pan far past limits and verify clampTarget keeps target within 0.4 * S
    v.pan(99999, 99999);
    const lim = v.targetLimit();
    const clamped1 = Math.abs(v.target.x) <= lim + 1e-6 && Math.abs(v.target.z) <= lim + 1e-6;
    v.zoomAt(100, v.w / 2, v.h / 2);
    const scaleOk = v.scale <= v.maxScale() + 1e-6;
    v.dirty = true;
    v.frame(0);
    return { clamped1, scaleOk, renders: v.renders };
  });
  expect(state.clamped1).toBe(true);
  expect(state.scaleOk).toBe(true);
  expect(state.renders).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('idle view with animation disabled performs zero additional scene renders', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  const idleRenders = await page.evaluate(async () => {
    const v = window.__cities.view;
    v.motion = false;
    v.fly = null;
    v.yaw = v.yawTarget;
    v.cutP = v.cutTo;
    v.dirty = false;
    const before = v.renders;
    for (let i = 0; i < 20; i++) {
      v.frame(0.016);
    }
    return v.renders - before;
  });
  expect(idleRenders).toBe(0);
});
