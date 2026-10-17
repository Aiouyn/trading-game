import { createWorld, quote, shockValue, stepMany } from '../../src/engine/sim';
import { universeConfig } from '../../src/engine/universe';
const ids = ['AUSD','FLUX'];
const base = universeConfig({ ticksPerDay: 24 });
const cfg = { ...base, assets: base.assets.filter(a => ids.includes(a.id)), indices: [] };
const out:any = { revision:'be21a34', probe:'20 seeds; 24 ticks/game-day; 30 game-days after +25% lnV test shock; isolated AUSD/FLUX; default full ecology', assets:{} };
for (const id of ids) {
 const obs:any[]=[];
 for(let k=0;k<20;k++) {
  let s=createWorld(`stable-anchor-${k}`,cfg);
  s=shockValue(s,id,0.25);
  for(let d=0;d<30;d++) {
   s=stepMany(s,24).state;
   const q=quote(s,id); const a=s.assets[s.config.assets.findIndex(x=>x.id===id)]!;
   obs.push({seed:k,day:d+1,spot:q.price,fundamental:q.fundamental});
  }
 }
 const end=obs.filter(x=>x.day===30);
 out.assets[id]={count:obs.length,endCount:end.length,terminalSpotPct:{p10:quant(end.map(x=>100*(x.spot-1)),.1),median:quant(end.map(x=>100*(x.spot-1)),.5),p90:quant(end.map(x=>100*(x.spot-1)),.9)},terminalFundamentalPct:{p10:quant(end.map(x=>100*(x.fundamental-1)),.1),median:quant(end.map(x=>100*(x.fundamental-1)),.5),p90:quant(end.map(x=>100*(x.fundamental-1)),.9)},path:obs.filter(x=>x.seed===0 && [1,2,5,10,20,30].includes(x.day))};
}
function quant(xs:number[],p:number){xs.sort((a,b)=>a-b);return xs[Math.floor((xs.length-1)*p)]??0}
console.log(JSON.stringify(out,null,2));
