import { test } from '@playwright/test';
import { expect, openCity, waitDrawn, waitState } from './helpers';

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
});
