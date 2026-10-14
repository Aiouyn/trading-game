import { expect, test } from '@playwright/test';
import { ADMIN, WORLD, ageAccount, clearSheets, goTo, grant, register, skipRankUp, skipTips, worldFetch } from './helpers';

test('another trader sees a new launch immediately without a market tick', async ({page, browser}) => {
  const creator = await register(page,'lpnow');
  await grant(creator,60_000);
  await ageAccount(creator,3*24*720+10);
  await skipRankUp(page);
  await clearSheets(page);
  await skipTips(page);
  await goTo(page,'launchpad');
  await page.getByTestId('tab-create').click();
  const viewer = await browser.newPage({baseURL:new URL(page.url()).origin,viewport:page.viewportSize()!});
  try {
    await register(viewer,'lpwatch');
    await skipTips(viewer);
    await goTo(viewer,'launchpad');
    const pause = await worldFetch(`${WORLD}/api/admin/pause`,{method:'POST',headers:{authorization:`Bearer ${ADMIN}`,'content-type':'application/json'},body:JSON.stringify({paused:true})});
    expect(pause.status).toBe(200);
    const {tick} = await (await worldFetch(`${WORLD}/health`)).json();
    const ticker = Array.from({length:4},()=>String.fromCharCode(65+Math.floor(Math.random()*26))).join('');
    await page.getByTestId('lp-name').fill(`Instant ${ticker}`);
    await page.getByTestId('lp-ticker').fill(ticker);
    await page.getByTestId('lp-tagline-tg2').click();
    await page.getByTestId('lp-launch').click();
    await expect(viewer.getByTestId(`lp-row-${ticker}`)).toBeVisible({timeout:1000});
    await expect(viewer.getByTestId('lp-sort-new')).toHaveValue('created');
    await expect(viewer.locator('[data-testid="lp-table"] article').first()).toHaveAttribute('data-testid',`lp-row-${ticker}`);
    expect((await (await worldFetch(`${WORLD}/health`)).json()).tick).toBe(tick);
  } finally {
    await worldFetch(`${WORLD}/api/admin/pause`,{method:'POST',headers:{authorization:`Bearer ${ADMIN}`,'content-type':'application/json'},body:JSON.stringify({paused:false})});
    await viewer.close();
  }
});
