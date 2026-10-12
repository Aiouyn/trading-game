import { expect, test, type Page } from '@playwright/test';
import fr from '../../src/i18n/fr.json';
import { englishLines, FR_AUDIT_ALLOWLIST, FR_SWEEP_NAMES } from '../../src/i18n/frAudit';
import { APP_IDS } from '../../src/shell/apps';
import { goTo, grant, register, skipRankUp, skipTips, watchErrors } from './helpers';

// PHASE 8 (lead-phase8.md P8-4): the French sweep. With the game in French, every app is opened on the desktop and on the
// phone, and no visible English sentence is left on screen. The heuristic (src/i18n/frAudit.ts) reads a line with three or
// more words and an English stopword as English, and the reviewed allowlist names the proper names and commands that stay.
// The sweep runs in the desktop (1440x900) and phone (390x844) projects.

/** The French values of the allowlisted keys: a line that carries one of them is a name or a command, not English. */
const ALLOWED = [...FR_AUDIT_ALLOWLIST.map((k) => (fr as Record<string, string>)[k] ?? ''), ...FR_SWEEP_NAMES];

/** The text a player can see: the rendered text of every shown element, plus the placeholders of the visible fields. */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]'))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.placeholder);
    return [document.body.innerText, ...fields].join('\n');
  });
}

test('French sweep: no visible English sentence in any app', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  const handle = await register(page, 'frs');
  await skipTips(page);
  // an operator (R3) opens every app: the rank gates the Company, the AI Lab, Security and Research tiles
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  const found: string[] = [];
  for (const app of APP_IDS) {
    await goTo(page, app);
    await page.waitForTimeout(400);
    for (const line of englishLines(await visibleText(page), ALLOWED)) found.push(`${app}: ${line}`);
  }

  expect(found, found.join('\n')).toEqual([]);
  expect(errors).toEqual([]);
});

// The top bar's money in French (lead review of the 1280 shot): the desktop figures read 8 000 000,00 $ with the decimal
// comma and the dollar sign after the figure, and the phone's compact figures read 8 M$. No figure reads $8.
test('French top bar: cash and net worth use the French money format', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page, 'frt');
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  const cash = page.locator('[data-testid="os-cash"], [data-testid="os-phone-cash"]').first();
  const networth = page.locator('[data-testid="os-networth"], [data-testid="os-phone-networth"]').first();
  const phone = (page.viewportSize()?.width ?? 1440) < 768;
  if (phone) {
    // the phone's status bar is compact: "8 M$" (a no-break space, then the unit and the dollar sign)
    await expect(cash).toContainText(/\d\u00a0(k|M|Md)\$/);
    await expect(networth).toContainText(/\d\u00a0(k|M|Md)\$/);
  } else {
    // the desktop top bar keeps the cents: "8 000 000,00 $" (a decimal comma, the dollar sign after the figure)
    await expect(cash).toContainText(/\d,\d{2}\u00a0\$/);
    await expect(networth).toContainText(/\d,\d{2}\u00a0\$/);
  }
  await expect(cash).not.toContainText(/\$\d/);
  await expect(networth).not.toContainText(/\$\d/);
  expect(errors).toEqual([]);
});
