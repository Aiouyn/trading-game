import { chromium } from '/workspace/trading-game/review/app/node_modules/playwright/index.mjs';
const out='/workspace/trading-game/design/redesign/'; const src='file:///workspace/trading-game/design/redesign/src/';
const which=process.argv[2]||'all';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const slugs=['ink-brass','broadsheet','phosphor','riviera'];
async function shot(url,w,h,path){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});p.on('pageerror',e=>console.log('ERR',url,e.message));await p.goto(url);await p.waitForTimeout(700);await p.screenshot({path});await p.close();console.log('wrote',path)}
for(const s of slugs){
  if(which==='all'||which==='desktop') await shot(src+'desktop.html?p='+s,1440,900,out+s+'-desktop.png');
  if(which==='all'||which==='phone') await shot(src+'phone.html?p='+s,390,844,out+s+'-phone.png');
}
if(which==='all'||which==='phone'||which==='recents') await shot(src+'phone.html?p=ink-brass&recents=1',390,844,out+'ink-brass-phone-recents.png');
for(const [c,w,h] of [['window-desktop',1440,900],['window-closed-phone',390,844],['guarantee-phone',390,844]]){ if(which==='all'||which==='company'||which===c) await shot(src+'company-'+c+'.html',w,h,out+'company-'+c+'.png'); }
for(const c of ['founder','preipo']){ if(which==='all'||which==='company'||which===c){ await shot(src+'company-'+c+'-desktop.html',1440,900,out+'company-'+c+'-desktop.png'); await shot(src+'company-'+c+'-phone.html',390,844,out+'company-'+c+'-phone.png'); } }
if(which==='all'||which==='overview') await shot(src+'overview.html',1680,1000,out+'palettes-overview.png');
await b.close();
