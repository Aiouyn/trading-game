import { chromium } from 'playwright';

const symbols = ['TZSL', 'ENI', 'HUQB', 'UKC', 'LUU', 'YFP', 'MWTV', 'WLLK'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
await page.goto('http://localhost:3010/?world=8792', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(200);
await page.getByText('Commencer', { exact: true }).click();
await page.waitForTimeout(100);
await page.getByText('Entrer à Port Avalon', { exact: true }).click();
await page.waitForTimeout(50);
await page.getByLabel('Pseudo').fill(`MarketAuditAfter${Math.floor(Math.random() * 10000)}`);
await page.getByRole('button', { name: 'Entrer à Port Avalon' }).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Lancement' }).click();
await page.waitForTimeout(250);
const lpWindow = page.locator('[data-app="launchpad"]');
const lpWindowId = await lpWindow.getAttribute('data-testid');
await page.getByTestId(`${lpWindowId}-fill`).click();
await page.waitForTimeout(200);
for (const symbol of symbols) {
  await page.getByText(symbol, { exact: true }).first().click({ timeout: 5000 });
  const tokenPage = page.getByTestId('lp-token-page');
  await tokenPage.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(200);
  await tokenPage.evaluate((el) => { el.scrollTop = 0; });
  for (const tf of ['1m', '5m']) {
    await page.getByTestId(`lp-tf-${tf}`).click();
    await page.waitForTimeout(200);
    const path = `proof/memecoin-visual-20261015/after/game-${symbol}-${tf}-maximized.png`;
    await page.screenshot({ path });
    console.log(JSON.stringify({ symbol, tf, path, capturedAt: new Date().toISOString() }));
  }
  await page.getByTestId('lp-back').click();
  await page.waitForTimeout(100);
}
await browser.close();
