/** Read-only mature-save probe. No commands, writes or player details leave the snapshot. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { stepGame } from '../../src/world/game';
import type { GameState } from '../../src/world/types';
import { priceNow } from '../../src/world/launchpad/rug';
import { npcLaunchDraw } from '../../src/world/launchpad/launch';
import { netWorldMoney, bookedNet, engineTallyOf } from '../../src/world/company/exploits/sequences';

const db = new DatabaseSync(process.argv[2]!, {readOnly:true});
const row = db.prepare('SELECT tick,data FROM snapshots ORDER BY id DESC LIMIT 1').get() as {tick:number;data:string};
db.close();
const g = JSON.parse(row.data) as GameState;
const oldCoins = Object.keys(g.launchpad!.tokens).length;
const selected = [];
for (let i=0;i<12;i++) { npcLaunchDraw(g,null); selected.push(g.launchpad!.tokens[g.launchpad!.order.at(-1)!]!); }
const m0=netWorldMoney(g), b0=bookedNet(g), e0=engineTallyOf(g);
const returns:number[]=[]; const paths=selected.map(t=>({ticker:t.ticker,prices:[priceNow(g,t)]}));
let multi=0;
for(let k=0;k<120;k++) {
  const cashBefore = netWorldMoney(g), bookedBefore = bookedNet(g), engineBefore = engineTallyOf(g);
  const before=selected.map(t=>({p:priceNow(g,t),seq:t.tradeSeq??0}));
  stepGame(g);
  const residual = netWorldMoney(g)-cashBefore-(bookedNet(g)-bookedBefore)-(engineTallyOf(g)-engineBefore);
  if (Math.abs(residual) >= .005) console.log('unbooked full-world flow', {tick:g.market.tick,residual});
  selected.forEach((t,i)=>{const p=priceNow(g,t);returns.push(p/before[i]!.p-1);paths[i]!.prices.push(p);if((t.tradeSeq??0)-before[i]!.seq>=3)multi++;});
}
const abs=returns.map(Math.abs).sort((a,b)=>a-b);
const result={snapshotTick:row.tick,oldCoins,probeCoins:12,ticks:120,p95:abs[Math.floor(abs.length*.95)]!*100,p99:abs[Math.floor(abs.length*.99)]!*100,
  flatPct:returns.filter(x=>Math.abs(x)<1e-12).length/returns.length*100,up:Math.max(...returns)*100,down:Math.min(...returns)*100,
  burstPct:multi/returns.length*100,graduates:selected.filter(t=>t.status==='graduated').length,
  population:Object.keys(g.market.accounts).filter(id=>id.startsWith('lp:npc:trader:')).length,
  negativeCash: Object.entries(g.market.accounts).filter(([id,a])=>id.startsWith('lp:npc:trader:')&&a.cash<-.00001).length,
  moneyResidual:Math.abs(netWorldMoney(g)-m0-(bookedNet(g)-b0)-(engineTallyOf(g)-e0)),paths};
writeFileSync('proof/memecoin-history-fit/mature-world-replay.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,paths:undefined},null,2));
if (process.argv[3]) {
  const control=JSON.parse(readFileSync(process.argv[3],'utf8')) as typeof result;
  const delta=Math.abs(result.moneyResidual-control.moneyResidual);
  console.log('paired full-world accounting residual difference',delta);
  if (delta>=.005) process.exitCode=1;
}
if(result.negativeCash || result.population!==240)process.exitCode=1;
