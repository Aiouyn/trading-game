import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { bodySidewaysOverflow, goTo, grant, grantLaunchCredit, isPhone, makeFiledLate, noHorizontalOverflow, register, shrinkWindowToMinimum, skipRankUp, skipTips, watchErrors } from './helpers';

// The O-16 and O-17 company views (p4/ui2): the staged Overview decision, the next-gen launch on R&D, the Filings tab and
// the CEO change on People. The founder is given a late-tier company with two filed quarters and a launch credit through
// the admin seams (helpers.ts), so the figures and the launch states are real. Checked at the app's minimum window (desktop)
// and at phone width: no sideways scroll, and no money figure that truncates or splits over lines. P4UI2_SHOTS, when set, is
// the folder the PNGs of each view are written to (en and fr, desktop and phone).

const VIEW_ROOT: Record<string, string> = { overview: 'company-overview', rd: 'company-rd', people: 'company-people', filings: 'company-filings' };
/** The new blocks whose figures must not truncate or split, by the tab each one is on (their numbers are money or counts). */
const FIGURE_SCOPES: Record<string, string> = { overview: 'company-decision', rd: 'company-launch', people: 'company-ceo', filings: 'company-filings' };

async function playerAtOwner(page: Page): Promise<string> {
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'company');
  return handle;
}

async function foundCompany(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('company-found')).toBeVisible();
  await page.getByTestId('company-name').fill(name);
  await page.getByTestId('company-found-submit').click();
  await expect(page.getByTestId('company-overview')).toBeVisible();
}

/** The money figures under a scope that are cut by their box or split over two lines (empty when every figure fits). */
async function badFigures(page: Page, scope: string): Promise<string[]> {
  return page.getByTestId(scope).evaluate((root) => {
    const bad: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      if (el.children.length > 0) continue;
      const text = (el.textContent ?? '').trim();
      if (!text || text.length > 18 || /[A-Za-z]/.test(text)) continue;
      if (el.scrollWidth > el.clientWidth + 1) bad.push(`cut:${text}`);
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
      if (tops.size > 1) bad.push(`split:${text}`);
    }
    return bad;
  });
}

test('the new company views fit the minimum window and the phone: no sideways scroll, no figure that truncates or splits', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await playerAtOwner(page);
  await foundCompany(page, 'Fit Co.');
  // a late company with two filed quarters, and a next-gen credit that reads ready (the largest launch form)
  await makeFiledLate(handle);
  await grantLaunchCredit(handle, 80);
  if (!isPhone(page)) await shrinkWindowToMinimum(page, 'company');
  for (const view of Object.keys(VIEW_ROOT)) {
    await page.getByTestId(`company-tab-${view}`).click();
    await expect(page.getByTestId(VIEW_ROOT[view]!)).toBeVisible();
    if (isPhone(page)) await noHorizontalOverflow(page);
    else expect(await bodySidewaysOverflow(page, 'company')).toBeLessThanOrEqual(1);
  }
  // the staged decision (with its figures), then the figures of each new block on its own tab
  await page.getByTestId('company-tab-overview').click();
  await page.getByTestId('company-decision-level-high').click();
  await page.getByTestId('company-decision-confirm').click();
  await expect(page.getByTestId('company-decision-staged')).toBeVisible();
  // the filed statements are on the page (not vacuous): two quarters, each with its figures
  await page.getByTestId('company-tab-filings').click();
  await expect(page.getByTestId('company-filing')).toHaveCount(2);
  await expect(page.getByTestId('company-filing-2-netIncome')).toBeVisible();
  // the CEO change: announced, so the pending state is what the figures are read in
  await page.getByTestId('company-tab-people').click();
  await page.getByTestId('company-ceo-submit').click();
  await page.getByTestId('company-ceo-submit-yes').click();
  await expect(page.getByTestId('company-ceo-pending')).toBeVisible();
  for (const [view, scope] of Object.entries(FIGURE_SCOPES)) {
    await page.getByTestId(`company-tab-${view}`).click();
    await expect(page.getByTestId(scope)).toBeVisible();
    const bad = await badFigures(page, scope);
    expect(bad, scope).toEqual([]);
  }
  expect(errors).toEqual([]);
});

const SHOTS = process.env.P4UI2_SHOTS;

/** A founder at the owner rank with a company (in en or fr), a late tier and two filed quarters, ready for the shots. */
async function shotFounder(page: Page, lang: 'en' | 'fr', name: string): Promise<string> {
  const handle = await playerAtOwner(page);
  if (lang === 'fr') {
    await goTo(page, 'profile');
    await page.getByTestId('settings-lang-fr').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await goTo(page, 'company');
  }
  await foundCompany(page, name);
  await makeFiledLate(handle);
  return handle;
}

/** Each new block is shot on its own: an element shot scrolls it into view, where the phone's own scroll is not in the way. */
async function shoot(page: Page, file: string, view: string, locator: Locator): Promise<void> {
  await page.getByTestId(`company-tab-${view}`).click();
  await expect(page.getByTestId(VIEW_ROOT[view]!)).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: file });
}

for (const lang of ['en', 'fr'] as const) {
  test(`the O-17 and O-16 company views in ${lang} are written as PNGs (P4UI2_SHOTS)`, async ({ page }, info) => {
    test.skip(!SHOTS, 'set P4UI2_SHOTS to a folder to write the PNGs');
    mkdirSync(SHOTS!, { recursive: true });
    await shotFounder(page, lang, 'Lantern Roasting Co.');
    const project = info.project.name;
    const file = (name: string) => `${SHOTS}/${lang}-${project}-${name}.png`;
    // the Overview decision staged for the close, with its "was" tick and the line that it applies at the close
    await page.getByTestId('company-tab-overview').click();
    await page.getByTestId('company-decision-level-high').click();
    await page.getByTestId('company-decision-confirm').click();
    await expect(page.getByTestId('company-decision-staged')).toBeVisible();
    await shoot(page, file('decision-staged'), 'overview', page.getByTestId('company-decision'));
    // the Filings tab: the filed quarters, newest first, and the first filed statement on its own
    await shoot(page, file('filings-list'), 'filings', page.getByTestId('company-filings-list'));
    await shoot(page, file('filings-filed'), 'filings', page.getByTestId('company-filing').first());
    // the CEO change before the announcement, then the announced change with its recorded days
    await shoot(page, file('ceo-before'), 'people', page.getByTestId('company-ceo'));
    await page.getByTestId('company-ceo-submit').click();
    await page.getByTestId('company-ceo-submit-yes').click();
    await expect(page.getByTestId('company-ceo-pending')).toBeVisible();
    await shoot(page, file('ceo-pending'), 'people', page.getByTestId('company-ceo'));
  });

  for (const state of ['ready', 'not-ready'] as const) {
    test(`the next-gen launch ${state} in ${lang} is written as a PNG (P4UI2_SHOTS)`, async ({ page }, info) => {
      test.skip(!SHOTS, 'set P4UI2_SHOTS to a folder to write the PNGs');
      mkdirSync(SHOTS!, { recursive: true });
      const handle = await shotFounder(page, lang, 'Lantern Launch Co.');
      await grantLaunchCredit(handle, state === 'ready' ? 80 : 40);
      await shoot(page, `${SHOTS}/${lang}-${info.project.name}-launch-${state}.png`, 'rd', page.getByTestId('company-launch'));
    });
  }
}

// The day label in French (e): the top bar (desktop) and the phone's status clock say "Jour" and "J", never "Day" or "D".
test('the top bar and the phone clock show the day in French (Jour, J), not Day or D', async ({ page }) => {
  await playerAtOwner(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  if (isPhone(page)) {
    // the status clock is on the phone's home screen (the Quay mark goes there)
    await page.getByTestId('phone-quay').click();
    await expect(page.getByTestId('phone-clock')).toHaveText(/^J\d+ · \d\d:\d\d$/);
  } else {
    await expect(page.getByTestId('os-clock')).toHaveText(/^Jour \d+ · \d\d:\d\d$/);
  }
});
