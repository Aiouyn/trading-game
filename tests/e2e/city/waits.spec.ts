import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, openCity, STATE_WAIT_MS, waitDrawn, waitState } from './helpers';

/**
 * Records the timeout each page.waitForFunction call receives, then runs it with a short real
 * timeout so a never-true wait fails fast. Lets the tests pin the DEFAULT bound without waiting 120 s.
 */
function recordTimeouts(page: Page): (number | undefined)[] {
  const seen: (number | undefined)[] = [];
  type Wff = (fn: unknown, arg: unknown, o?: { timeout?: number; polling?: number }) => Promise<unknown>;
  const real = (page.waitForFunction as unknown as Wff).bind(page);
  const spy: Wff = (fn, arg, o) => { seen.push(o?.timeout); return real(fn, arg, { ...o, timeout: 300 }); };
  (page as unknown as { waitForFunction: Wff }).waitForFunction = spy;
  return seen;
}

// The shared state wait is bounded and names what it waited for. Short injected bounds keep it fast.
test.describe('state waits are bounded and named', () => {
  test('a never-resolving condition fails with the named message and the page state', async ({ page }) => {
    await openCity(page);
    const t = Date.now();
    const err = await waitState(page, 'waits.spec: never-true condition', () => false, { timeoutMs: 500 }).then(() => null, (e: unknown) => e as Error);
    expect(Date.now() - t, 'bounded by the injected 500 ms, not the 120 s default').toBeLessThan(20_000);
    expect(err, 'the wait must fail').not.toBeNull();
    expect(err!.message).toMatch(/^waits\.spec: never-true condition after 0\.5s \(state=\{.*"ready":"1".*\}\)$/);
  });

  test('waitDrawn names its state when the city never draws', async ({ page }) => {
    // a T0 picture can't be drawn before the page exists: an about:blank page never satisfies it
    await page.goto('about:blank');
    const err = await waitDrawn(page, 300).then(() => null, (e: unknown) => e as Error);
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/^waitDrawn: city not drawn \(T0 picture, or T1\/T2 parts \+ first frame\) after 0\.3s \(state=\{.*"city":false.*\}\)$/);
  });

  test('the default bound is 120 s, never unbounded (no timeoutMs given)', async ({ page }) => {
    expect(STATE_WAIT_MS).toBe(120_000);
    await openCity(page);
    const seen = recordTimeouts(page);
    const err = await waitState(page, 'waits.spec: default bound', () => false).then(() => null, (e: unknown) => e as Error);
    await waitDrawn(page).catch(() => undefined); // records waitDrawn's bound too; whether it draws in 300 ms doesn't matter
    expect(seen, 'waitState and waitDrawn pass the 120 s default to waitForFunction (0 would be unbounded)').toEqual([120_000, 120_000]);
    expect(err!.message).toMatch(/^waits\.spec: default bound after 120s \(state=\{.*\}\)$/);
  });
});
