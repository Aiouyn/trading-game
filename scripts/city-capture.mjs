import { chromium } from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const phase=process.env.CITY_CAPTURE_PHASE??'review';
if(!/^[a-z0-9-]+$/.test(phase))throw new Error('Invalid capture phase');
const base=process.env.CITY_CAPTURE_URL??'http://localhost:3217';
const root='proof/living-cities/'+phase;
await mkdir(root,{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/city-preview');
  await page.locator('[data-renderer="webgl"]').waitFor({timeout:30000});
  await page.screenshot({path:root+'/01-city.png'});
  if(await page.getByTestId('city-tour-lake').count()){
    await page.getByTestId('city-tour-lake').click();
    await page.screenshot({path:root+'/02-lakeside.png'});
    await page.getByRole('button',{name:'Return to city overview'}).click();
  }
  await page.getByTestId('city-search').fill('HLCN');
  await page.getByTestId('city-building-HLCN').click();
  await page.screenshot({path:root+'/03-building.png'});
  if(await page.getByTestId('city-reveal').count()){
    await page.getByTestId('city-reveal').click();
    await page.screenshot({path:root+'/03b-revealed.png'});
    await page.getByTestId('city-reveal').click();
  }
  await page.getByTestId('city-rotate').click();
  await page.screenshot({path:root+'/04-rotation.png'});
  await page.getByTestId('city-night').click();
  await page.screenshot({path:root+'/05-night.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Return to city overview'}).click();
  await page.screenshot({path:root+'/06-phone.png'});
  if(process.env.CITY_CAPTURE_ALL==='1'){
    await page.setViewportSize({width:1440,height:960});
    for(const id of ['nordhaven','meridia','sundara','kaiyo','serena']){
      await page.getByTestId('city-tab-'+id).click();
      await page.locator('[data-renderer="webgl"]').waitFor();
      await page.screenshot({path:root+'/city-'+id+'.png'});
    }
  }
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Saved reviewed captures to '+root);
}finally{await browser.close();}

