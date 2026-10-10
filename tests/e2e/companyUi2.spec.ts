import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { bodySidewaysOverflow, goTo, grant, isPhone, noHorizontalOverflow, register, shrinkWindowToMinimum, skipRankUp, skipTips, watchErrors } from './helpers';

// The O-16 and O-17 company views (p4/ui2): the staged Overview decision, the next-gen launch on R&D, the Filings tab and
// the CEO change on People. Checked at the app's minimum window (desktop) and at phone width: no sideways scroll, and no
// money figure that truncates or splits over lines. P4UI2_SHOTS, when set, is the folder the PNGs of each view are written to
// (en and fr, desktop and phone).

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
  await playerAtOwner(page);
  await foundCompany(page, 'Fit Co.');
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
  for (const [view, scope] of Object.entries(FIGURE_SCOPES)) {
    await page.getByTestId(`company-tab-${view}`).click();
    await expect(page.getByTestId(scope)).toBeVisible();
    const bad = await badFigures(page, scope);
    expect(bad, scope).toEqual([]);
  }
  expect(errors).toEqual([]);
});

const SHOTS = process.env.P4UI2_SHOTS;

for (const lang of ['en', 'fr'] as const) {
  test(`the new company views in ${lang} are written as PNGs (P4UI2_SHOTS)`, async ({ page }, info) => {
    test.skip(!SHOTS, 'set P4UI2_SHOTS to a folder to write the PNGs');
    mkdirSync(SHOTS!, { recursive: true });
    await playerAtOwner(page);
    if (lang === 'fr') {
      await goTo(page, 'profile');
      await page.getByTestId('settings-lang-fr').click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await goTo(page, 'company');
    }
    await foundCompany(page, 'Lantern Roasting Co.');
    await page.getByTestId('company-decision-level-high').click();
    await page.getByTestId('company-decision-confirm').click();
    await expect(page.getByTestId('company-decision-staged')).toBeVisible();
    const project = info.project.name;
    // each new block is shot on its own: an element shot scrolls it into view, where the phone's own scroll is not in the way
    const shoot = async (view: string, blocks: string[]) => {
      await page.getByTestId(`company-tab-${view}`).click();
      await expect(page.getByTestId(VIEW_ROOT[view]!)).toBeVisible();
      for (const block of blocks) {
        await page.getByTestId(block).scrollIntoViewIfNeeded();
        await page.getByTestId(block).screenshot({ path: `${SHOTS}/${lang}-${project}-${block}.png` });
      }
    };
    await shoot('overview', ['company-decision']);
    await shoot('rd', ['company-launch']);
    await shoot('filings', ['company-filings-list']);
    await shoot('people', ['company-ceo']);
  });
}
