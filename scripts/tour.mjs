// Screenshot tour of the live game: registers a fresh player through the UI, plays a little and
// captures every screen at desktop and phone sizes. Needs `npm run world` and the web app running.
// Usage: node scripts/tour.mjs [webUrl=http://localhost:3000] [outDir=tour-out]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const web = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'tour-out';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function run(name, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.goto(web);
  await page.getByTestId('onboarding-start').click();
  await page.screenshot({ path: `${out}/${name}-00-coldopen.png` });
  await page.getByTestId('handle').fill(`tour${Math.floor(Math.random() * 1e6)}`);
  await page.getByTestId('enter-world').click();
  await page.waitForSelector('html[data-game=ready]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-01-market.png` });
  const phone = viewport.width < 768;
  // buy a little HLCN (first trade is capped at 20% of cash)
  if (phone) await page.getByTestId('open-trade').click();
  await page.getByTestId('order-qty').fill('3');
  await page.screenshot({ path: `${out}/${name}-02-ticket.png` });
  await page.getByTestId('order-submit').click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}-03-after-fill.png` });
  if (phone) await page.keyboard.press('Escape');
  const screens = ['portfolio', 'empire', 'estate', 'lab', 'security', 'court', 'social', 'wire', 'profile'];
  for (const [i, s] of screens.entries()) {
    if (phone) {
      if (['portfolio', 'empire', 'estate'].includes(s)) await page.getByTestId(`tab-${s}`).click();
      else { await page.getByTestId('tab-more').click(); await page.getByTestId(`more-${s}`).click(); }
    } else {
      await page.getByTestId(`nav-${s}`).click();
    }
    await page.waitForTimeout(700);
    if (s === 'empire') {
      await page.getByTestId('tab-buy').click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${out}/${name}-${String(i + 4).padStart(2, '0')}-${s}.png`, fullPage: phone });
  }
  await ctx.close();
}

await run('desktop', { width: 1440, height: 900 });
await run('phone', { width: 390, height: 844 });
await browser.close();
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
