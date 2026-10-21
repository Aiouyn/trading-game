import { test } from '@playwright/test';
import { diag, expect, openCity, waitDrawn, type HarnessWindow } from './helpers';

const countContexts = () => {
  const w = window as unknown as { __gl: { asked: string[]; created: string[] } };
  w.__gl = { asked: [], created: [] };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    const ctx = (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    if (/webgl/.test(type)) {
      w.__gl.asked.push(type);
      if (ctx) w.__gl.created.push(type);
    }
    return ctx;
  } as typeof orig;
};

test.describe('C-01 tiers (17-AT-24)', () => {
  test('injected frame-time source < 45 fps in the first 2 s → T1 (auto-fps)', async ({ page }) => {
    await openCity(page, 'slowclock=1');
    await waitDrawn(page);
    await page.waitForFunction(() => (window as unknown as HarnessWindow).__city.diagnostics().fpsFirst2s !== null, null, { timeout: 0 });
    const d = await diag(page);
    expect(d.fpsFirst2s).toBeCloseTo(25, 0);
    expect(d.tier).toBe('T1');
    expect(d.tierReason).toBe('auto-fps');
  });

  test('getContext("webgl2") → null: tier T0 and no WebGL context created', async ({ page }) => {
    await page.addInitScript(countContexts);
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2') return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof orig;
    });
    await openCity(page);
    await waitDrawn(page);
    const d = await diag(page);
    expect(d.tier).toBe('T0');
    expect(d.tierReason).toBe('no-webgl2');
    const gl = await page.evaluate(() => (window as unknown as { __gl: { asked: string[]; created: string[] } }).__gl);
    expect(gl.created).toEqual([]);
    expect(await page.locator('canvas').count()).toBe(0);
    await expect(page.locator('.city-stage img')).toBeVisible();
  });

  test('battery saver (discharging, 15 %) → T0 (battery-saver), no WebGL context', async ({ page }) => {
    await page.addInitScript(countContexts);
    await page.addInitScript(() => {
      (navigator as unknown as { getBattery: () => Promise<unknown> }).getBattery = async () => ({ charging: false, level: 0.15 });
    });
    await openCity(page);
    await waitDrawn(page);
    const d = await diag(page);
    expect(d.tier).toBe('T0');
    expect(d.tierReason).toBe('battery-saver');
    const gl = await page.evaluate(() => (window as unknown as { __gl: { created: string[] } }).__gl);
    expect(gl.created).toEqual([]);
  });

  test('override T1 / T2 and onTierChange; context loss → T0 (context-lost)', async ({ page }) => {
    await openCity(page, 'tier=T2');
    await waitDrawn(page);
    expect((await diag(page)).tierReason).toBe('override');
    const changes = await page.evaluate(async () => {
      const r = (window as unknown as HarnessWindow).harness.renderer;
      const seen: string[] = [];
      r.onTierChange((t, why) => seen.push(`${t}:${why}`));
      r.setTier('T1');
      await new Promise((res) => setTimeout(res, 300));
      const gl = document.querySelector('canvas')!.getContext('webgl2')!;
      gl.getExtension('WEBGL_lose_context')!.loseContext();
      await new Promise((res) => setTimeout(res, 500));
      return seen;
    });
    expect(changes).toEqual(['T1:override', 'T0:context-lost']);
    expect((await diag(page)).tier).toBe('T0');
  });
});
