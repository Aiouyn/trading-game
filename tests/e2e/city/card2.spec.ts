import { test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { deltaE, mixOklab, srgbToOklab, type Rgb } from '../../../src/city/art/color';
import { TOKEN_VARS, type Tokens } from '../../../src/city/art/tokens';
import { at, covered, coverage, decode, field, groundMap, interior, kerbEdges, lum, median, popcount, type Cover, type Field, type Img, type RGB } from './pixels';
import { diag, EVIDENCE, expect, installT0Probe, isPhone, t0LongTasks, waitDrawn, waitState, type HarnessWindow } from './helpers';

/**
 * Card 2 (spec /workspace/specs/city-card-2-materials.md §5, §6): materials and game-clock daylight.
 * The before tree is card 1 (PR #60 @ 96b9771e, §5): CI builds its harness and serves it at
 * CITY_CARD2_BEFORE_URL; this tree is served at the config baseURL. Without the before URL, the A/B
 * test skips and the clock, a11y and T0 tests still run.
 */
const BEFORE_URL = process.env.CITY_CARD2_BEFORE_URL;
const DIR = join(EVIDENCE, 'card2');
mkdirSync(DIR, { recursive: true });
const FIXTURE = join(__dirname, 'fixtures/card1-before');
const CLOCK = new Date('2026-10-20T19:00:00Z'); // the wall clock, pinned as in card 1 (not the game clock)
const HIDE = 'body * { visibility: hidden !important; } canvas, .city-stage img { visibility: visible !important; }';
/** Material ids (src/city/art/materials.ts DISTRICT_MATERIALS order + 1) of the four canon districts (AC 5). */
const CANON = { old_harbor: 1, midtown: 3, summit_estates_on_gilt_hill: 6, industrial_basin: 7 } as const;

type Pose = { name: string; target?: [number, number]; zoom: number };
const vpOf = (page: Page) => (isPhone(page) ? '390x844' : '1440x900');
const tierOf = (page: Page) => (isPhone(page) ? 'T1' : 'T2');
/** Card 1's poses; P4 is the junction card 1 picked on main (fixtures/card1-before). */
function poses(vp: string): Pose[] {
  const p4 = JSON.parse(readFileSync(join(FIXTURE, `card1-${vp}-before.json`), 'utf8')).P4target as [number, number];
  return [
    { name: 'P1', zoom: 1 },
    { name: 'P2', target: [-90, 230], zoom: 4 },
    { name: 'P3', target: [215, 200], zoom: 2 },
    { name: 'P4', target: p4, zoom: 4 },
    { name: 'V', target: [-300, 488], zoom: 2 },
  ];
}
const ZOOMS: Pose[] = [{ name: 'z0.25', zoom: 0.25 }, { name: 'z4', zoom: 4 }];

const W = (page: Page) => page.evaluate.bind(page);
async function open(page: Page, query: string, origin = '') {
  await page.clock.setFixedTime(CLOCK);
  await page.goto(`${origin}/city.html?${query}`);
  await waitState(page, 'card2 open: harness not ready', () => document.body.dataset.ready === '1');
  await waitDrawn(page);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: HIDE });
}
async function setPose(page: Page, p: Pose) {
  await page.evaluate((c) => (window as unknown as HarnessWindow).__city.setCamera(c), { target: p.target ?? [0, 0], zoom: p.zoom, rotation: 0 as const });
  await page.waitForTimeout(400);
}
const hhmm = (c: string) => c.replace(':', '');
const file = (pose: string, vp: string, tier: string, clock: string, kind: string, mode = '') => join(DIR, `card2-${pose}-${vp}-${tier}-${hhmm(clock)}${mode ? `-${mode}` : ''}-${kind}.png`);
async function shoot(page: Page, path: string, t0 = false): Promise<Img> {
  return decode(await page.locator(t0 ? '.city-stage img' : 'canvas').first().screenshot({ scale: 'css', path, animations: 'disabled' }));
}
const budget = async (page: Page) => { const d = await diag(page); return { calls: d.drawCalls, tris: d.triangles }; };
const report = (name: string, data: unknown) => {
  writeFileSync(join(DIR, `card2-${name}.json`), JSON.stringify(data, null, 2));
  console.log(`[card2] ${name}: ${JSON.stringify(data)}`);
};
/** Bits that differ between two coverages (AC 3); a size mismatch counts every bit. */
function coverDiff(a: Cover, b: Cover): number {
  if (a.w !== b.w || a.h !== b.h) return a.w * a.h;
  let n = 0;
  for (let i = 0; i < a.bits.length; i++) n += popcount(a.bits[i] ^ b.bits[i]);
  return n;
}
const set = (cv: Cover) => { let n = 0; for (const b of cv.bits) n += popcount(b); return n; };
const changed = (a: RGB, b: RGB) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) > 3;
const rgb = (c: RGB): Rgb => [c[0] / 255, c[1] / 255, c[2] / 255];
function hslSat([r, g, b]: RGB): number {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
}
/** Interior pixels of a coverage (all 8 neighbours covered: no edge antialiasing). */
function pixelsIn(im: Img, cv: Cover, skip?: Cover): RGB[] {
  const out: RGB[] = [];
  for (let y = 1; y < im.h - 1; y++) for (let x = 1; x < im.w - 1; x++) if (interior(cv, im, x, y) && !(skip && covered(skip, im, x, y, 1))) out.push(at(im, x, y));
  return out;
}
const oklch = (c: RGB) => { const [L, a, b] = srgbToOklab(rgb(c)); return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }; };
const meanL = (px: RGB[]) => px.reduce((s, c) => s + srgbToOklab(rgb(c))[0], 0) / Math.max(1, px.length);

/** Ink & Brass tokens from src/styles/tokens.css (the harness palette) and the lit-window colour (ramps.litWindow). */
function litWindow(): Rgb {
  const css = readFileSync(join(__dirname, '../../../src/styles/tokens.css'), 'utf8');
  const v = (name: string): Rgb => {
    const m = css.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'))!;
    return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as Rgb;
  };
  const t = Object.fromEntries(Object.entries(TOKEN_VARS).map(([k, n]) => [k, v(n)])) as Tokens;
  return mixOklab(t.fg, t.accHi, 0.2);
}
const LIT = litWindow();
const litCount = (px: RGB[]) => px.filter((c) => deltaE(rgb(c), LIT) <= 3).length;

/** AC 4 classes of a ground pixel: water (and quay shadow), park (±1 cell), the verge band, or held ground. */
function groundClass(F: Field, gx: number, gz: number): 'water' | 'park' | 'verge' | 'held' {
  const s = F.s(gx, gz);
  if (s < 0) return 'water';
  if (F.nearPark(gx, gz)) return 'park';
  if (s <= 4 && F.district(gx, gz) <= 1.5 && F.r(gx, gz) > 15) return 'verge';
  return 'held';
}
/** groundClass at an image pixel, with a pixel tolerance: a boat hull reaches up to 2 px over the quay
 *  edge, and the park tint is filtered 1 px past its cell (both measured in CI run 40602934708). */
function pixelClass(F: Field, gm: Awaited<ReturnType<typeof groundMap>>, x: number, y: number): 'water' | 'park' | 'verge' | 'held' {
  const k = groundClass(F, ...gm.toGround(x + 0.5, y + 0.5));
  if (k !== 'held') return k;
  const near = (r: number, want: 'water' | 'park' | 'verge') => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (groundClass(F, ...gm.toGround(x + dx + 0.5, y + dy + 0.5)) === want) return true;
    return false;
  };
  // verge gets park's 1 px AA fringe: run 40605465589 V held 24 px, a 1 px line along the verge strip's outer edge
  return near(2, 'water') ? 'water' : near(1, 'park') ? 'park' : near(1, 'verge') ? 'verge' : 'held';
}

/** Pixels changed by > 3/255 in the whole frame; water is counted apart (boats sail between page loads, [P]). */
const frameDiff = (F: Field, a: Img, b: Img, gm: Awaited<ReturnType<typeof groundMap>>) => {
  let px = 0, water = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (!changed(at(a, x, y), at(b, x, y))) continue;
    if (F.s(...gm.toGround(x + 0.5, y + 0.5)) < 0) water++; else px++;
  }
  return { px, water };
};

test.describe.configure({ mode: 'serial' });

// ---------- AC 1–4, 12: this tree vs card 1 at 19:00 ----------
test('card 2 A/B vs card 1 @ 19:00 — AC1 budget, AC2 data, AC3 coverage, AC4 ground', async ({ page }) => {
  test.skip(!BEFORE_URL, 'CITY_CARD2_BEFORE_URL unset (CI serves the card-1 tree)');
  test.setTimeout(175_000);
  const vp = vpOf(page), tier = tierOf(page), phone = isPhone(page);
  if (!phone) await page.setViewportSize({ width: 1440, height: 900 });
  const P = [...poses(vp), ...ZOOMS];
  const F = await field();
  const capture = async (origin: string, kind: 'before' | 'after') => {
    await open(page, `tier=${tier}&reduced=1${kind === 'after' ? '&clock=19:00' : ''}`, origin);
    const r: Record<string, { im: Img; cv: Cover; gm: Awaited<ReturnType<typeof groundMap>>; b: { calls: number; tris: number } }> = {};
    for (const p of P) {
      await setPose(page, p);
      const im = await shoot(page, file(p.name, vp, tier, '19:00', kind));
      r[p.name] = { im, cv: await coverage(page), gm: await groundMap(page), b: await budget(page) };
    }
    const data = await W(page)(async () => {
      const w = window as unknown as HarnessWindow;
      const hex = async (u: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(u)).arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const chunks: Record<string, string> = {};
      for (const u of [...new Set(w.harness.fetchLog)].filter((u) => !u.includes('manifest')).sort()) chunks[u.replace(/^https?:\/\/[^/]+/, '')] = await hex(u);
      const c = w.__city;
      return { parts: c.diagnostics().buildingParts, chunks, anchors: Object.fromEntries(c.pickableIds().map((id) => [id, c.anchorOf(id)])) };
    });
    return { r, data };
  };
  const before = await capture(BEFORE_URL!, 'before');
  const after = await capture('', 'after');

  const ac: Record<string, unknown> = {};
  // AC 1: exactly card 1's calls and triangles at every pose and zoom
  ac.AC1 = Object.fromEntries(P.map((p) => [p.name, { before: before.r[p.name].b, after: after.r[p.name].b }]));
  for (const p of P) expect.soft(after.r[p.name].b, `AC1 ${p.name}: calls/tris = card 1`).toEqual(before.r[p.name].b);
  // AC 2: parts, chunk bytes, anchors
  ac.AC2 = { parts: after.data.parts, chunks: Object.keys(after.data.chunks).length, anchors: Object.keys(after.data.anchors).length };
  expect.soft(after.data.parts, 'AC2 buildingParts').toBe(before.data.parts);
  expect.soft(after.data.chunks, 'AC2 chunk bytes').toEqual(before.data.chunks);
  expect.soft(after.data.anchors, 'AC2 anchors').toEqual(before.data.anchors);
  // AC 3: coverage('parts') bits identical; AC 4: ground pixels change only on park / verge / water
  const ac3: Record<string, unknown> = {}, ac4: Record<string, unknown> = {};
  for (const p of P) {
    const A = after.r[p.name], B = before.r[p.name];
    const bitsDiff = coverDiff(A.cv, B.cv);
    ac3[p.name] = { coveredBits: set(A.cv), bitsDiff };
    expect.soft(bitsDiff, `AC3 ${p.name}: coverage('parts') bits differ from card 1`).toBe(0);
    const n = { held: 0, park: 0, verge: 0, water: 0, onParts: 0 };
    const o = Buffer.alloc(A.im.w * A.im.h * 4);
    for (let y = 0; y < A.im.h; y++) for (let x = 0; x < A.im.w; x++) {
      const i = (y * A.im.w + x) * 4, a = at(A.im, x, y), g = lum(a) * 0.3;
      o[i] = o[i + 1] = o[i + 2] = g; o[i + 3] = 255;
      if (!changed(a, at(B.im, x, y))) continue;
      if (covered(A.cv, A.im, x, y, 1) || covered(B.cv, A.im, x, y, 1)) { n.onParts++; o[i + 2] = 255; continue; }
      const k = pixelClass(F, A.gm, x, y);
      n[k]++;
      if (k === 'held') { o[i] = 255; o[i + 1] = o[i + 2] = 0; } else o[i + 1] = 255;
    }
    await sharp(o, { raw: { width: A.im.w, height: A.im.h, channels: 4 } }).png().toFile(file(p.name, vp, tier, '19:00', 'diff'));
    ac4[p.name] = n;
    expect.soft(n.held, `AC4 ${p.name}: held ground pixels changed (red in the diff)`).toBe(0);
  }
  ac.AC3 = ac3; ac.AC4 = ac4;
  report(`ab-${vp}`, ac);
});

// ---------- AC 1, 3, 5, 7, 8, 11, 12: every pose × clock on this tree ----------
// one test per clock (serial, one worker); 19:00 runs first: it is the reference the other clocks are held to
const ref: Record<string, { cv: Cover; b: { calls: number; tris: number } }> = {};
const rows: Record<string, unknown> = {};
const L: Record<string, number> = {}, lit: Record<string, number> = {};
for (const clock of ['19:00', '08:00', '13:00', '23:00'] as const) test(`card 2 clock ${clock} — AC1/AC3 vs 19:00, AC5 materials, AC7 brass, AC11 T1`, async ({ page }) => {
    test.setTimeout(178_000);
    const vp = vpOf(page), tier = tierOf(page), phone = isPhone(page);
    if (!phone) await page.setViewportSize({ width: 1440, height: 900 });
    const P = poses(vp);
    test.skip(clock !== '19:00' && !ref[`${vp} P1`], 'the 19:00 reference did not run');
    await open(page, `tier=${tier}&reduced=1&clock=${clock}`);
    const brass = await W(page)(() => (window as unknown as HarnessWindow).__city.brassCheck(3));
    expect.soft(brass?.outside, `AC7 ${clock}: brass pixels outside the mask`).toBe(0);
    rows[`${vp} ${clock} brass`] = brass;
    for (const p of P) {
      await setPose(page, p);
      const im = await shoot(page, file(p.name, vp, tier, clock, 'after'));
      const cv = await coverage(page), b = await budget(page);
      if (clock === '19:00') ref[`${vp} ${p.name}`] = { cv, b };
      const bitsDiff = coverDiff(cv, ref[`${vp} ${p.name}`].cv);
      expect.soft(b, `AC1 ${p.name} ${clock}: calls/tris = 19:00`).toEqual(ref[`${vp} ${p.name}`].b);
      expect.soft(bitsDiff, `AC3 ${p.name} ${clock}: coverage bits = 19:00`).toBe(0);
      const row: Record<string, unknown> = { ...b, bitsDiff };
      if (p.name === 'P1' || p.name === 'P2') {
        const bm = await coverage(page, 'brass');
        const px = pixelsIn(im, cv, bm);
        row.partPx = px.length;
        row.meanL = +meanL(px).toFixed(4);
        row.litPx = litCount(px);
        row.maxSat = +px.reduce((m, c) => Math.max(m, hslSat(c)), 0).toFixed(3); // no spread: phone DPR3 overflows the stack
        if (p.name === 'P1') { L[`${vp} ${clock}`] = row.meanL as number; lit[`${vp} ${clock}`] = row.litPx as number; }
        if (clock === '13:00') {
          // AC 5: no part pixel outside brass above 45 % HSL saturation (no lit windows at 13:00)
          expect.soft(row.maxSat as number, `AC5 ${p.name}: max HSL saturation of part pixels`).toBeLessThanOrEqual(0.45);
          const med: Record<string, RGB> = {};
          for (const [name, id] of Object.entries(CANON)) {
            const mp = pixelsIn(im, await coverage(page, 'material', id), bm);
            if (mp.length) med[name] = median(mp);
            row[`${name}Px`] = mp.length;
          }
          row.medians = Object.fromEntries(Object.entries(med).map(([k, c]) => [k, { rgb: c, ...oklch(c) }]));
          if (p.name === 'P2') {
            const oh = med.old_harbor;
            expect.soft(!!oh, 'AC5 P2: Old Harbor parts in view').toBe(true);
            if (oh) {
              const { C, h } = oklch(oh);
              expect.soft(h, 'AC5 P2: Old Harbor median wall hue (°)').toBeGreaterThanOrEqual(25);
              expect.soft(h, 'AC5 P2: Old Harbor median wall hue (°)').toBeLessThanOrEqual(60);
              expect.soft(C, 'AC5 P2: Old Harbor median wall chroma').toBeGreaterThanOrEqual(0.035);
            }
          } else {
            const names = Object.keys(CANON);
            const pairs: Record<string, { dE: number; dL: number }> = {};
            for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
              const a = med[names[i]], c = med[names[j]];
              if (!a || !c) { expect.soft(false, `AC5 P1: ${names[i]} / ${names[j]} parts in view`).toBe(true); continue; }
              const dE = deltaE(rgb(a), rgb(c)), dL = Math.abs(srgbToOklab(rgb(a))[0] - srgbToOklab(rgb(c))[0]);
              pairs[`${names[i]}~${names[j]}`] = { dE: +dE.toFixed(2), dL: +dL.toFixed(4) };
              expect.soft(dE >= 4 || dL >= 0.04, `AC5 P1 ${names[i]} vs ${names[j]}: ΔE ${dE.toFixed(2)}, ΔL ${dL.toFixed(3)}`).toBe(true);
            }
            row.pairs = pairs;
          }
        }
      }
      rows[`${vp} ${clock} ${p.name}`] = row;
    }
    report(`clocks-${vp}-${hhmm(clock)}`, Object.fromEntries(Object.entries(rows).filter(([k]) => k.startsWith(`${vp} ${clock}`))));
});

test('card 2 daylight — AC8 (from the clock tests)', async ({ page }) => {
  const vp = vpOf(page);
  const l = (c: string) => L[`${vp} ${c}`], w = (c: string) => lit[`${vp} ${c}`];
  test.skip(['08:00', '13:00', '19:00', '23:00'].some((c) => l(c) === undefined), 'the clock tests did not all run');
  // AC 8: P1 mean part L rises 23:00 → 08:00 → 13:00; lit windows 0 at 13:00, 19:00 > 23:00 > 0
  const ac8 = { meanL: Object.fromEntries(['23:00', '08:00', '13:00', '19:00'].map((c) => [c, l(c)])), litPx: Object.fromEntries(['13:00', '19:00', '23:00'].map((c) => [c, w(c)])) };
  expect.soft(l('08:00'), 'AC8 mean part L 08:00 > 23:00').toBeGreaterThan(l('23:00'));
  expect.soft(l('13:00'), 'AC8 mean part L 13:00 > 08:00').toBeGreaterThan(l('08:00'));
  expect.soft(w('13:00'), 'AC8 lit-window px at 13:00').toBe(0);
  expect.soft(w('23:00'), 'AC8 lit-window px at 23:00').toBeGreaterThan(0);
  expect.soft(w('19:00'), 'AC8 lit-window px 19:00 > 23:00').toBeGreaterThan(w('23:00'));
  report(`daylight-${vp}`, ac8);
});

// ---------- AC 9, 10: motion, colour-blind and high contrast ----------
test('card 2 motion — AC9 reduced-motion hour step and idle renders', async ({ page }) => {
  test.setTimeout(178_000);
  const vp = vpOf(page), tier = tierOf(page), phone = isPhone(page);
  if (!phone) await page.setViewportSize({ width: 1440, height: 900 });
  const P = poses(vp).filter((p) => p.name === 'P2' || p.name === 'P4');
  const F = await field();
  const out: Record<string, unknown> = {};

  // AC 9a: reduced motion floors the minute to the hour: 19:05 and 19:50 give the same frame
  await open(page, `tier=${tier}&reduced=1&clock=19:05`);
  await setPose(page, P[0]);
  const a = await shoot(page, file('P2', vp, tier, '19:05', 'after'));
  await W(page)(() => (window as unknown as HarnessWindow).harness.setTimeOfDay(19 * 60 + 50));
  await page.waitForTimeout(400);
  const b = await shoot(page, file('P2', vp, tier, '19:50', 'after'));
  const sameHour = frameDiff(F, a, b, await groundMap(page));
  await W(page)(() => (window as unknown as HarnessWindow).harness.setTimeOfDay(13 * 60));
  await page.waitForTimeout(400);
  const nextHour = frameDiff(F, a, await shoot(page, file('P2', vp, tier, '13:00', 'after', 'step')), await groundMap(page));
  out.AC9reduced = { sameHour, otherHour: nextHour };
  expect.soft(sameHour.px, 'AC9 reduced: 19:05 vs 19:50 changed px (water apart)').toBe(0);
  expect.soft(nextHour.px, 'AC9 reduced: 19:05 vs 13:00 differ (the check can see light)').toBeGreaterThan(0);

  // AC 9b: without reduced motion, an idle camera renders nothing between clock changes (phone T1: no boats or ambient)
  if (phone) {
    await open(page, `tier=${tier}&clock=19:00`);
    await page.waitForTimeout(2_500);
    const r0 = (await diag(page)).renders;
    await page.waitForTimeout(1_500);
    const r1 = (await diag(page)).renders;
    await W(page)(() => (window as unknown as HarnessWindow).harness.setTimeOfDay(20 * 60));
    await page.waitForTimeout(400);
    const r2 = (await diag(page)).renders;
    out.AC9idle = { r0, r1, afterClock: r2 };
    expect.soft(r1, 'AC9 idle: renders between clock changes').toBe(r0);
    expect.soft(r2, 'AC9 idle: a clock change renders').toBeGreaterThan(r1);
  }

  report(`motion-${vp}`, out);
});

// AC 10: cb changes nothing (whole frame, parts included); hc keeps card 1's kerb contrast rise
for (const clock of ['13:00', '19:00'] as const) test(`card 2 a11y ${clock} — AC10 cb and hc`, async ({ page }) => {
    test.setTimeout(178_000);
    const vp = vpOf(page), tier = tierOf(page), phone = isPhone(page);
    if (!phone) await page.setViewportSize({ width: 1440, height: 900 });
    const P = poses(vp).filter((p) => p.name === 'P2' || p.name === 'P4');
    const F = await field();
    const ac10: Record<string, unknown> = {};
    const shots: Record<string, Record<string, { im: Img; gm: Awaited<ReturnType<typeof groundMap>>; cv: Cover }>> = {};
    for (const mode of ['', 'cb', 'hc']) {
      await open(page, `tier=${tier}&reduced=1&clock=${clock}${mode ? `&${mode}=1` : ''}`);
      shots[mode] = {};
      for (const p of P) {
        await setPose(page, p);
        shots[mode][p.name] = { im: await shoot(page, file(p.name, vp, tier, clock, 'after', mode)), gm: await groundMap(page), cv: await coverage(page) };
      }
    }
    for (const p of P) {
      const n = shots[''][p.name];
      const cb = frameDiff(F, n.im, shots.cb[p.name].im, n.gm);
      const kerb = (s: typeof n) => kerbEdges(s.im, s.gm, s.cv, F).kerbOverRoad;
      const k = { normal: kerb(n), hc: kerb(shots.hc[p.name]) };
      ac10[`${clock} ${p.name}`] = { cb, kerbOverRoad: k };
      expect.soft(cb.px, `AC10 ${clock} ${p.name}: cb changed px (water apart)`).toBe(0);
      if (!phone && p.name === 'P2') expect.soft(k.hc, `AC10 ${clock} P2: hc kerb contrast > 1.3 × normal`).toBeGreaterThan(k.normal * 1.3);
    }
    report(`a11y-${vp}-${hhmm(clock)}`, ac10);
});

// ---------- AC 11: T0 at 13:00 and 23:00, and the hourly redraw's longest task ----------
test('card 2 T0 — AC11 the hour\'s light, district walls, hourly redraw long task', async ({ page }) => {
  test.setTimeout(175_000);
  const vp = vpOf(page), phone = isPhone(page);
  if (!phone) await page.setViewportSize({ width: 1440, height: 900 });
  await installT0Probe(page);
  await open(page, 'tier=T0&reduced=1&clock=13:00');
  await W(page)(() => (window as unknown as HarnessWindow).harness.setVisibility('visible'));
  await page.waitForTimeout(400);
  const day = await shoot(page, file('P1', vp, 'T0', '13:00', 'after'), true);
  const src0 = await page.locator('.city-stage img').first().getAttribute('src');
  const buildMax = Math.max(0, ...(await t0LongTasks(page)).map((t) => t.duration));
  await W(page)(() => { (window as unknown as { __longTasks: unknown[] }).__longTasks = []; });
  await W(page)(() => (window as unknown as HarnessWindow).harness.setTimeOfDay(23 * 60));
  await W(page)((s) => { (window as unknown as { __src0: string | null }).__src0 = s; }, src0);
  await waitState(page, 'T0 hourly redraw: picture not replaced after setTimeOfDay(23:00)', () => (document.querySelector('.city-stage img') as HTMLImageElement | null)?.getAttribute('src') !== (window as unknown as { __src0: string | null }).__src0);
  await page.waitForTimeout(400);
  const redrawMax = Math.max(0, ...(await t0LongTasks(page)).map((t) => t.duration));
  const night = await shoot(page, file('P1', vp, 'T0', '23:00', 'after'), true);
  const all = (im: Img) => { const o: RGB[] = []; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.push(at(im, x, y)); return o; };
  const res = { meanL: { '13:00': +meanL(all(day)).toFixed(4), '23:00': +meanL(all(night)).toFixed(4) }, longestTaskMs: { build: buildMax, hourlyRedraw: redrawMax }, limitMs: +(1.1 * (phone ? 68 : 74)).toFixed(1) };
  report(`t0-${vp}`, res);
  expect.soft(res.meanL['13:00'], 'AC11 T0 mean L 13:00 > 23:00').toBeGreaterThan(res.meanL['23:00']);
  expect.soft(redrawMax, 'AC11 T0 hourly redraw longest task ≤ 1.1 × #54 baseline').toBeLessThanOrEqual(res.limitMs);
});
