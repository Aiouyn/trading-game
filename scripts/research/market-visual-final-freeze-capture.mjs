import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const root = 'proof/memecoin-visual-20261015/final-settled-risk';
await mkdir(root,{recursive:true});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1600,height:1050},locale:'fr-FR'});
const captures=[];
try {
  await page.goto('http://localhost:3010/?world=8795');
  await page.getByTestId('onboarding-start').click({timeout:20000});
  const handle = `visual${Date.now().toString().slice(-9)}`;
  await page.getByTestId('handle').fill(handle);
  await page.getByTestId('enter-world').click();
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-game')==='ready',{timeout:30000});
  await page.getByTestId('shelf-app-launchpad').click();
  await page.getByTestId('win-launchpad').getByTestId('win-launchpad-fill').click();
  await page.waitForTimeout(400);
  for (const ticker of ['TZSL','HUQB','UKC','WLLK']) {
    await page.getByTestId('tab-new').click();
    await page.getByTestId(`lp-open-${ticker}`).click();
    await page.getByTestId('lp-token-page').waitFor({state:'visible'});
    for(const tf of ['1m','5m']) {
      await page.getByTestId(`lp-tf-${tf}`).click();
      await page.waitForTimeout(450);
      const path=`${root}/game-${ticker}-${tf}-final-8795.png`;
      await page.getByTestId('win-launchpad').screenshot({path});
      captures.push({ticker,tf,path,capturedAtUtc:new Date().toISOString(),url:'http://localhost:3010/?world=8795'});
    }
    await page.getByTestId('lp-back').click();
  }
  console.log(JSON.stringify({ok:true,captures},null,2));
} catch(e) { console.error(JSON.stringify({ok:false,error:String(e),captures},null,2)); process.exitCode=1; }
finally { await browser.close(); }
