import {test,expect} from '@playwright/test';
import {register,skipTips,goTo,noHorizontalOverflow,watchErrors} from './helpers';
import {mkdirSync} from 'node:fs';

test('terrain camera stays immersive, freely orbits and reveals a selected building',async({page},info)=>{
  const errors=watchErrors(page);
  await page.goto('/city-preview');
  const canvas=page.getByTestId('city-canvas');
  await expect(canvas).toHaveAttribute('data-renderer','webgl');
  await page.getByTestId('city-tour-lake').click();
  await expect(page.getByTestId('city-tour-lake')).toBeVisible();
  for(let i=0;i<15;i++)await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-zoom','1.000');
  const yaw=await canvas.getAttribute('data-yaw');
  const bounds=(await canvas.boundingBox())!;
  const x=bounds.x+bounds.width*.55,y=bounds.y+bounds.height*.55;
  await page.mouse.move(x,y);
  await page.mouse.down({button:'right'});
  await page.mouse.move(x+90,y+35,{steps:12});
  await page.mouse.up({button:'right'});
  await expect(canvas).not.toHaveAttribute('data-yaw',yaw!);
  await expect.poll(async()=>Number(await canvas.getAttribute('data-elevation'))).toBeGreaterThan(Math.PI/6);
  await noHorizontalOverflow(page);
  mkdirSync('proof/living-cities/final',{recursive:true});
  await page.screenshot({path:'proof/living-cities/final/'+info.project.name+'-lakeside-orbit.png'});
  await page.getByRole('button',{name:'Return to city overview'}).click();
  if(await page.locator('.city-directory-toggle').isVisible())await page.locator('.city-directory-toggle').click();
  await page.getByTestId('city-search').fill('HLCN');
  await page.getByTestId('city-building-HLCN').click();
  if(await page.locator('.city-mobile-close').isVisible())await page.locator('.city-mobile-close').click();
  await page.getByTestId('city-reveal').click();
  await expect(page.getByTestId('city-reveal')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'proof/living-cities/final/'+info.project.name+'-reveal.png'});
  await page.getByTestId('city-reveal').click();
  await expect(page.getByTestId('city-reveal')).toHaveAttribute('aria-pressed','false');
  expect(errors).toEqual([]);
});


test('public city artifacts contain only reference topology and static company identities',async({request})=>{
  const a=await request.get('/api/cities/avalon');expect(a.ok()).toBe(true);
  const city=await a.json();expect(city.buildings.length).toBeGreaterThan(400);
  expect(city.buildings.filter((b:{kind:string})=>b.kind==='hq')).toHaveLength(59);
  expect(JSON.stringify(city)).not.toMatch(/ownerId|incomePerDay|positions|orders|netWorth|account/);
  const same=await request.get('/api/cities/avalon?playerId=other&seed=other');
  expect(await same.json()).toEqual(city);
  expect((await request.get('/api/cities/unknown')).status()).toBe(404);
});

test('city atlas explores all personalities, selects a company and renders only on demand',async({page},info)=>{
  const errors=watchErrors(page);
  await page.goto('/city-preview');
  const canvas=page.getByTestId('city-canvas');
  await expect(canvas).toHaveAttribute('data-renderer','webgl',{timeout:30_000});
  await noHorizontalOverflow(page);
  for(const id of ['nordhaven','meridia','sundara','kaiyo','serena','avalon']){
    await page.getByTestId('city-tab-'+id).click();
    await expect(page.getByTestId('city-app')).toHaveAttribute('data-city',id);
    await expect(canvas).toHaveAttribute('data-renderer','webgl');
  }
  if((page.viewportSize()?.width??0)<621)await page.getByRole('button',{name:/Directory/}).click();
  await page.getByTestId('city-search').fill('HLCN');
  await page.getByTestId('city-building-HLCN').click();
  if((page.viewportSize()?.width??0)<621)await page.getByRole('button',{name:'Close',exact:true}).first().click();
  await expect(page.getByTestId('city-selection')).toContainText('Halcyon Systems');
  await expect(page.getByTestId('city-selection')).toContainText('Reference architecture');
  await page.getByTestId('city-night').click();
  await expect(page.getByTestId('city-night')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('city-rotate').click();
  await page.getByTestId('city-stage').selectOption('growth');
  await expect(page.getByTestId('city-selection')).toContainText('Halcyon Systems');
  await noHorizontalOverflow(page);
  await page.getByRole('button',{name:'Return to city overview'}).click();
  await expect(page.getByTestId('city-selection')).toHaveCount(0);
  const frames=await canvas.getAttribute('data-frames');
  await page.waitForTimeout(700);
  expect(await canvas.getAttribute('data-frames')).toBe(frames);
  mkdirSync('proof/living-cities',{recursive:true});
  await page.screenshot({path:'proof/living-cities/'+info.project.name+'.png'});
  expect(errors).toEqual([]);
});

test('WebGL loss has a city picture and an accessible working directory',async({page})=>{
  await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){
      if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;
      return Reflect.apply(get,this,[type,...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/city-preview');
  await expect(page.getByTestId('city-canvas')).toHaveAttribute('data-renderer','picture',{timeout:30_000});
  if((page.viewportSize()?.width??0)<621)await page.getByRole('button',{name:/Directory/}).click();
  await page.getByTestId('city-search').fill('Halcyon');
  await page.getByTestId('city-building-HLCN').click();
  if((page.viewportSize()?.width??0)<621)await page.getByRole('button',{name:'Close',exact:true}).first().click();
  await expect(page.getByTestId('city-selection')).toContainText('Halcyon Systems');
});

test('an owned shop opens its private address; company selection returns to the real Broker',async({page})=>{
  const errors=watchErrors(page);
  await register(page,'city');
  await skipTips(page);
  await goTo(page,'empire');
  await page.getByTestId('tab-buy').click();
  await page.getByTestId('buy-biz-food.street-food-cart').click();
  await page.getByTestId('biz-commit-confirm').click();
  await expect(page.locator('[data-testid^="biz-map-"]')).toBeVisible({timeout:15_000});
  const shopName=await page.evaluate(()=>window.__tg!.state().me?.businesses[0]?.name??null);
  await page.locator('[data-testid^="biz-map-"]').click();
  await expect(page.getByTestId('city-selection')).toBeVisible({timeout:30_000});
  expect(shopName).toBeTruthy();
  await expect(page.getByTestId('city-selection')).toContainText(shopName!);
  await expect(page.getByTestId('city-canvas')).toHaveAttribute('data-renderer','webgl');
  if((page.viewportSize()?.width??0)<621)await page.getByRole('button',{name:/Directory/}).click();
  await page.getByTestId('city-search').fill('HLCN');
  await page.getByTestId('city-building-HLCN').click();
  if((page.viewportSize()?.width??0)<621)await page.getByRole('button',{name:'Close',exact:true}).first().click();
  await page.getByRole('button',{name:'Open in Broker ↗'}).click();
  await expect(page).toHaveURL(/\/broker(?:\/HLCN|\?t=HLCN)/);
  expect(errors).toEqual([]);
});

