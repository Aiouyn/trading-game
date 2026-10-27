import { test } from '@playwright/test';
import { diag, expect, isPhone, openCity, waitDrawn, waitState, type HarnessWindow } from './helpers';

const simulateHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
};

test.describe('C-06 / C-11 render on demand', () => {
  for (const q of ['tier=T1', 'tier=T2&reduced=1']) {
    test(`idle 5 s: no rAF pending, renders constant (${q})`, async ({ page }) => {
      await openCity(page, q);
      await waitDrawn(page);
      await page.waitForTimeout(800); // let the first-frame work settle
      const before = await diag(page);
      await page.waitForTimeout(5000);
      const after = await diag(page);
      const pending = await page.evaluate(() => (window as unknown as HarnessWindow).__city.rafPending());
      expect(pending).toBe(false);
      expect(after.renders).toBe(before.renders);
    });
  }

  test('T2 ambient life runs at ≤ 12 fps after input', async ({ page }) => {
    await openCity(page, 'tier=T2');
    await waitDrawn(page);
    await page.waitForTimeout(3000); // past the 2 s tier measurement
    const a = (await diag(page)).renders;
    await page.waitForTimeout(2000);
    const n = (await diag(page)).renders - a;
    console.log('C-06 ambient frames in 2 s:', n);
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThanOrEqual(2 * 12 + 2);
  });

  test('T2 ambient stops within 60 s + 1 frame of the last input; boats hidden; input restarts it', async ({ page }) => {
    // Deterministic: the page runs on Playwright's fake clock (Date, performance.now, timers and
    // rAF), paused once the city is drawn and then advanced by hand, so load or wall time can't
    // move the stop (it failed locally at 60.6 s vs 60.1 s under load).
    test.skip(isPhone(page), 'desktop only (60 s)');
    test.setTimeout(120_000);
    const t0 = Date.now();
    await page.clock.install();
    await openCity(page, 'tier=T2');
    await waitDrawn(page);
    await waitState(page, 'C-06 fake clock: tier not T2 after waitDrawn', () => (window as unknown as HarnessWindow).__city.diagnostics().tier === 'T2');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 3000); // past the 2 s tier measurement
    await page.evaluate(() => (window as unknown as HarnessWindow).__city.setCamera({ zoom: 1 })); // last input
    expect((await page.evaluate(() => (window as unknown as HarnessWindow).__city.ambient())).on).toBe(true);
    const r0 = (await diag(page)).renders;
    await page.clock.runFor(59_000);
    const st59 = await page.evaluate(() => (window as unknown as HarnessWindow).__city.ambient());
    expect(st59.on, 'still running just before 60 s').toBe(true);
    expect(st59.msLeft).toBeGreaterThan(0);
    expect(st59.msLeft).toBeLessThanOrEqual(1000);
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).__city.rafPending())).toBe(true);
    const n59 = (await diag(page)).renders - r0;
    console.log('C-06 ambient frames in 59 s (fake clock):', n59);
    // the 12 fps cap holds on the fake clock too, and it really animated
    expect(n59).toBeLessThanOrEqual(59 * 12 + 2);
    // fake rAF ticks every 16 ms, so a 83.3 ms frame lands on the 96 ms tick (~10.4 fps)
    expect(n59).toBeGreaterThanOrEqual(59 * 10);
    await page.clock.runFor(1000 + 1000 / 12); // 60 s + one ambient frame
    const st = await page.evaluate(() => (window as unknown as HarnessWindow).__city.ambient());
    expect(st.on, 'stopped right after 60 s').toBe(false);
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).__city.rafPending())).toBe(false);
    const r = (await diag(page)).renders;
    await page.clock.runFor(3000);
    expect((await diag(page)).renders, 'flat render count after the stop').toBe(r);
    // input restarts it
    await page.locator('canvas').focus();
    await page.keyboard.press('+');
    await page.clock.runFor(1000);
    expect((await diag(page)).renders).toBeGreaterThan(r + 3);
    console.log('C-06 ambient test wall time', Date.now() - t0, 'ms');
  });

  test('real clock (loose): T2 ambient stops 60 s ± 1 s after the last input', async ({ page }) => {
    // Loose wall-clock companion to the fake-clock test above: proves the real timers, not just the
    // fake ones, stop ambient near 60 s. Measured in the page (performance.now at the input and at the
    // first poll that sees ambient off, 50 ms polls), so Playwright round trips don't count.
    test.skip(isPhone(page), 'desktop only (60 s)');
    test.skip(process.env.CI !== 'true', 'real-clock ±1 s check runs on CI only (a loaded local box stops late)');
    test.setTimeout(240_000);
    await openCity(page, 'tier=T2');
    await waitDrawn(page);
    // tier=T2 is forced, so no 2 s auto-tier measurement runs (fpsFirst2s stays null): the condition
    // to wait for is just T2 drawing, no sleep.
    await waitState(page, 'C-06 real clock: tier is not T2 after the tier measurement', () => (window as unknown as HarnessWindow).__city.diagnostics().tier === 'T2');
    type StopWindow = HarnessWindow & { __ambientStopMs?: number };
    // in-page 50 ms sampling of the stop time; the wait for it goes through waitState (120 s default)
    await page.evaluate(() => {
      const w = window as unknown as StopWindow;
      w.__city.setCamera({ zoom: 1 }); // last input
      const t = performance.now();
      const iv = setInterval(() => {
        if (!w.__city.ambient().on) { clearInterval(iv); w.__ambientStopMs = performance.now() - t; }
      }, 50);
    });
    await waitState(page, 'C-06 real clock: ambient still on after the last input', () => (window as unknown as StopWindow).__ambientStopMs !== undefined);
    const ms = await page.evaluate(() => (window as unknown as StopWindow).__ambientStopMs!);
    console.log('C-06 real-clock ambient stopped after', Math.round(ms), 'ms');
    expect(ms).toBeGreaterThanOrEqual(59_000);
    expect(ms).toBeLessThanOrEqual(61_000);
  });

  test('document.hidden for 60 s (simulated) → framesWhileHidden 0, no renders', async ({ page }) => {
    test.skip(isPhone(page), 'desktop only (60 s)');
    test.setTimeout(150_000);
    await openCity(page, 'tier=T2');
    await waitDrawn(page);
    await page.evaluate(simulateHidden, true);
    const before = await diag(page);
    // poke it: data, time of day and camera changes must not draw while hidden
    await page.evaluate(() => {
      const w = window as unknown as HarnessWindow;
      w.harness.renderer.setTimeOfDay(600);
      w.__city.setCamera({ zoom: 2 });
    });
    await page.waitForTimeout(60_000);
    const after = await diag(page);
    expect(after.framesWhileHidden).toBe(0);
    expect(after.renders).toBe(before.renders);
    await page.evaluate(simulateHidden, false);
    await page.waitForTimeout(500);
    expect((await diag(page)).renders).toBeGreaterThan(after.renders);
  });
});

test.describe('C-07 background', () => {
  test('unsubscribes at 30 s ± 1 s, no chunk fetch; visible → resubscribe < 1 s, one render; stamp moved → fetch', async ({ page }) => {
    test.skip(isPhone(page), 'desktop only (2 × 31 s)');
    test.setTimeout(180_000);
    await openCity(page, 'tier=T1');
    await waitDrawn(page);
    await page.waitForTimeout(500);
    const set = (v: 'visible' | 'background') => page.evaluate((x) => (window as unknown as HarnessWindow).harness.setVisibility(x), v);
    const subscribed = async () => (await diag(page)).subscribed;
    const fetches = () => page.evaluate(() => (window as unknown as HarnessWindow).harness.fetchLog.length);

    // round 1: nothing changes while away
    await set('background');
    const t0 = Date.now();
    await page.waitForTimeout(29_000);
    expect(await subscribed()).toBe(true);
    // 5 s bound: the check is unsubscribed at 30 s ± 1 s, measured from 29 s; polling 50 ms keeps the timing precise
    await waitState(page, 'C-07: still subscribed 29 s + 5 s after going background', () => !(window as unknown as HarnessWindow).__city.diagnostics().subscribed, { timeoutMs: 5000, polling: 50 });
    const unsubAt = (Date.now() - t0) / 1000;
    console.log('C-07 unsubscribed after', unsubAt.toFixed(2), 's');
    expect(Math.abs(unsubAt - 30)).toBeLessThanOrEqual(1);
    const r0 = (await diag(page)).renders;
    const f0 = await fetches();
    const tv = Date.now();
    await set('visible');
    // 1 s bound is the C-07 contract (resubscribe < 1 s after visible)
    await waitState(page, 'C-07: not resubscribed within 1 s of visible', () => (window as unknown as HarnessWindow).__city.diagnostics().subscribed, { timeoutMs: 1000, polling: 20 });
    console.log('C-07 resubscribed after', Date.now() - tv, 'ms');
    await page.waitForTimeout(1500);
    expect((await diag(page)).renders).toBe(r0 + 1);
    expect(await fetches()).toBe(f0);

    // round 2: the stamp moves while away → no fetch until visible, then one snapshot fetch
    await set('background');
    await page.waitForTimeout(31_000);
    expect(await subscribed()).toBe(false);
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.setStamp(2));
    await page.waitForTimeout(1000);
    expect(await fetches()).toBe(f0);
    await set('visible');
    // 5 s bound: this runs ~70 s into a 180 s test, so the 120 s default would end in Playwright's test timeout, not this named error
    await waitState(page, 'C-07 round 2: stateVersion not 2 within 5 s of visible', () => (window as unknown as HarnessWindow).__city.diagnostics().stateVersion === 2, { timeoutMs: 5000 });
    const log = await page.evaluate(() => (window as unknown as HarnessWindow).harness.fetchLog);
    // manifest first, then the v1→v2 delta it lists (content-addressed); no snapshot, no chunks
    const fresh = log.slice(f0);
    expect(fresh[0]).toMatch(/\/manifest\.json$/);
    expect(fresh[1]).toMatch(/\/h\/[0-9a-f]{64}\.json$/);
    // then only the chunk(s) the delta lists as changed, by content hash
    console.log('C-07 round 2 fetches', JSON.stringify(fresh));
    expect(fresh.slice(2).length).toBeLessThanOrEqual(2);
    for (const u of fresh.slice(2)) expect(u).toMatch(/\/h\/[0-9a-f]{64}\.bin$/);
  });
});

test.describe('C-08 chunks', () => {
  test('same stateVersion twice → no re-upload; unknown-base delta → manifest + listed delta; delta while background → no fetch', async ({ page }) => {
    await openCity(page, 'tier=T1');
    await waitDrawn(page);
    const r = await page.evaluate(async () => {
      const w = window as unknown as HarnessWindow;
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      const m1 = await (await fetch(`/city/${w.harness.info.cityId}/manifest.v1.json`)).json();
      const snap = await (await fetch(m1.snapshot.url)).json();
      const delta = (base: number, v: number) => ({ schemaVersion: 1 as const, cityId: snap.cityId, baseVersion: base, stateVersion: v, publicSnapshotTick: 0, ccy: snap.ccy, ground: snap.ground, districts: [], entities: [], chunks: [] });
      const up0 = w.__city.uploads();
      const g0 = w.__city.diagnostics().geometries;
      w.harness.renderer.setData(snap);
      w.harness.renderer.setData(snap);
      await sleep(300);
      const sameVersion = { uploads: w.__city.uploads() - up0, geometries: w.__city.diagnostics().geometries - g0 };
      const f0 = w.harness.fetchLog.length;
      w.harness.publish(delta(99, 2));
      w.harness.publish(delta(98, 2));
      await sleep(1500);
      const unknownBase = w.harness.fetchLog.slice(f0);
      const v = w.__city.diagnostics().stateVersion;
      w.harness.setVisibility('background');
      const f1 = w.harness.fetchLog.length;
      w.harness.publish(delta(2, 3));
      await sleep(500);
      const whileBackground = w.harness.fetchLog.length - f1;
      w.harness.setVisibility('visible');
      return { sameVersion, unknownBase, v, whileBackground };
    });
    expect(r.sameVersion).toEqual({ uploads: 0, geometries: 0 });
    expect(r.unknownBase[0]).toMatch(/\/manifest\.json$/);
    expect(r.unknownBase[1]).toMatch(/\/h\/[0-9a-f]{64}\.json$/);
    // + only the changed chunk(s) of the listed v1→v2 delta; never a snapshot or the full chunk set
    expect(r.unknownBase.length).toBeLessThanOrEqual(4);
    for (const u of r.unknownBase.slice(2)) expect(u).toMatch(/\/h\/[0-9a-f]{64}\.bin$/);
    expect(r.v).toBe(2);
    expect(r.whileBackground).toBe(0);
  });
});

test.describe('C-09 camera input', () => {
  test('[ ] reach four rotations; + / − clamp zoom to 0.25×–4×', async ({ page }) => {
    await openCity(page, 'tier=T1&reduced=1');
    await waitDrawn(page);
    await page.locator('canvas').focus();
    const cam = () => page.evaluate(() => (window as unknown as HarnessWindow).__city.camera());
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      seen.add((await cam()).rotation);
      await page.keyboard.press(']');
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    await page.keyboard.press('[');
    expect((await cam()).rotation).toBe(3);
    for (let i = 0; i < 20; i++) await page.keyboard.press('+');
    expect((await cam()).zoom).toBe(4);
    for (let i = 0; i < 40; i++) await page.keyboard.press('-');
    expect((await cam()).zoom).toBe(0.25);
    const t0 = (await cam()).target;
    await page.keyboard.press('ArrowLeft');
    expect((await cam()).target).not.toEqual(t0);
  });
});
