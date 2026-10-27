import { test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { generateCity } from './fixtures/generate-city';
import * as gf from '../../../src/city/renderer/groundfield';
import { diag, EVIDENCE, expect, isPhone, openCity, card1Limit, MAIN_BASE, waitDrawn, type HarnessWindow } from './helpers';

/**
 * Card 1 (spec /workspace/specs/city-card-1-ground.md): ground, kerbs, crosswalks, quay and verge.
 * CITY_CARD1_PHASE=before captures the base tree (no card-1 hooks); =after (default) captures this
 * tree and checks the ACs against the before files in CITY_CARD1_DIR.
 */
// 'pose' runs on the card-1 tree first and only picks P4 (the before tree has no projectGround / coverage hooks)
const PHASE = (['before', 'pose'] as const).find((p) => p === process.env.CITY_CARD1_PHASE) ?? 'after';
const DIR = process.env.CITY_CARD1_DIR ?? join(EVIDENCE, 'card1');
mkdirSync(DIR, { recursive: true });
/**
 * Where the after phase reads the before files: CITY_CARD1_BEFORE_DIR, else the committed capture of
 * main (fixtures/card1-before, SHA in its SHA file), else DIR. Captures are always written to DIR.
 */
const FIXTURE = join(__dirname, 'fixtures/card1-before');
const BEFORE = process.env.CITY_CARD1_BEFORE_DIR ?? (existsSync(join(FIXTURE, 'SHA')) ? FIXTURE : DIR);
const beforeFile = (name: string) => join(PHASE === 'after' ? BEFORE : DIR, name);
/** The after phase compares against a capture of main; without one the spec has nothing to compare and skips. */
const needsBefore = (vp: string) => PHASE === 'after' && !existsSync(beforeFile(`card1-${vp}-before.json`));
const CLOCK = new Date('2026-10-20T19:00:00Z'); // pinned; the city default is 19:00 game time

type Pose = { name: string; target?: [number, number]; zoom: number };
const POSES: Pose[] = [
  { name: 'P1', zoom: 1 },
  { name: 'P2', target: [-90, 230], zoom: 4 },
  { name: 'P3', target: [215, 200], zoom: 2 },
  // decision 5: [-51, 35] is hidden behind Financial Mile towers at rotation 0, so P4 is nudged to the
  // nearest crosswalk junction whose four arms are in view (p4Target), away from the crown plaza
  { name: 'P4', target: [-51, 35], zoom: 4 },
  // the P3 coast is all Eastside Docks quay (decision 3); the city's verge is the south shore
  { name: 'V', target: [-300, 488], zoom: 2 },
];
const HIDE = 'body * { visibility: hidden !important; } canvas, .city-stage img { visibility: visible !important; }';

const api = (page: Page) => page.evaluate.bind(page);
async function open(page: Page, query: string) {
  await page.clock.setFixedTime(CLOCK);
  await openCity(page, query);
  await waitDrawn(page);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: HIDE });
}
async function setPose(page: Page, p: Pose, home: [number, number]) {
  await page.evaluate((c) => (window as unknown as HarnessWindow).__city.setCamera(c), { target: p.target ?? home, zoom: p.zoom, rotation: 0 as const });
  await page.waitForTimeout(400);
}
const file = (pose: string, vp: string, tier: string, kind: string) => join(DIR, `card1-${pose}-${vp}-${tier}-${kind}.png`);
async function shoot(page: Page, path: string, t0 = false): Promise<Img> {
  const buf = await page.locator(t0 ? '.city-stage img' : 'canvas').first().screenshot({ scale: 'css', path, animations: 'disabled' });
  return decode(buf);
}

/** What must not change (AC2): part data, chunk bytes and every anchor, at P1 and P4. */
async function partData(page: Page) {
  return page.evaluate(async () => {
    const w = window as unknown as HarnessWindow;
    const hex = async (u: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(u)).arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const urls = [...new Set(w.harness.fetchLog)].filter((u) => !u.includes('manifest')).sort();
    const chunks: Record<string, string> = {};
    for (const u of urls) chunks[u] = await hex(u);
    return { parts: w.__city.diagnostics().buildingParts, chunks };
  });
}
const anchors = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as HarnessWindow).__city;
    return Object.fromEntries(c.pickableIds().map((id) => [id, c.anchorOf(id)]));
  });

// ---------- pixels ----------
interface Img { w: number; h: number; d: Buffer }
async function decode(buf: Buffer): Promise<Img> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: data };
}
type RGB = [number, number, number];
const at = (im: Img, x: number, y: number): RGB => {
  const o = (y * im.w + x) * 4;
  return [im.d[o], im.d[o + 1], im.d[o + 2]];
};
/** Bilinear luminance at CSS px (sx, sy); pixel centres at i + 0.5. */
function lumAt(im: Img, sx: number, sy: number): number {
  const u = sx - 0.5, v = sy - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const L = (x: number, y: number) => lum(at(im, x, y));
  return (L(i, j) * (1 - fu) + L(i + 1, j) * fu) * (1 - fv) + (L(i, j + 1) * (1 - fu) + L(i + 1, j + 1) * fu) * fv;
}
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (cs: RGB[]): RGB => {
  const m = (k: number) => cs.map((c) => c[k]).sort((a, b) => a - b)[cs.length >> 1];
  return [m(0), m(1), m(2)];
};

interface Cover { w: number; h: number; bits: Uint8Array }
async function coverage(page: Page): Promise<Cover> {
  const c = await page.evaluate(() => (window as unknown as HarnessWindow).__city.coverage('parts'));
  if (!c) throw new Error('coverage(parts) returned null');
  return { w: c.w, h: c.h, bits: new Uint8Array(Buffer.from(c.bits, 'base64')) };
}
/** Is the image pixel (or a neighbour) covered by a part? Coverage may be at device resolution. */
function covered(cv: Cover, im: Img, x: number, y: number, pad = 1): boolean {
  const k = cv.w / im.w;
  for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
    const X = Math.floor((x + dx + 0.5) * k), Y = Math.floor((y + dy + 0.5) * k);
    if (X < 0 || Y < 0 || X >= cv.w || Y >= cv.h) return true;
    const b = Y * cv.w + X;
    if (cv.bits[b >> 3] & (1 << (b & 7))) return true; // LSB-first, as partsCoverage packs
  }
  return false;
}

function interior(cv: Cover, im: Img, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!covered(cv, im, x + dx, y + dy, 0)) return false;
  return true;
}

/** Ground (x, z) <-> CSS px. The camera is orthographic, so the map is affine. */
async function groundMap(page: Page) {
  const p = await page.evaluate(() => {
    const c = (window as unknown as HarnessWindow).__city;
    return [c.projectGround(0, 0), c.projectGround(100, 0), c.projectGround(0, 100)];
  });
  if (p.some((q) => !q)) throw new Error('projectGround returned null');
  const [o, a, b] = p as { x: number; y: number }[];
  const U = [(a.x - o.x) / 100, (a.y - o.y) / 100], V = [(b.x - o.x) / 100, (b.y - o.y) / 100];
  const det = U[0] * V[1] - U[1] * V[0];
  return {
    toPx: (x: number, z: number) => [o.x + x * U[0] + z * V[0], o.y + x * U[1] + z * V[1]] as const,
    toGround: (sx: number, sy: number) => {
      const dx = sx - o.x, dy = sy - o.y;
      return [(dx * V[1] - dy * V[0]) / det, (U[0] * dy - U[1] * dx) / det] as const;
    },
    /** metres per CSS px along x */
    mPerPx: 1 / Math.hypot(U[0], U[1]),
  };
}

// ---------- the field, rebuilt in node from the same fixture ----------
type Field = {
  s: (x: number, z: number) => number; r: (x: number, z: number) => number; district: (x: number, z: number) => number; jDist: (x: number, z: number) => number;
  /** junction boxes (connected J cells): centre and size in cells */
  junctions: { x: number; z: number; cells: number; w: number; h: number }[];
  /** park cell (mask 2) within two cells (park and verge), reported separately for AC10 */
  nearPark: (x: number, z: number) => boolean;
};
let fieldP: Promise<Field> | null = null;
function field(): Promise<Field> {
  fieldP ??= (async () => {
    const city = generateCity();
    const mask = city.files.get(city.manifests.get(1)!.ground.url)!;
    const f = gf.buildGroundField({ mask, size: 512, x0: -512, z0: -512, span: 1024 }, city.snapshot.districts);
    const J = new Uint8Array(512 * 512);
    for (let k = 0; k < J.length; k++) J[k] = f.rgba[k * 4 + 3] ? 1 : 0;
    const jsq = gf.squaredDistance(J, 512);
    const cell = (x: number, z: number) => Math.min(511, Math.max(0, Math.floor((x + 512) / 2))) + 512 * Math.min(511, Math.max(0, Math.floor((z + 512) / 2)));
    const bil = (ch: number) => (x: number, z: number) => {
      const u = (x + 512) / 2 - 0.5, v = (z + 512) / 2 - 0.5;
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const t = (a: number, b: number) => gf.decodeDistance(f.rgba[(b * 512 + a) * 4 + ch]);
      return (t(i, j) * (1 - fu) + t(i + 1, j) * fu) * (1 - fv) + (t(i, j + 1) * (1 - fu) + t(i + 1, j + 1) * fu) * fv;
    };
    const junctions: Field['junctions'] = [], seen = new Uint8Array(J.length);
    for (let k0 = 0; k0 < J.length; k0++) {
      if (!J[k0] || seen[k0]) continue;
      const stack = [k0]; seen[k0] = 1;
      let n = 0, sx = 0, sz = 0, i0 = 511, i1 = 0, j0 = 511, j1 = 0;
      while (stack.length) {
        const k = stack.pop()!, i = k % 512, j = (k / 512) | 0;
        n++; sx += i; sz += j; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
        for (const q of [i > 0 ? k - 1 : -1, i < 511 ? k + 1 : -1, j > 0 ? k - 512 : -1, j < 511 ? k + 512 : -1]) if (q >= 0 && J[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
      junctions.push({ x: -512 + (sx / n + 0.5) * 2, z: -512 + (sz / n + 0.5) * 2, cells: n, w: i1 - i0 + 1, h: j1 - j0 + 1 });
    }
    return { s: bil(0), r: bil(1), district: (x, z) => f.rgba[cell(x, z) * 4 + 2], jDist: (x, z) => Math.sqrt(jsq[cell(x, z)]) * 2, junctions,
      nearPark: (x, z) => [-2, 0, 2].some((dx) => [-2, 0, 2].some((dz) => mask[cell(x + dx, z + dz)] === 2)) };
  })();
  return fieldP;
}

/** Median colour of uncovered pixels whose ground point passes `pick`. */
function refColour(im: Img, cv: Cover, gm: Awaited<ReturnType<typeof groundMap>>, pick: (x: number, z: number) => boolean): { c: RGB; n: number } {
  const cs: RGB[] = [];
  for (let y = 0; y < im.h; y += 1) for (let x = 0; x < im.w; x += 1) {
    const [gx, gz] = gm.toGround(x + 0.5, y + 0.5);
    if (pick(gx, gz) && !covered(cv, im, x, y)) cs.push(at(im, x, y));
  }
  return { c: cs.length ? median(cs) : [0, 0, 0], n: cs.length };
}
const pixAt = (im: Img, gm: Awaited<ReturnType<typeof groundMap>>, x: number, z: number) => {
  const [sx, sy] = gm.toPx(x, z);
  const X = Math.floor(sx), Y = Math.floor(sy);
  return X >= 0 && Y >= 0 && X < im.w && Y < im.h ? ([X, Y] as const) : null;
};

function report(name: string, data: unknown) {
  writeFileSync(join(DIR, `card1-${name}.json`), JSON.stringify(data, null, 2));
  console.log(`[card1] ${name}: ${JSON.stringify(data)}`);
}

/** AC3: pixels may change only off the parts; writes the diff png (red: changed ground or part edge, blue: changed inside a part). */
async function diffOutsideParts(before: string, after: Img, cv: Cover, out: string) {
  const b = await decode(readFileSync(before));
  expect.soft(b.w === after.w && b.h === after.h, `${out}: before/after sizes`).toBe(true);
  const o = Buffer.alloc(after.w * after.h * 4);
  let ground = 0, onParts = 0;
  for (let y = 0; y < after.h; y++) for (let x = 0; x < after.w; x++) {
    const p = (y * after.w + x) * 4, a = at(after, x, y), c = at(b, x, y);
    const changed = Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), Math.abs(a[2] - c[2])) > 3;
    // a part's interior: the pixel and its 8 neighbours covered (edge pixels are antialiased against the ground)
    const part = interior(cv, after, x, y);
    const g = lum(a) * 0.3;
    o[p] = changed && part ? 0 : changed ? 255 : g; o[p + 1] = changed ? 0 : g; o[p + 2] = changed && part ? 255 : g; o[p + 3] = 255;
    if (changed && part) onParts++;
    else if (changed) ground++;
  }
  await sharp(o, { raw: { width: after.w, height: after.h, channels: 4 } }).png().toFile(out);
  return { changedGround: ground, changedOnParts: onParts };
}

// ---------- tests ----------
test.describe.configure({ mode: 'serial' });

test('card 1: desktop 1440x900 T2 (+T0) — same-seed captures and ACs 1-6, 8, 10', async ({ page }) => {
  test.skip(isPhone(page), 'desktop only');
  test.skip(needsBefore('1440x900'), 'no before run in CITY_CARD1_DIR (local A/B against main only)');
  test.setTimeout(170_000);
  const vp = '1440x900';
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'tier=T2&reduced=1');
  const home = (await api(page)(() => (window as unknown as HarnessWindow).__city.camera().target)) as [number, number];
  const shots: Record<string, Img> = {};
  const record: Record<string, unknown> = { phase: PHASE, home };
  const F = await field();
  POSES[3].target = [-51, 35]; // the spec pose; p4Target nudges it
  for (const p of POSES) {
    await setPose(page, p, home);
    if (p.name === 'P4') { p.target = await p4Target(page, F, vp); if (PHASE === 'pose') return; await setPose(page, p, home); record.P4target = p.target; }
    shots[p.name] = await shoot(page, file(p.name, vp, 'T2', PHASE));
    const d = await diag(page);
    record[p.name] = { drawCalls: d.drawCalls, triangles: d.triangles, gpuMem: d.gpuMemEstimateMb };
    if (p.name === 'P1' || p.name === 'P4') record[`anchors${p.name}`] = await anchors(page);
  }
  record.data = await partData(page);
  if (PHASE === 'before') {
    writeFileSync(join(DIR, `card1-${vp}-before.json`), JSON.stringify(record, null, 2));
    await open(page, 'tier=T0&reduced=1');
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.setVisibility('visible'));
    await page.waitForTimeout(400);
    await shoot(page, file('P1', vp, 'T0', 'before'), true);
    writeFileSync(join(DIR, `card1-${vp}-T0-before.json`), JSON.stringify(await page.evaluate(() => (window as unknown as HarnessWindow).__city.t0Picture()), null, 2));
    return;
  }
  const before = JSON.parse(readFileSync(beforeFile(`card1-${vp}-before.json`), 'utf8'));
  const ac: Record<string, unknown> = {};
  // the before run is main 2875fb72: it re-measures the baseline the limit is built on
  expect.soft({ calls: before.P1.drawCalls, tris: before.P1.triangles }, 'AC1 baseline on main').toEqual(MAIN_BASE.desktop);
  const lim = card1Limit(false);

  // AC1 budget at every pose
  for (const p of POSES) {
    const r = record[p.name] as { drawCalls: number; triangles: number };
    expect.soft(r.drawCalls, `AC1 ${p.name} draw calls`).toBeLessThanOrEqual(lim.calls);
    expect.soft(r.triangles, `AC1 ${p.name} triangles`).toBeLessThanOrEqual(lim.tris);
  }
  ac.AC1 = Object.fromEntries(POSES.map((p) => [p.name, record[p.name]]));
  // AC2 part data identical
  expect.soft(record.data, 'AC2 part data / chunk bytes').toEqual(before.data);
  expect.soft(record.anchorsP1, 'AC2 anchors P1').toEqual(before.anchorsP1);
  expect.soft(record.anchorsP4, 'AC2 anchors P4').toEqual(before.anchorsP4);
  ac.AC2 = { parts: (record.data as { parts: number }).parts, chunks: Object.keys((record.data as { chunks: object }).chunks).length, anchors: Object.keys(record.anchorsP1 as object).length };

  const maps: Record<string, Awaited<ReturnType<typeof groundMap>>> = {}, covers: Record<string, Cover> = {};
  const ac3: Record<string, unknown> = {};
  for (const p of POSES) {
    await setPose(page, p, home);
    maps[p.name] = await groundMap(page);
    covers[p.name] = await coverage(page);
    const d = await diffOutsideParts(beforeFile(`card1-${p.name}-${vp}-T2-before.png`), shots[p.name], covers[p.name], file(p.name, vp, 'T2', 'diff'));
    ac3[p.name] = { ...d, coveredPx: covers[p.name].bits.reduce((n, b) => n + popcount(b), 0), mPerPx: +maps[p.name].mPerPx.toFixed(4) };
  }
  ac.AC3 = ac3;
  for (const p of POSES) expect.soft((ac3[p.name] as { changedOnParts: number }).changedOnParts, `AC3 ${p.name}: pixels changed on parts`).toBe(0);

  // AC4 coast at P3: the rendered edge is within 0.5 m of the bay circle, and antialiased
  {
    const im = shots.P3, gm = maps.P3, cv = covers.P3;
    let n = 0, worst = 0, aaRays = 0, noEdge = 0;
    for (let x = 125; x <= 325; x += 1) {
      const z = 420 - Math.sqrt(250 ** 2 - (x - 170) ** 2);
      if (Math.abs(F.s(x, z)) > 1) continue; // the data coast leaves the circle (river, map edge)
      const ux = (x - 170) / 250, uz = (z - 420) / 250;
      const samples: { r: number; l: number }[] = [];
      let skip = false;
      for (let rr = 247; rr <= 253; rr += 0.02) {
        const [sx, sy] = gm.toPx(170 + ux * rr, 420 + uz * rr);
        const X = Math.floor(sx), Y = Math.floor(sy);
        if (X < 2 || Y < 2 || X >= im.w - 2 || Y >= im.h - 2 || covered(cv, im, X, Y, 2)) { skip = true; break; }
        samples.push({ r: rr, l: lumAt(im, sx, sy) });
      }
      if (skip) continue;
      // the coast edge: where the profile crosses halfway from the quay shadow (water, r < 250) up to the coping
      const lOf = (r0: number, r1: number) => samples.filter((q) => q.r >= r0 && q.r <= r1).map((q) => q.l);
      const shadowL = Math.min(...lOf(248.9, 249.3)), copingL = Math.max(...lOf(250, 250.8)), mid = (shadowL + copingL) / 2;
      let edge = NaN;
      for (let k = 1; k < samples.length; k++) {
        if (samples[k - 1].r < 248.5 || samples[k].r > 251) continue;
        if (samples[k - 1].l < mid && samples[k].l >= mid) { edge = samples[k - 1].r + ((mid - samples[k - 1].l) / (samples[k].l - samples[k - 1].l)) * 0.02; break; }
      }
      if (!Number.isFinite(edge)) { noEdge++; continue; }
      // antialiased: a pixel centre near the edge sits strictly between the two levels
      const lo = shadowL + 0.15 * (copingL - shadowL), hi = copingL - 0.15 * (copingL - shadowL);
      let aa = false;
      for (let rr = edge - gm.mPerPx; rr <= edge + gm.mPerPx; rr += gm.mPerPx / 4) {
        const [sx, sy] = gm.toPx(170 + ux * rr, 420 + uz * rr);
        const l = lum(at(im, Math.floor(sx), Math.floor(sy)));
        if (l > lo && l < hi) aa = true;
      }
      if (aa) aaRays++;
      worst = Math.max(worst, Math.abs(edge - 250));
      n++;
    }
    ac.AC4 = { rays: n, worstM: +worst.toFixed(3), aaRays, noEdge, mPerPx: +gm.mPerPx.toFixed(3) };
    console.log(`[card1] AC4 ${JSON.stringify(ac.AC4)}`);
    expect.soft(n, 'AC4 rays on the P3 arc').toBeGreaterThan(40);
    expect.soft(worst, 'AC4 worst edge offset (m)').toBeLessThanOrEqual(0.5);
    expect.soft(noEdge, 'AC4 rays without a coast edge').toBe(0);
    expect.soft(aaRays / n, 'AC4 share of rays with an antialiased edge pixel').toBeGreaterThan(0.5);
  }

  // AC5 kerbs, sidewalks and crosswalks at P2 and P4
  const ac5: Record<string, unknown> = {};
  for (const name of ['P2', 'P4']) {
    const im = shots[name], gm = maps[name], cv = covers[name];
    const road = refColour(im, cv, gm, (x, z) => F.r(x, z) < -1 && F.jDist(x, z) > 8 && F.s(x, z) > 5);
    const k = kerbEdges(im, gm, cv, F);
    // crosswalks: every visible arm of every crosswalk-district junction in view has >= 3 stripes
    // 1-4 m from the box; none mid-block. Stripes are lighter than the road (mix(--line, --fg, .22)).
    const isStripe = (c: RGB) => lum(c) > lum(road.c) + 5;
    const arms = crossings(im, gm, cv, F, isStripe);
    let midBlock = 0, midN = 0;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const [gx, gz] = gm.toGround(x + 0.5, y + 0.5);
      if (F.r(gx, gz) > -0.5 || F.jDist(gx, gz) < 9 || F.s(gx, gz) < 5 || covered(cv, im, x, y)) continue;
      midN++;
      if (isStripe(at(im, x, y))) midBlock++;
    }
    ac5[name] = { road: road.c, kerb: k, arms, midBlockStripePx: midBlock, midBlockRoadPx: midN };
    console.log(`[card1] AC5 ${name} ${JSON.stringify(ac5[name])}`);
    expect.soft(k.edges, `AC5 ${name}: road-edge samples`).toBeGreaterThan(50);
    expect.soft(k.kerbOk / k.edges, `AC5 ${name}: a kerb line at road edges`).toBeGreaterThan(0.9);
    expect.soft(k.walkOk / k.edges, `AC5 ${name}: sidewalk at road edges`).toBeGreaterThan(0.9);
    expect.soft(Object.keys(arms).length, `AC5 ${name}: visible crosswalk arms`).toBeGreaterThanOrEqual(name === 'P4' ? 4 : 2);
    for (const [k, v] of Object.entries(arms)) expect.soft(v, `AC5 ${name} arm ${k}: stripes`).toBeGreaterThanOrEqual(3);
    expect.soft(midBlock, `AC5 ${name}: stripe pixels mid-block`).toBe(0);
  }
  ac.AC5 = ac5;

  // AC6 quay at the P3 street ends (x = 169, 215, 285); verge at V
  ac.AC6 = await quayAndVerge(shots, maps, covers, F, true);

  // AC10: high contrast raises kerb contrast; colour-blind mode leaves the ground alone
  {
    const p2 = POSES[1];
    const kerbContrast = (im: Img, gm: Awaited<ReturnType<typeof groundMap>>, cv: Cover) => kerbEdges(im, gm, cv, F).kerbOverRoad;
    const normal = kerbContrast(shots.P2, maps.P2, covers.P2);
    await open(page, 'tier=T2&reduced=1&hc=1');
    await setPose(page, p2, home);
    const hcImg = await shoot(page, file('P2', vp, 'T2', 'hc-after'));
    const hc = kerbContrast(hcImg, await groundMap(page), await coverage(page));
    await open(page, 'tier=T2&reduced=1&cb=1');
    await setPose(page, p2, home);
    const cbImg = await shoot(page, file('P2', vp, 'T2', 'cb-after'));
    const cbCv = await coverage(page);
    let cbChanged = 0, cbPark = 0;
    for (let y = 0; y < cbImg.h; y++) for (let x = 0; x < cbImg.w; x++) {
      // margin 1: at dpr 1.5 a CSS pixel on a part's edge blends part device pixels, and cb recolours parts
      if (covered(cbCv, cbImg, x, y, 1) || covered(covers.P2, cbImg, x, y, 1)) continue;
      // boats sail between page loads and are not in the parts coverage: water is left out
      const gp = maps.P2.toGround(x + 0.5, y + 0.5);
      if (F.s(...gp) < 0) continue;
      // card 2 §2.5: the olive park takes no --gain, so park and verge are no longer left out
      if (F.nearPark(...gp)) cbPark = Math.max(cbPark, dist(at(cbImg, x, y), at(shots.P2, x, y)));
      if (dist(at(cbImg, x, y), at(shots.P2, x, y)) > 3) cbChanged++;
    }
    ac.AC10 = { kerbVsRoadNormal: +normal.toFixed(1), kerbVsRoadHc: +hc.toFixed(1), cbGroundPxChanged: cbChanged, cbParkMaxDist: +cbPark.toFixed(2) };
    expect.soft(hc, 'AC10 hc kerb contrast').toBeGreaterThan(normal * 1.3);
    expect.soft(cbChanged, 'AC10 cb ground pixels changed').toBe(0);
  }

  // AC8 T0: labels identical; the coast is clipped (pixels change only at the water edge)
  {
    await open(page, 'tier=T0&reduced=1');
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.setVisibility('visible'));
    await page.waitForTimeout(400);
    const t0im = await shoot(page, file('P1', vp, 'T0', 'after'), true);
    const t0 = await page.evaluate(() => (window as unknown as HarnessWindow).__city.t0Picture());
    const t0b = JSON.parse(readFileSync(beforeFile(`card1-${vp}-T0-before.json`), 'utf8'));
    expect.soft(t0?.labels, 'AC8 T0 labels').toEqual(t0b.labels);
    const steps = hardCoastSteps(t0im);
    ac.AC8 = { labels: t0?.labels.length, top: t0?.top, bottom: t0?.bottom, hardCoastSteps: steps };
    expect.soft(steps, 'AC8 T0 hard water/land pixel steps (the coast clip is gone?)').toBeLessThanOrEqual(AC8_HARD_STEPS_MAX);
  }
  report(`${vp}-after`, ac);
});

test('card 1: phone 390x844 T1 (+T0) — same-seed captures and ACs 1, 3, 7, 8', async ({ page }) => {
  test.skip(!isPhone(page), 'phone only');
  test.skip(needsBefore('390x844'), 'no before run in CITY_CARD1_DIR (local A/B against main only)');
  test.setTimeout(170_000);
  const vp = '390x844';
  await open(page, 'tier=T1&reduced=1');
  const home = (await api(page)(() => (window as unknown as HarnessWindow).__city.camera().target)) as [number, number];
  const shots: Record<string, Img> = {};
  const record: Record<string, unknown> = { phase: PHASE, home };
  const F = await field();
  POSES[3].target = [-51, 35]; // the spec pose; p4Target nudges it
  for (const p of POSES) {
    await setPose(page, p, home);
    if (p.name === 'P4') { p.target = await p4Target(page, F, vp); if (PHASE === 'pose') return; await setPose(page, p, home); record.P4target = p.target; }
    shots[p.name] = await shoot(page, file(p.name, vp, 'T1', PHASE));
    const d = await diag(page);
    record[p.name] = { drawCalls: d.drawCalls, triangles: d.triangles, gpuMem: d.gpuMemEstimateMb };
    if (p.name === 'P1' || p.name === 'P4') record[`anchors${p.name}`] = await anchors(page);
  }
  record.data = await partData(page);
  if (PHASE === 'before') {
    writeFileSync(join(DIR, `card1-${vp}-before.json`), JSON.stringify(record, null, 2));
    await open(page, 'tier=T0&reduced=1');
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.setVisibility('visible'));
    await page.waitForTimeout(400);
    await shoot(page, file('P1', vp, 'T0', 'before'), true);
    writeFileSync(join(DIR, `card1-${vp}-T0-before.json`), JSON.stringify(await page.evaluate(() => (window as unknown as HarnessWindow).__city.t0Picture()), null, 2));
    return;
  }
  const before = JSON.parse(readFileSync(beforeFile(`card1-${vp}-before.json`), 'utf8'));
  const ac: Record<string, unknown> = {};
  // the before run is main 2875fb72: it re-measures the baseline the limit is built on
  expect.soft({ calls: before.P1.drawCalls, tris: before.P1.triangles }, 'AC1 baseline on main').toEqual(MAIN_BASE.phone);
  const lim = card1Limit(true);
  for (const p of POSES) {
    const r = record[p.name] as { drawCalls: number; triangles: number };
    expect.soft(r.drawCalls, `AC1 ${p.name} draw calls`).toBeLessThanOrEqual(lim.calls);
    expect.soft(r.triangles, `AC1 ${p.name} triangles`).toBeLessThanOrEqual(lim.tris);
    // AC7: no new mesh on T1 (no quay wall): calls and triangles exactly as before
    expect.soft(r, `AC7 ${p.name}: T1 draw calls / triangles unchanged`).toMatchObject({ drawCalls: before[p.name].drawCalls, triangles: before[p.name].triangles });
  }
  ac.AC1 = Object.fromEntries(POSES.map((p) => [p.name, record[p.name]]));
  expect.soft(record.data, 'AC2 part data / chunk bytes').toEqual(before.data);
  expect.soft(record.anchorsP1, 'AC2 anchors P1').toEqual(before.anchorsP1);
  expect.soft(record.anchorsP4, 'AC2 anchors P4').toEqual(before.anchorsP4);

  const maps: Record<string, Awaited<ReturnType<typeof groundMap>>> = {}, covers: Record<string, Cover> = {};
  const ac3: Record<string, unknown> = {};
  for (const p of POSES) {
    await setPose(page, p, home);
    maps[p.name] = await groundMap(page);
    covers[p.name] = await coverage(page);
    ac3[p.name] = await diffOutsideParts(beforeFile(`card1-${p.name}-${vp}-T1-before.png`), shots[p.name], covers[p.name], file(p.name, vp, 'T1', 'diff'));
    expect.soft((ac3[p.name] as { changedOnParts: number }).changedOnParts, `AC3 ${p.name}: pixels changed on parts`).toBe(0);
  }
  ac.AC3 = ac3;
  // AC7: T1 keeps kerbs, sidewalks, quay and verge, but draws no crosswalks
  {
    const im = shots.P4, gm = maps.P4, cv = covers.P4;
    const road = refColour(im, cv, gm, (x, z) => F.r(x, z) < -1 && F.jDist(x, z) > 8).c;
    const band = refColour(im, cv, gm, (x, z) => F.r(x, z) < -1 && F.jDist(x, z) <= 6 && F.jDist(x, z) > 2.5);
    const walk = refColour(im, cv, gm, (x, z) => { const r = F.r(x, z); return r > 0.6 && r < 1.6 && F.s(x, z) > 5; }).c;
    let stripe = 0, n = 0;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const [gx, gz] = gm.toGround(x + 0.5, y + 0.5);
      if (F.r(gx, gz) > -0.5 || F.jDist(gx, gz) > 6 || F.jDist(gx, gz) <= 2.5 || covered(cv, im, x, y)) continue;
      n++;
      if (dist(at(im, x, y), road) > 4) stripe++;
    }
    ac.AC7 = { bandPx: n, bandPxOffRoadColour: stripe, road, bandMedian: band.c, sidewalk: walk, ...(await quayAndVerge(shots, maps, covers, F, false)) };
    expect.soft(n, 'AC7 crosswalk-band pixels in view').toBeGreaterThan(100);
    expect.soft(stripe, 'AC7 T1 crosswalk pixels').toBe(0);
    expect.soft(dist(walk, road), 'AC7 T1 sidewalk vs road').toBeGreaterThan(3);
  }
  {
    await open(page, 'tier=T0&reduced=1');
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.setVisibility('visible'));
    await page.waitForTimeout(400);
    const t0im = await shoot(page, file('P1', vp, 'T0', 'after'), true);
    const t0 = await page.evaluate(() => (window as unknown as HarnessWindow).__city.t0Picture());
    const t0b = JSON.parse(readFileSync(beforeFile(`card1-${vp}-T0-before.json`), 'utf8'));
    expect.soft(t0?.labels, 'AC8 T0 labels').toEqual(t0b.labels);
    const steps = hardCoastSteps(t0im);
    ac.AC8 = { labels: t0?.labels.length, hardCoastSteps: steps };
    expect.soft(steps, 'AC8 T0 hard water/land pixel steps (the coast clip is gone?)').toBeLessThanOrEqual(AC8_HARD_STEPS_MAX);
  }
  report(`${vp}-after`, ac);
});

/**
 * Profiles across every road edge in view (sampled on a 6 px grid): road at r = -0.8 m, the kerb
 * peak in r = -0.2..0.6 m, sidewalk at r = 1.1 m. The kerb is ~1 px at zoom 4, so it is found as
 * the brightest line, not as pure pixels.
 */
function kerbEdges(im: Img, gm: Awaited<ReturnType<typeof groundMap>>, cv: Cover, F: Field) {
  let edges = 0, kerbOk = 0, walkOk = 0;
  const over: number[] = [], walkOver: number[] = [];
  for (let sy = 3; sy < im.h - 3; sy += 6) for (let sx = 3; sx < im.w - 3; sx += 6) {
    const [gx, gz] = gm.toGround(sx, sy);
    const r0 = F.r(gx, gz);
    if (r0 < -0.5 || r0 > 0.5 || F.s(gx, gz) < 5) continue;
    const e = 0.05, nx = (F.r(gx + e, gz) - F.r(gx - e, gz)) / (2 * e), nz = (F.r(gx, gz + e) - F.r(gx, gz - e)) / (2 * e), gl = Math.hypot(nx, nz);
    if (gl < 0.7) continue; // corners and ridges
    const L = (t: number) => {
      const p = pixAt(im, gm, gx + (nx / gl) * (t - r0), gz + (nz / gl) * (t - r0));
      return p && !covered(cv, im, p[0], p[1]) ? lum(at(im, p[0], p[1])) : NaN;
    };
    const roadL = L(-0.8), walkL = L(1.1);
    let peak = -1;
    for (let t = -0.2; t <= 0.6; t += 0.05) { const l = L(t); if (Number.isNaN(l)) { peak = NaN; break; } peak = Math.max(peak, l); }
    if ([roadL, walkL, peak].some(Number.isNaN)) continue;
    edges++;
    if (peak >= walkL + 3 && peak >= roadL + 3) kerbOk++;
    if (walkL >= roadL + 2) walkOk++;
    over.push(peak - roadL); walkOver.push(walkL - roadL);
  }
  const med = (a: number[]) => +(a.sort((x, y) => x - y)[a.length >> 1] ?? 0).toFixed(1);
  return { edges, kerbOk, walkOk, kerbOverRoad: med(over), walkOverRoad: med(walkOver) };
}

function popcount(b: number) { let n = 0; for (; b; b &= b - 1) n++; return n; }

/** AC6: coping + apron + shadow where the P3 streets meet the bay; a verge (no coping) at V. */
async function quayAndVerge(shots: Record<string, Img>, maps: Record<string, Awaited<ReturnType<typeof groundMap>>>, covers: Record<string, Cover>, F: Field, strict: boolean) {
  const out: Record<string, unknown> = {};
  const im = shots.P3, gm = maps.P3, cv = covers.P3;
  const quay = (x: number, z: number) => F.district(x, z) === 2;
  const apron = refColour(im, cv, gm, (x, z) => { const s = F.s(x, z); return quay(x, z) && s > 1.5 && s < 3.4; });
  const water = refColour(im, cv, gm, (x, z) => F.s(x, z) < -6);
  const road = refColour(im, cv, gm, (x, z) => F.r(x, z) < -1 && F.s(x, z) > 8);
  const shadowBand = refColour(im, cv, gm, (x, z) => { const s = F.s(x, z); return quay(x, z) && s > -1.1 && s < -0.5; });
  const ends: Record<string, unknown> = {};
  for (const sx of [169, 215, 285]) {
    // down the street centre to the coast, then a profile across it
    let z = 140;
    while (z < 260 && F.s(sx, z) > 0) z += 0.05;
    const L = (ds: number) => { const p = pixAt(im, gm, sx, z - ds); return p && !covered(cv, im, p[0], p[1]) ? lum(at(im, p[0], p[1])) : NaN; };
    let coping = -1, shadow = 1e9, ok = true;
    for (let t = -0.3; t <= 0.9; t += 0.05) { const l = L(t); if (Number.isNaN(l)) ok = false; else coping = Math.max(coping, l); }
    for (let t = -1.4; t <= -0.3; t += 0.05) { const l = L(t); if (Number.isNaN(l)) ok = false; else shadow = Math.min(shadow, l); }
    const apronL = L(2.5), waterL = L(-8);
    ends[`x=${sx}`] = ok && ![apronL, waterL].some(Number.isNaN)
      ? { coping: coping >= apronL + 2, apron: Math.abs(apronL - lum(apron.c)) <= 3, lum: { coping, apronL, shadow, waterL } }
      : 'off-screen or covered';
  }
  out.quay = { refs: { apron: apron.c, water: water.c, shadow: shadowBand.c, road: road.c, apronPx: apron.n, shadowPx: shadowBand.n }, ends };
  console.log(`[card1] AC6 ${JSON.stringify(out.quay)}`);
  expect.soft(apron.n, 'AC6 apron pixels').toBeGreaterThan(50);
  expect.soft(dist(apron.c, water.c), 'AC6 apron vs water').toBeGreaterThan(10);
  expect.soft(dist(apron.c, road.c), 'AC6 apron vs road').toBeGreaterThan(3);
  const seen = Object.entries(ends).filter(([, e]) => typeof e === 'object') as [string, Record<string, unknown>][];
  // per street end only on T2 desktop: on the phone at zoom 2 a pixel is wider than the coping
  if (strict) {
    expect.soft(seen.length, 'AC6 street ends in view').toBeGreaterThan(1);
    for (const [k, e] of seen) expect.soft({ coping: e.coping, apron: e.apron }, `AC6 street end ${k}`).toEqual({ coping: true, apron: true });
    // the shadow (spec: mix(water, --bg0, .5)) is logged, not asserted: water is --bg0, so it is ~1 unit off water
  }

  // verge at V: non-quay coast far from roads, a green band and no coping line
  const vi = shots.V, vg = maps.V, vc = covers.V;
  // more than 16 m from a road (the field holds +-20 m), and off the 1 px map-edge fade
  const isVerge = (x: number, z: number) => !quay(x, z) && F.r(x, z) > 17 && Math.max(Math.abs(x), Math.abs(z)) < 508;
  const verge = refColour(vi, vc, vg, (x, z) => isVerge(x, z) && F.s(x, z) > 0.4 && F.s(x, z) < 1.6);
  const vergeEdge = refColour(vi, vc, vg, (x, z) => isVerge(x, z) && F.s(x, z) > 0 && F.s(x, z) < 0.5);
  const land = refColour(vi, vc, vg, (x, z) => F.s(x, z) > 6 && F.r(x, z) > 3 && F.district(x, z) !== 2);
  const vWater = refColour(vi, vc, vg, (x, z) => F.s(x, z) < -6 && Math.max(Math.abs(x), Math.abs(z)) < 508);
  out.verge = { px: verge.n, verge: verge.c, edge: vergeEdge.c, land: land.c, water: vWater.c };
  console.log(`[card1] AC6 verge ${JSON.stringify(out.verge)}`);
  expect.soft(verge.n, 'AC6 verge pixels at V').toBeGreaterThan(50);
  expect.soft(dist(verge.c, land.c), 'AC6 verge vs land').toBeGreaterThan(3);
  expect.soft(dist(verge.c, vWater.c), 'AC6 verge vs water').toBeGreaterThan(5);
  expect.soft(lum(vergeEdge.c) - lum(verge.c), 'AC6 no coping line on the verge').toBeLessThan(3);
  return out;
}

/**
 * Stripe runs on each arm of each crosswalk-district junction in view: a line across the road 2.5 m
 * past the box edge (the middle of the 1-4 m band). Arms less than 80 % visible are left out.
 */
function crossings(im: Img, gm: Awaited<ReturnType<typeof groundMap>>, cv: Cover, F: Field, isStripe: (c: RGB) => boolean) {
  const arms: Record<string, number> = {};
  for (const j of F.junctions) {
    // plain street crossings only: the avenue's long diagonal boxes, the 10 sliver boxes of skewed or
    // narrowing junctions (a side under 3 cells = 6 m) and districts without crosswalks are skipped
    if (j.cells > 25 || Math.min(j.w, j.h) < 3 || F.district(j.x, j.z) !== 1 || !pixAt(im, gm, j.x, j.z)) continue;
    for (const [ax, az, nm] of [[1, 0, '+x'], [-1, 0, '-x'], [0, 1, '+z'], [0, -1, '-z']] as const) {
      let t = 0;
      while (t < 12 && F.jDist(j.x + ax * t, j.z + az * t) === 0) t += 0.25;
      const mid = t + 2.5;
      if (F.r(j.x + ax * mid, j.z + az * mid) > -1) continue; // no road on this arm
      let runs = 0, prev = false, road = 0, seen = 0;
      for (let q = -6; q <= 6; q += gm.mPerPx / 3) {
        const x = j.x + ax * mid + az * q, z = j.z + az * mid + ax * q;
        if (F.r(x, z) > -0.4) { prev = false; continue; }
        road++;
        const p = pixAt(im, gm, x, z);
        if (!p || covered(cv, im, p[0], p[1])) { prev = false; continue; }
        seen++;
        const st = isStripe(at(im, p[0], p[1]));
        if (st && !prev) runs++;
        prev = st;
      }
      if (seen >= 0.8 * road) arms[`${j.x.toFixed(0)},${j.z.toFixed(0)} ${nm}`] = runs;
    }
  }
  return arms;
}

/**
 * AC8: the T0 ground bitmap is drawn unsmoothed, so without the vector coast clip the shoreline is a
 * staircase where a water pixel touches a land pixel directly. With the clip, canvas AA puts a blended
 * pixel between them. Counts direct water/land neighbours (water and land: the picture's two most
 * common colours). QA's CI images of #60: 6 desktop / 0 phone; clip removed (QA's M2): 3676 / 109.
 */
const AC8_HARD_STEPS_MAX = 20;
function hardCoastSteps(im: Img): number {
  const hist = new Map<number, number>();
  const key = (o: number) => (im.d[o] << 16) | (im.d[o + 1] << 8) | im.d[o + 2];
  for (let o = 0; o < im.d.length; o += 4) hist.set(key(o), (hist.get(key(o)) ?? 0) + 1);
  const [water, land] = [...hist].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let n = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const a = key((y * im.w + x) * 4);
    if (a !== water && a !== land) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (x + dx >= im.w || y + dy >= im.h) continue;
      const b = key(((y + dy) * im.w + x + dx) * 4);
      if (b !== a && (b === water || b === land)) n++;
    }
  }
  return n;
}

/** Decision 5: the crosswalk junction nearest [-51, 35] with all four arms in view at zoom 4, > 20 m from the crown plaza. */
async function p4Target(page: Page, F: Field, vp: string): Promise<[number, number]> {
  const saved = join(DIR, `card1-${vp}-P4-target.json`);
  if (PHASE !== 'pose') return JSON.parse(readFileSync(PHASE === 'after' ? beforeFile(`card1-${vp}-P4-target.json`) : saved, 'utf8'));
  const im = await decode(await page.locator('canvas').first().screenshot({ scale: 'css' }));
  const gm = await groundMap(page), cv = await coverage(page);
  const arms = crossings(im, gm, cv, F, () => false);
  const full = new Map<string, number>();
  for (const k of Object.keys(arms)) { const c = k.split(' ')[0]; full.set(c, (full.get(c) ?? 0) + 1); }
  const best = [...full].filter(([, n]) => n === 4).map(([c]) => c.split(',').map(Number) as [number, number])
    .filter(([x, z]) => Math.hypot(x + 30, z - 10) > 20)
    .sort((a, b) => Math.hypot(a[0] + 51, a[1] - 35) - Math.hypot(b[0] + 51, b[1] - 35))[0];
  if (!best) throw new Error('P4: no crosswalk junction with four visible arms near [-51, 35]');
  writeFileSync(saved, JSON.stringify(best));
  return best;
}
