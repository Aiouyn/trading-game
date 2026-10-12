import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, WORLD, goTo, isPhone, noHorizontalOverflow, proof, register, skipTips, watchErrors } from './helpers';

// 6C: an insider tip reaches the player's Messages as a NON-PUBLIC card, and a regulator inquiry arrives in the Legal & Court app
// as a letter in three parts. Both are seeded through the admin routes (token-gated, like the other seams), which run the game's
// own delivery and notice code. The screens never show a score, evidence or an outcome. REG_SHOTS_DIR writes the review screens.

const SHOTS = process.env.REG_SHOTS_DIR;

async function seed(path: '/api/admin/tip' | '/api/admin/inquiry', handle: string): Promise<void> {
  const r = await fetch(`${WORLD}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ handle }),
  });
  expect(r.status).toBe(200);
  const body = (await r.json()) as { ok: boolean; error?: string };
  // a stock with no report ahead refuses the seed: the spec then has nothing to show
  expect(body.error ?? '').not.toContain('no report ahead');
  expect(body.ok).toBe(true);
}

async function shot(page: Page, lang: 'en' | 'fr', name: string): Promise<void> {
  await proof(page, `regulator-${lang}-${name}`);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    const tag = isPhone(page) ? 'phone' : 'desktop';
    await page.screenshot({ path: `${SHOTS}/${tag}-${lang}-${name}.png` });
  }
}

test('an insider tip arrives as a NON-PUBLIC card in Messages, and an inquiry letter in the Legal app, in English and French', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const handle = await register(page, 'reg');
  await skipTips(page);

  await seed('/api/admin/tip', handle);
  await goTo(page, 'social');
  const tip = page.getByText(/NON-PUBLIC/).first();
  await expect(tip).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Non-public tip').first()).toBeVisible();
  // the card gives the claim and the report, never the outcome
  await expect(page.getByText(/truth/i)).toHaveCount(0);
  await noHorizontalOverflow(page);
  await shot(page, 'en', 'tip');

  await seed('/api/admin/inquiry', handle);
  await goTo(page, 'court');
  await expect(page.getByTestId('eca-view')).toBeVisible({ timeout: 20_000 });
  const letter = page.locator('[data-testid^="eca-letter-"]').first();
  await expect(letter).toBeVisible();
  await expect(letter.getByText('What happened')).toBeVisible();
  await expect(letter.getByText('Why')).toBeVisible();
  await expect(letter.getByText('What to do')).toBeVisible();
  // no score, no evidence points, no verdict before one is made
  await expect(page.getByTestId('eca-view').getByText(/score|evidence points/i)).toHaveCount(0);
  await noHorizontalOverflow(page);
  await letter.scrollIntoViewIfNeeded();
  await shot(page, 'en', 'inquiry');

  // the same two screens in French (the game's own language setting)
  await goTo(page, 'settings');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await goTo(page, 'court');
  await expect(page.getByTestId('eca-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('eca-view').getByText('Régulateur des marchés (ECA)')).toBeVisible();
  await expect(page.locator('[data-testid^="eca-letter-"]').first().getByText('Ce qui s’est passé')).toBeVisible();
  await page.locator('[data-testid^="eca-letter-"]').first().scrollIntoViewIfNeeded();
  await shot(page, 'fr', 'inquiry');
  await goTo(page, 'social');
  await expect(page.getByText('Information non publique').first()).toBeVisible();
  await shot(page, 'fr', 'tip');

  expect(errors).toEqual([]);
});
