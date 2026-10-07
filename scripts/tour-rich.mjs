// Tour of the late-game screens: registers a player, grants $8M through the dev admin endpoint
// (world server started with ADMIN_TOKEN), then visits the Lab, Security, options and luxury shop.
// Usage: node scripts/tour-rich.mjs [webUrl] [worldUrl] [adminToken] [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const web = process.argv[2] ?? 'http://localhost:3000';
const world = process.argv[3] ?? 'http://localhost:8787';
const admin = process.argv[4] ?? 'devtoken';
const out = process.argv[5] ?? 'tour-out';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const handle = `rich${Math.floor(Math.random() * 1e6)}`;
await page.goto(web);
await page.getByTestId('onboarding-start').click();
await page.getByTestId('handle').fill(handle);
await page.getByTestId('enter-world').click();
await page.waitForSelector('html[data-game=ready]', { state: 'attached', timeout: 30000 });
const r = await fetch(`${world}/api/admin/grant`, { method: 'POST', headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' }, body: JSON.stringify({ handle, amount: 8_000_000 }) });
console.log('grant', r.status);
await page.waitForSelector('[data-testid=rankup-overlay]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(4500);
await page.screenshot({ path: `${out}/rich-00-rankup.png` });
await page.getByTestId('rankup-skip').click().catch(() => {});
await page.getByTestId('coach').getByText('Skip tips').click().catch(() => {});
await page.getByTestId('open-chain').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/rich-01-chain.png` });
await page.keyboard.press('Escape');
for (const s of ['lab', 'security', 'estate']) {
  await page.getByTestId(`nav-${s}`).click();
  await page.waitForTimeout(600);
  if (s === 'estate') await page.getByTestId('tab-shop').click();
  if (s === 'lab') {
    await page.getByTestId('start-rules').click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${out}/rich-${s}.png` });
}
await page.getByTestId('nav-empire').click();
await page.getByTestId('tab-buy').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/rich-empire.png` });
await browser.close();
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
