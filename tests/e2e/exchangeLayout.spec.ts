import { expect, test } from '@playwright/test';
import { bodySidewaysOverflow, goTo, isPhone, noHorizontalOverflow, register, shrinkWindowToMinimum, skipTips, watchErrors } from './helpers';

// The Exchange at its minimum window (420 x 300, src/shell/apps.ts): every tab fits without a sideways scroll, and the
// figures on each tab stay on one line. The phone is full screen, so there the same tabs are checked for the page's own
// sideways scroll. No world time is advanced here, so the spec runs in every project.
const TABS = ['stocks', 'ipos', 'funds', 'mine', 'manage'] as const;

test('the exchange fits its minimum window on every tab, with no figure split across lines', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'exchange');
  await expect(page.getByTestId('exchange-view')).toBeVisible({ timeout: 30_000 });
  if (!isPhone(page)) {
    const size = await shrinkWindowToMinimum(page, 'exchange');
    expect(size.width).toBeLessThanOrEqual(430);
    expect(size.height).toBeLessThanOrEqual(320);
  }
  for (const tab of TABS) {
    await page.getByTestId(`tab-${tab}`).click();
    if (isPhone(page)) await noHorizontalOverflow(page);
    else expect(await bodySidewaysOverflow(page, 'exchange'), `${tab} tab sideways overflow`).toBeLessThanOrEqual(1);
    // every stat value on the tab is one line of text inside its box
    const split = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="exchange-stat-"] .num')).map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      return { text: el.textContent ?? '', lines };
    }).filter((x) => x.lines > 1).map((x) => x.text));
    expect(split, `${tab} tab split figures`).toEqual([]);
    // every figure on the tab (every .num, not only the stat row) is whole: no ellipsis, nothing cut at the box edge.
    // Prose values (`Fact prose`) may wrap at spaces, but must still fit their box.
    const clipped = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="exchange-view"] .num')).map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent ?? '',
        ellipsis: cs.textOverflow === 'ellipsis',
        cut: el.scrollWidth > el.clientWidth + 1,
      };
    }).filter((x) => x.ellipsis || x.cut).map((x) => x.text));
    expect(clipped, `${tab} tab clipped figures`).toEqual([]);
  }
  expect(errors).toEqual([]);
});
