/** Paired NPC-only full-game probe. --legacy isolates the previous crowd for a control run. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, stepGame } from '../../src/world/game';
import { npcLaunchDraw } from '../../src/world/launchpad/launch';
import { priceNow } from '../../src/world/launchpad/rug';
import { MICROFLOW } from '../../src/world/launchpad/microflow';
import { bookedNet, engineTallyOf, netWorldMoney } from '../../src/world/company/exploits/sequences';

const legacy = process.argv.includes('--legacy');
MICROFLOW.enabled = !legacy;
const seeds = ['audit-a','audit-b','audit-c','audit-d','holdout-a','holdout-b','holdout-c','holdout-d'];
const returns: number[] = [];
const activeReturns: number[] = [];
let burstTicks=0, total=0, graduations=0, maxResidual=0;
const started=performance.now();
for (const seed of seeds) {
  const g=createGame(seed,{warmupDays:0,npcs:false});
  for(let i=0;i<10;i++) npcLaunchDraw(g,null);
  const tokens=Object.values(g.launchpad!.tokens);
  const m0=netWorldMoney(g), b0=bookedNet(g), e0=engineTallyOf(g);
  for(let k=0;k<720;k++) {
    const before=tokens.map(t=>({price:priceNow(g,t),seq:t.tradeSeq??0,status:t.status}));
    stepGame(g);
    tokens.forEach((t,i)=>{
      const old=before[i]!;
      if(old.status==='dead') return;
      const r=priceNow(g,t)/old.price-1;
      returns.push(r);
      if(Math.abs(r)>1e-12) activeReturns.push(r);
      if((t.tradeSeq??0)-old.seq>=3) burstTicks++;
      total++;
    });
  }
  graduations+=tokens.filter(t=>t.status==='graduated').length;
  maxResidual=Math.max(maxResidual,Math.abs((netWorldMoney(g)-m0)-(bookedNet(g)-b0)-(engineTallyOf(g)-e0)));
}
function summarize(values:number[]) {
  const abs=values.map(Math.abs).sort((a,b)=>a-b);
  const q=(p:number)=>abs[Math.floor(p*(abs.length-1))]!*100;
  return {n:values.length,p50:q(.5),p90:q(.9),p95:q(.95),p99:q(.99),p999:q(.999),
    atLeast5:values.filter(r=>Math.abs(r)>=.05).length/values.length*100,
    atLeast20:values.filter(r=>Math.abs(r)>=.2).length/values.length*100,
    up:Math.max(...values)*100,down:Math.min(...values)*100};
}
const result={mode:legacy?'legacy-control':'funded-flow',seeds:seeds.length,tokens:80,ticksPerToken:720,
  all:summarize(returns),moving:summarize(activeReturns),unchanged:(1-activeReturns.length/returns.length)*100,
  burstTicks,burstShare:burstTicks/total*100,graduations,maxMoneyResidual:maxResidual,
  elapsedSeconds:(performance.now()-started)/1000};
mkdirSync('balance-out',{recursive:true});
writeFileSync(`balance-out/memecoin-cadence-${legacy?'legacy':'funded'}.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(maxResidual>=.005) process.exitCode=1;
