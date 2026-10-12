import { expect, test, type Page } from '@playwright/test';
import { ageAccount, clearSheets, goTo, grant, isPhone, noHorizontalOverflow, register, skipRankUp, skipTips, watchErrors } from './helpers';
import { box, frame } from './shell/support';

// The Launchpad's layout (lead-launchpad.md L7): every tab and a token page fit the screen with no sideways scroll, no figure
// runs past the edge, and a figure never splits onto two lines. On the desktop the window is dragged to its minimum (420 x 300,
// apps.ts) and the same checks run inside it; on the phone (390) the tabs scroll sideways inside their own row, and the page does not.

const TPD = 720;
/** the launch gate's account age: three real days, which is 72 game days of ticks (LP.MIN_AGE_TICKS), plus a margin */
const MIN_AGE_TICKS = 3 * 24 * TPD + 10;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** A fresh ticker of four letters (the world refuses a ticker used in the last 30 game days). */
function randomTicker(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}
const TABS = ['tab-new', 'tab-trending', 'tab-graduated', 'tab-holdings', 'tab-create'] as const;

/** Every figure of the app is inside the given horizontal bounds, and none of them wraps onto a second line. */
async function figuresFit(page: Page, bounds?: { left: number; right: number }): Promise<void> {
  const bad = await page.evaluate((b) => {
    const left = b ? b.left : 0;
    const right = b ? b.right : document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[data-testid^="lp-"] .num:not(input)'))) {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const size = parseFloat(getComputedStyle(e).fontSize) || 14;
      const outside = r.right > right + 1 || r.left < left - 1;
      const wrapped = r.height > size * 2.2;
      if (outside || wrapped) out.push(e.textContent ?? '');
    }
    return out;
  }, bounds ?? null);
  expect(bad, 'figures that run past the edge or wrap').toEqual([]);
}

test('every Launchpad tab and a token page fit the screen: no sideways scroll, no cut or split figure', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const handle = await register(page, 'lplay');
  await grant(handle, 60_000);
  await ageAccount(handle, MIN_AGE_TICKS);
  await skipRankUp(page);
  await clearSheets(page);
  await skipTips(page);
  await goTo(page, 'launchpad');
  await expect(page.getByTestId('launchpad-view')).toBeVisible();
  for (const tab of TABS) {
    await page.getByTestId(tab).click();
    await noHorizontalOverflow(page);
    await figuresFit(page);
  }
  // the Create form and its console with a launch in it
  await page.getByTestId('tab-create').click();
  // a ticker of this run only: the desktop and phone projects share one world
  const ticker = randomTicker();
  await page.getByTestId('lp-name').fill(`Quiet ${ticker}`);
  await page.getByTestId('lp-ticker').fill(ticker);
  await page.getByTestId('lp-tagline-tg1').click();
  await page.getByTestId('lp-alloc').fill('3');
  await page.getByTestId('lp-launch').click();
  await expect(page.getByTestId('lp-launch-sent')).toBeVisible({ timeout: 20_000 });
  await noHorizontalOverflow(page);
  await figuresFit(page);
  await page.getByTestId(`lp-console-open-${ticker}`).click();
  await expect(page.getByTestId('lp-token-page')).toBeVisible();
  await noHorizontalOverflow(page);
  await figuresFit(page);
  expect(errors).toEqual([]);
});

test('the Launchpad at its minimum window, on the desktop: its figures stay inside the window', async ({ page }) => {
  test.skip(isPhone(page), 'the desktop window');
  test.setTimeout(240_000);
  const handle = await register(page, 'lpmin');
  await grant(handle, 60_000);
  await ageAccount(handle, MIN_AGE_TICKS);
  await skipRankUp(page);
  await clearSheets(page);
  await skipTips(page);
  await goTo(page, 'launchpad');
  await expect(page.getByTestId('launchpad-view')).toBeVisible();
  // drag the south-east grip far up and left: the window stops at its minimum (350 x 300, UX stage 6 side column)
  const grip = await page.getByTestId('win-launchpad-resize-se').boundingBox();
  if (grip === null) throw new Error('no south-east grip');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 900, grip.y - 900, { steps: 12 });
  await page.mouse.up();
  const r = await box(page, 'launchpad');
  expect(r.w).toBeGreaterThanOrEqual(349);
  expect(r.h).toBeGreaterThanOrEqual(299);
  const f = await frame(page, 'launchpad').boundingBox();
  if (f === null) throw new Error('no launchpad window');
  for (const tab of TABS) {
    await page.getByTestId(tab).click();
    await figuresFit(page, { left: f.x, right: f.x + f.width });
  }
});
