import { expect, test } from '@playwright/test';
import { englishLines } from '../../src/i18n/frAudit';
import { ADMIN, WORLD, noHorizontalOverflow } from './helpers';

// Phase 8 (lead-phase8.md P8-3): the /admin page behind the admin token. The token is typed once and kept in the page's memory,
// never in storage. The spec pauses the shared e2e world for a moment, so it always resumes it (the finally block), and it
// checks the tick is held while paused.

const auth = { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' };

async function setPaused(paused: boolean): Promise<void> {
  const r = await fetch(`${WORLD}/api/admin/pause`, { method: 'POST', headers: auth, body: JSON.stringify({ paused }) });
  expect(r.status).toBe(200);
}

async function tickNow(): Promise<number> {
  const r = await fetch(`${WORLD}/api/admin/status`, { headers: auth });
  expect(r.status).toBe(200);
  return ((await r.json()) as { world: { tick: number } }).world.tick;
}

test.describe('the admin page', () => {
  test('asks for the token, refuses a wrong one, and never stores the token', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('admin-token')).toBeVisible();
    await page.getByTestId('admin-token').fill('not-the-token');
    await page.getByTestId('admin-token-submit').click();
    await expect(page.getByTestId('admin-error')).toContainText('not right');
    await expect(page.getByTestId('admin-status')).toHaveCount(0);
    await expect(page.getByTestId('backup-now')).toHaveCount(0);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toContain('not-the-token');
    expect(stored).not.toContain(ADMIN);
    await noHorizontalOverflow(page);
  });

  test('the API refuses every request without the token', async ({ request }) => {
    expect((await request.get(`${WORLD}/api/admin/status`)).status()).toBe(403);
    expect((await request.get(`${WORLD}/api/admin/status`, { headers: { authorization: 'Bearer nope' } })).status()).toBe(403);
    expect((await request.post(`${WORLD}/api/admin/backup`, { headers: { authorization: 'Bearer nope' } })).status()).toBe(403);
    expect((await request.post(`${WORLD}/api/admin/pause`, { headers: { authorization: 'Bearer nope' }, data: { paused: true } })).status()).toBe(403);
  });

  test('with the token: the readouts, back up now, pause and resume, and the actions are logged', async ({ page }) => {
    try {
      await page.goto('/admin');
      await page.getByTestId('admin-token').fill(ADMIN);
      await page.getByTestId('admin-token-submit').click();
      await expect(page.getByTestId('admin-tick')).toBeVisible();
      await expect(page.getByTestId('admin-online')).toContainText('online');
      await expect(page.getByTestId('admin-ticks')).toContainText('p50');
      await expect(page.getByTestId('admin-db')).toBeVisible();
      await expect(page.getByTestId('admin-tournament')).toContainText('idle');
      await expect(page.getByTestId('admin-text')).toContainText('Off');
      await noHorizontalOverflow(page);

      const rowsBefore = await page.getByTestId('backup-list').locator('tbody tr').count();
      await page.getByTestId('backup-now').click();
      await expect(page.getByTestId('admin-note')).toContainText('Backed up at tick');
      await expect(page.getByTestId('backup-list').locator('tbody tr')).toHaveCount(Math.min(rowsBefore + 1, 20));

      await page.getByTestId('pause-toggle').click();
      await expect(page.getByTestId('admin-note')).toContainText('paused');
      await expect(page.getByTestId('pause-toggle')).toHaveText('Resume world');
      const held = await tickNow();
      await page.waitForTimeout(2500);
      expect(await tickNow()).toBe(held);

      await page.getByTestId('pause-toggle').click();
      await expect(page.getByTestId('admin-note')).toContainText('running again');
      await expect(page.getByTestId('pause-toggle')).toHaveText('Pause world');
      await expect.poll(tickNow, { timeout: 15_000 }).toBeGreaterThan(held);

      await expect(page.getByTestId('admin-actions')).toContainText('backup');
      await expect(page.getByTestId('admin-actions')).toContainText('pause');
      await expect(page.getByTestId('admin-actions')).toContainText('resume');
    } finally {
      // the shared e2e world must keep running whatever happened above
      await setPaused(false);
    }
  });

  test('the admin page reads in French when the player chose French (P8-4)', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('tg-prefs', JSON.stringify({ lang: 'fr' }));
      } catch { /* private mode */ }
    });
    await page.goto('/admin');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByTestId('admin-token')).toBeVisible();
    await expect(page.getByText('Jeton d’administration', { exact: true })).toBeVisible();
    await page.getByTestId('admin-token').fill(ADMIN);
    await page.getByTestId('admin-token-submit').click();
    await expect(page.getByTestId('admin-tick')).toBeVisible();
    await expect(page.getByTestId('backup-now')).toHaveText('Sauvegarder maintenant');
    await expect(page.getByTestId('admin-text')).toContainText('Désactivée');
    const text = await page.getByTestId('admin-status').innerText();
    expect(englishLines(text)).toEqual([]);
    await noHorizontalOverflow(page);
  });
});
