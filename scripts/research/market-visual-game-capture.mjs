import { chromium } from 'playwright';

const symbols = ['TZSL', 'ENI', 'HUQB', 'UKC', 'LUU', 'YFP', 'MWTV', 'WLLK'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
await page.goto('http://localhost:3010/?world=8791', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);
await page.getByText('Commencer', { exact: true }).click();
await page.waitForTimeout(120);
await page.getByText('Entrer à Port Avalon', { exact: true }).click();
await page.waitForTimeout(80);
await page.getByLabel('Pseudo').fill('MarketAuditSeries');
await page.getByRole('button', { name: 'Entrer à Port Avalon' }).click();
await page.waitForTimeout(1000);
await page.getByText('Crypto', { exact: true }).click();
await page.waitForTimeout(200);
const search = page.getByPlaceholder(/Rechercher parmi/);
for (const symbol of symbols) {
  await search.fill(symbol);
  await page.waitForTimeout(150);
  const item = page.getByText(symbol, { exact: true }).first();
  await item.click({ timeout: 5000 });
  await page.waitForTimeout(300);
  for (const tf of ['1m', '5m']) {
    await page.getByText(tf, { exact: true }).first().click();
    await page.waitForTimeout(250);
    const path = `proof/memecoin-visual-20261015/before/game-${symbol}-${tf}.png`;
    await page.screenshot({ path });
    console.log(JSON.stringify({ symbol, tf, path, capturedAt: new Date().toISOString() }));
  }
  await search.fill('');
}
await browser.close();
