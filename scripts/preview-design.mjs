import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
await mkdir('design/proposals', { recursive: true });
const problems = [];
for (const device of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone', width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: device, isMobile: device.name === 'phone', hasTouch: device.name === 'phone' });
  const page = await context.newPage();
  page.on('pageerror', error => problems.push(error.message));
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.goto('http://localhost:3010/?seed=visual-review&fresh');
  await page.waitForFunction(() => !!window.__tg, { timeout: 60000 });
  await page.evaluate(() => window.__tg.pause());
  for (const look of ['daylight', 'afterhours', 'pocket']) {
    if (device.name === 'desktop') await page.getByRole('button', { name: 'Choose a visual direction' }).click();
    else await page.getByTestId('open-appearance').click();
    await page.getByTestId(`look-${look}`).click();
    await page.getByRole('button', { name: 'Show home screen' }).click();
    await page.screenshot({ path: `design/proposals/${look}-${device.name}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 0) problems.push(`${device.name} ${look}: horizontal overflow ${overflow}`);
  }
  await page.getByRole('button', { name: 'Open Markets', exact: true }).click();
  await page.getByTestId('chart-price').waitFor();
  await page.screenshot({ path: `design/proposals/markets-${device.name}.png` });
  await page.getByRole('button', { name: 'Open My life', exact: true }).click();
  await page.getByRole('button', { name: 'Preview a drive' }).click();
  await page.screenshot({ path: `design/proposals/garage-${device.name}.png` });
  console.log(`${device.name}: home, all three appearances, markets, garage reviewed`);
  await context.close();
}
await browser.close();
if (problems.length) { console.error(problems); process.exitCode = 1; }
