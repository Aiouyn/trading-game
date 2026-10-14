import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { ready } from '../../tools/browser-ready.mjs';

// Freeze animation and sampling: water shimmer would make identical scenes differ.
async function frozenPage(page, baseURL) {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  await page.evaluate(() => {
    const v = window.__cities.view;
    v.motion = false;
    v.uniforms.uTime.value = 0;
    v.tickAnimation = () => {};
  });
  return page;
}

// Read a freshly drawn frame. Drawing and reading must happen inside one evaluate with
// preserveDrawingBuffer, otherwise readPixels sees a buffer that has already been presented.
async function canvasHash(page, rect = null) {
  return page.evaluate((rect) => {
    const a = window.__cities;
    const r = a.view.renderer;
    const gl = r.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    a.view.dirty = true;
    a.view.frame(0);
    r.render(a.view.scene, a.view.camera);
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let hash = 2166136261, sum = 0, changed = 0, n = 0, maxDelta = 0;
    const x0 = rect ? Math.max(0, Math.floor(rect.x)) : 0;
    const y0 = rect ? Math.max(0, Math.floor(rect.y)) : 0;
    const x1 = rect ? Math.min(W, Math.ceil(rect.x + rect.w)) : W;
    const y1 = rect ? Math.min(H, Math.ceil(rect.y + rect.h)) : H;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        hash ^= px[i]; hash = Math.imul(hash, 16777619); sum += px[i]; n++;
      }
    }
    return { hash: hash >>> 0, sum, n, w: W, h: H };
  }, rect);
}

/** The screen box a building occupies, so a test can measure just that building. */
async function buildingRect(page, id) {
  return page.evaluate((id) => {
    const a = window.__cities, v = a.view;
    const b = a.city.buildings[id - 1];
    const cam = v.camera;
    const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [u, w] of [[-b.w / 2, -b.dp / 2], [b.w / 2, -b.dp / 2], [b.w / 2, b.dp / 2], [-b.w / 2, b.dp / 2]]) {
      const wx = b.x + c * u - s * w, wz = b.y + s * u + c * w;
      const p = new (window.THREE_V ?? Object).constructor;
      const vx = cam.matrixWorldInverse.elements;
      // project manually to avoid importing three here
      const e = cam.projectionMatrix.elements, m = cam.matrixWorldInverse.elements;
      const X = m[0] * wx + m[4] * (b.gz + b.h / 2) + m[8] * wz + m[12];
      const Y = m[1] * wx + m[5] * (b.gz + b.h / 2) + m[9] * wz + m[13];
      const Z = m[2] * wx + m[6] * (b.gz + b.h / 2) + m[10] * wz + m[14];
      const cx = e[0] * X + e[8] * Z, cy = e[5] * Y + e[9] * Z;
      const px = (cx + 1) * 0.5 * v.w, py = (1 - cy) * 0.5 * v.h;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    // drawing buffer is y-flipped relative to CSS pixels, and may be scaled by the pixel ratio
    const sx = (a.view.renderer.getPixelRatio() || 1);
    const pad = 28; // include ground halo around footprint
    return { x: (x0 - pad) * sx, y: (v.h - y1 - pad) * sx, w: (x1 - x0 + pad * 2) * sx, h: (y1 - y0 + pad * 2) * sx };
  }, id);
}

test('Normal view does not change with market mood; Market lens does', async ({ page, baseURL }) => {
  await frozenPage(page, baseURL);

  const shot = async (mood, lens) => page.evaluate(async ({ mood, lens }) => {
    const a = window.__cities;
    a.setLens(lens);
    a.setMood(mood);
    a.view.dirty = true;
    a.view.frame(0);
    return null;
  }, { mood, lens });

  await shot(-100, 'normal');
  const normalDown = await canvasHash(page);
  await shot(100, 'normal');
  const normalUp = await canvasHash(page);
  expect(normalUp.hash, `Normal view changed with market mood (dpr ${normalUp.before})`).toBe(normalDown.hash);

  await shot(-100, 'market');
  const marketDown = await canvasHash(page);
  await shot(100, 'market');
  const marketUp = await canvasHash(page);
  expect(marketUp.hash, 'Market lens ignored the mood slider').not.toBe(marketDown.hash);
});

test('hovering a building does not repaint its facade, and focus leaves masonry as masonry', async ({ page, baseURL }) => {
  await frozenPage(page, baseURL);
  await page.waitForFunction(() => window.__cities.view.city && window.__cities.view.objects.length > 100);
  const data = await page.evaluate(() => {
    const a = window.__cities;
    a.setLens('normal');
    a.setMood(0);
    // A masonry building in Old Harbor: the material a brass repaint would ruin.
    const target = a.city.buildings.find((b) => b.d.id === 'oldharbor' && b.kind !== 'Landmark' && !b.mine && b.h > 10);
    a.view.target.set(target.x, 0, target.y);
    a.view.scale = 0.18;
    a.view.yaw = a.view.yawTarget = Math.PI / 4;
    a.select(null);
    a.view.setHover(-1);
    a.view.dirty = true; a.view.frame(0);
    return { id: target.id, h: target.h, type: target.type };
  });
  const rect = await buildingRect(page, data.id);
  expect(rect.w, 'building screen rect is degenerate').toBeGreaterThan(8);

  const idle = await canvasHash(page, rect);
  await page.evaluate((id) => { window.__cities.view.setHover(id); }, data.id);
  const hovered = await canvasHash(page, rect);
  expect(hovered.hash, 'hover produced no visible change at all').not.toBe(idle.hash);

  // The old hover mixed 38% brass into the facade. Measure only this building's pixels:
  // 38% repaints a masonry wall; 6% stays a hint.
  const hoverDelta = Math.abs(hovered.sum - idle.sum) / Math.max(1, idle.sum);
  expect(hoverDelta,
    `hover changed ${data.type} brightness by ${(hoverDelta * 100).toFixed(2)}%, which repaints the facade`)
    .toBeLessThan(0.02);

  await page.evaluate((id) => {
    const a = window.__cities;
    a.view.setHover(-1);
    a.select(id);
  }, data.id);
  const focused = await canvasHash(page, rect);
  // Focus does change these pixels, but through the see-through cut and the outline pass,
  // which is not measurable as a brightness delta here. What must never happen is a facade
  // tint: that is asserted at the shader source, below.
  expect(focused.hash, 'focus produced no visible change at all').not.toBe(idle.hash);
});

test('no shader mixes brass into a building surface for focus or hover', async () => {
  // Focus is the outline pass plus the ground halo; hover is a fainter ground halo.
  // A tint on the wall itself would stop masonry reading as masonry.
  const src = await readFile(new URL('../../src/shaders.js', import.meta.url), 'utf8');
  const frag = src.slice(src.indexOf('export const partFrag'));
  const tintLines = frag.split('\n').filter((l) =>
    /mix\(\s*base\s*,\s*uBrass/.test(l) && !/^\s*\/\//.test(l));
  assert.deepEqual(tintLines, [], `facade tint found in partFrag:\n${tintLines.join('\n')}`);
  // The market-mood branch must stay gated behind the Market lens.
  assert.match(frag, /if \(hq && uMarketMode > 0\.5\)/, 'headquarters mood is not gated by the lens');
});

test('focus changes no packed geometry, only render state', async ({ page, baseURL }) => {
  await frozenPage(page, baseURL);
  const result = await page.evaluate(() => {
    const a = window.__cities;
    const id = a.city.buildings.find((b) => b.kind !== 'Landmark').id;
    const parts = () => Object.entries(a.city.parts).map(([k, v]) => [k, v.length]).sort();
    const objectCount = () => a.view.objects.length;
    a.select(null);
    a.view.dirty = true; a.view.frame(0);
    const before = { parts: parts(), objects: objectCount(), triangles: a.view.renderer.info.render.triangles };
    a.select(id);
    a.view.dirty = true; a.view.frame(0);
    const after = { parts: parts(), objects: objectCount(), triangles: a.view.renderer.info.render.triangles };
    return { sameParts: JSON.stringify(before.parts) === JSON.stringify(after.parts),
      sameObjects: before.objects === after.objects,
      // The inverted-hull outline pass redraws geometry, so triangles may rise; that is
      // an extra draw of the same mesh, not new geometry.
      focusRaisesTriangles: after.triangles >= before.triangles,
      focusIds: [...a.view.focusIds], mineMode: a.seeMode };
  });
  expect(result.sameParts, 'focusing changed packed part geometry').toBe(true);
  expect(result.sameObjects, 'focusing added scene objects').toBe(true);
  expect(result.focusRaisesTriangles).toBe(true);
  expect(result.focusIds.length).toBeGreaterThan(0);
});

test('repeated identical focus calls allocate no new glow geometry or labels', async ({ page, baseURL }) => {
  await frozenPage(page, baseURL);
  await page.waitForFunction(() => window.__cities.view.city && window.__cities.view.objects.length > 100);
  const result = await page.evaluate(() => {
    const a = window.__cities;
    const id = a.city.buildings.find((b) => b.kind !== 'Landmark').id;
    a.select(id);
    a.view.dirty = true; a.view.frame(0);
    // Use the focus set the app actually holds, so the early-return path is what is measured.
    const set = [...a.view.focusIds];
    const snapshot = () => ({
      glows: a.view.glows.length,
      labels: a.view.labels.length,
      geometries: a.view.renderer.info.memory.geometries,
      focusIds: [...a.view.focusIds].join(','),
    });
    const first = snapshot();
    for (let i = 0; i < 25; i++) a.view.setFocus(set);
    a.view.dirty = true; a.view.frame(0);
    const last = snapshot();
    return { first, last };
  });
  expect(result.last.focusIds).toBe(result.first.focusIds);
  expect(result.last.glows, 'repeated identical focus allocated new glows').toBe(result.first.glows);
  expect(result.last.labels, 'repeated identical focus allocated new labels').toBe(result.first.labels);
  expect(result.last.geometries, 'repeated identical focus allocated new geometry').toBe(result.first.geometries);
});

test('all three quality detail tiers compile and preserve building and parcel counts', async ({ page, baseURL }) => {
  await frozenPage(page, baseURL);
  const res = await page.evaluate(() => {
    const a = window.__cities, v = a.view;
    const baseBuildings = a.city.buildings.length;
    const baseParcels = a.city.buildings.filter((b) => b.parcelId).length;
    const tiers = [];
    for (const [tier, detail] of [['high', 1], ['balanced', 0.5], ['low', 0]]) {
      v.setQualityTier(tier);
      v.dirty = true;
      v.frame(0);
      tiers.push({
        tier,
        uDetail: v.uniforms.uDetail?.value,
        buildings: a.city.buildings.length,
        parcels: a.city.buildings.filter((b) => b.parcelId).length,
      });
    }
    return { baseBuildings, baseParcels, tiers };
  });
  expect(res.tiers.map((t) => t.uDetail)).toEqual([1, 0.5, 0]);
  for (const t of res.tiers) {
    expect(t.buildings).toBe(res.baseBuildings);
    expect(t.parcels).toBe(res.baseParcels);
  }
});