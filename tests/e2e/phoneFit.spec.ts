import { expect, test, type Page } from '@playwright/test';
import { goTo, grant, noHorizontalOverflow, register, watchErrors } from './helpers';

// The phone's fit checks (the windows evaluation, problems 14 and 15 and the phone rows of the Wire and the Exchange). Each
// check runs in English and in French, because the labels are longer in French: the home labels keep their own boxes, the status
// clock stays on one line, the status money has its full figure in its tooltip, the Broker's Markets tab is on screen at load and
// its trade label is never cut, the Wire filter chips and the Exchange tabs are never clipped, and a notice on the home screen sits
// above the dock. The desktop project runs the Wire and Exchange checks only (the row layout there is unchanged).

/** Where the proof shots go: the e2e proof folder, or PHONE_FIT_SHOTS for a local before and after pass. */
const SHOTS = process.env.PHONE_FIT_SHOTS ?? 'test-results/proof';

interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }

/** The rect of the first element matching the selector, or null. */
async function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

/** Two rects overlap by more than a pixel. */
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
}

/** The rank-up takeover can cover the desk after a grant: skip it when it shows, and do nothing when it does not. */
async function skipUpdate(page: Page): Promise<void> {
  const skip = page.getByTestId('os-update-skip');
  if (await skip.isVisible({ timeout: 4_000 }).catch(() => false)) await skip.click({ timeout: 5_000 }).catch(() => undefined);
}

/** Switches the game to French from Settings, then checks the page is in French. */
async function french(page: Page): Promise<void> {
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
}

/** A fresh account with an operator's money (the rank-up is skipped), on the phone or the desktop. */
async function freshAccount(page: Page, prefix: string): Promise<void> {
  const handle = await register(page, prefix);
  await grant(handle, 5_000_000);
  await skipUpdate(page);
}

test.describe('phone and desktop fit', () => {
  for (const lang of ['en', 'fr'] as const) {
    test(`home: labels keep their own boxes, the clock is one line, the money has its full figure (${lang})`, async ({ page }, info) => {
      test.skip(info.project.name !== 'phone', 'the phone home');
      const errors = watchErrors(page);
      await freshAccount(page, `fh${lang}`);
      if (lang === 'fr') await french(page);
      await page.getByTestId('phone-quay').click();
      await expect(page.getByTestId('home')).toBeVisible();

      const labels = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="home"] .os-app-nm, [data-testid="home-row"] .os-app-nm')).map((el) => {
        const r = el.getBoundingClientRect();
        return { text: (el.textContent ?? '').trim(), left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }));
      expect(labels.length).toBeGreaterThanOrEqual(8);
      const collisions: string[] = [];
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          if (overlaps(labels[i], labels[j])) collisions.push(`${labels[i].text} / ${labels[j].text}`);
        }
      }
      expect(collisions, 'home labels that run into each other').toEqual([]);

      const clock = await rectOf(page, '[data-testid="phone-clock"]');
      expect(clock && clock.height < 22, 'the status clock is one line').toBe(true);

      // the compact figure in the bar carries the full net worth in its tooltip (the home widget shows the same figure whole)
      const money = await page.evaluate(() => ({
        title: document.querySelector('[data-testid="phone-money"]')?.getAttribute('title') ?? '',
        home: document.querySelector('[data-testid="home-widget"] [data-testid="os-networth"]')?.textContent ?? '',
      }));
      expect(money.title.length, 'the status money has a tooltip').toBeGreaterThan(0);
      expect(money.title.replace(/\D/g, ''), 'the tooltip carries the whole net worth').toContain(money.home.replace(/\D/g, ''));
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `${SHOTS}/fit-phone-home-${lang}.png` });
      expect(errors).toEqual([]);
    });
  }

  for (const lang of ['en', 'fr'] as const) {
    test(`Broker on the phone: Markets is on screen at load, the trade label is whole (${lang})`, async ({ page }, info) => {
      test.skip(info.project.name !== 'phone', 'the phone Broker');
      const errors = watchErrors(page);
      await freshAccount(page, `fb${lang}`);
      if (lang === 'fr') await french(page);
      await goTo(page, 'broker');
      await expect(page.getByTestId('trade-bar')).toBeVisible();
      const viewport = page.viewportSize() ?? { width: 390, height: 844 };

      const markets = await rectOf(page, '[data-testid="dock-tab-markets"]');
      expect(markets, 'the Markets tab exists').not.toBeNull();
      expect(markets!.left >= 0 && markets!.right <= viewport.width, 'the Markets tab is on screen at load').toBe(true);
      const tabsClipped = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="broker-dock"] [role="tab"]')).filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > window.innerWidth).map((el) => el.textContent));
      expect(tabsClipped, 'no dock tab is clipped').toEqual([]);

      // the trade label, with no quantity typed yet: the whole label on one or two lines, never cut
      const cta = await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="bar-review"]') as HTMLElement | null;
        const span = btn?.querySelector('span') as HTMLElement | null;
        if (!btn || !span) return null;
        return { text: span.textContent ?? '', cut: span.scrollWidth > span.clientWidth + 1, inside: btn.getBoundingClientRect().right <= window.innerWidth };
      });
      expect(cta?.cut, `the trade label "${cta?.text}" is cut`).toBe(false);
      expect(cta?.inside, 'the trade button is on screen').toBe(true);
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `${SHOTS}/fit-phone-broker-${lang}.png` });
      expect(errors).toEqual([]);
    });
  }

  for (const lang of ['en', 'fr'] as const) {
    test(`Wire filters and Exchange tabs: every label is shown (${lang})`, async ({ page }, info) => {
      const phone = info.project.name === 'phone';
      const errors = watchErrors(page);
      await freshAccount(page, `fw${lang}`);
      if (lang === 'fr') await french(page);

      await goTo(page, 'wire');
      await expect(page.getByTestId('wire-view')).toBeVisible();
      const filters = await page.evaluate(() => {
        const group = document.querySelector('[data-testid="wire-view"] [role="group"]') as HTMLElement | null;
        if (!group) return null;
        const g = group.getBoundingClientRect();
        const chips = Array.from(group.querySelectorAll<HTMLElement>('button')).map((el) => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent ?? '').trim(), inside: r.left >= g.left - 1 && r.right <= g.right + 1 && r.top >= g.top - 1 && r.bottom <= g.bottom + 1, cut: el.scrollWidth > el.clientWidth + 1 };
        });
        return { groupClipped: group.scrollHeight > group.clientHeight + 1, chips };
      });
      expect(filters, 'the Wire filter row is there').not.toBeNull();
      expect(filters!.groupClipped, 'the Wire filter row is not clipped').toBe(false);
      expect(filters!.chips.filter((c) => !c.inside || c.cut).map((c) => c.text), 'Wire filter labels cut').toEqual([]);
      await page.screenshot({ path: `${SHOTS}/fit-${info.project.name}-wire-${lang}.png` });

      await goTo(page, 'exchange');
      await expect(page.getByTestId('exchange-view')).toBeVisible({ timeout: 10_000 });
      const tabs = await page.evaluate(() => {
        const list = document.querySelector('[data-testid="exchange-view"] [role="tablist"]') as HTMLElement | null;
        if (!list) return null;
        const l = list.getBoundingClientRect();
        return Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).map((el) => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent ?? '').trim(), inside: r.left >= l.left - 1 && r.right <= l.right + 1 && r.right <= window.innerWidth, cut: el.scrollWidth > el.clientWidth + 1 };
        });
      });
      expect(tabs, 'the Exchange tabs are there').not.toBeNull();
      expect(tabs!.filter((t) => !t.inside || t.cut).map((t) => t.text), 'Exchange tab labels cut or out of reach').toEqual([]);
      expect(tabs!.length).toBe(5);
      if (phone) await noHorizontalOverflow(page);
      await page.screenshot({ path: `${SHOTS}/fit-${info.project.name}-exchange-${lang}.png` });
      expect(errors).toEqual([]);
    });
  }

  test('a notice on the phone home sits above the dock labels', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'the phone home');
    const errors = watchErrors(page);
    await freshAccount(page, 'fnot');
    // a market buy of one share fills at once and raises the fill notice; the notice then drops on the home screen
    await goTo(page, 'broker');
    await page.getByTestId('bar-qty').fill('1');
    await page.getByTestId('bar-review').click();
    await page.getByTestId('order-submit').click();
    await expect(page.locator('[data-testid="os-toasts"] .os-toast').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('phone-quay').click();
    await expect(page.getByTestId('home')).toBeVisible();
    const toast = await rectOf(page, '[data-testid="os-toasts"] .os-toast');
    const dock = await rectOf(page, '[data-testid="home-row"]');
    expect(toast && dock, 'a notice and the dock both show').toBeTruthy();
    expect(toast!.bottom <= dock!.top, 'the notice is above the dock row').toBe(true);
    await page.screenshot({ path: `${SHOTS}/fit-phone-home-notice.png` });
    expect(errors).toEqual([]);
  });
});
