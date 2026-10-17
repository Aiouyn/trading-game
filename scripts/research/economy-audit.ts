/** Read-only audit experiments: creates isolated worlds; never connects to the running server. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createWorld, universeConfig, step, openAccount, placeOrder, halfSpread } from '../../src/engine';
import { clearOrders } from '../../src/engine/trading';
import { createGame, stepGame, applyCommand } from '../../src/world/game';
import { lpWorld, launch, CREATOR, TRADER } from '../../src/world/launchpad/fixture';
import { priceNow } from '../../src/world/launchpad/rug';
import { buyBuzz } from '../../src/world/launchpad/flow';
import { crowdTick } from '../../src/world/launchpad/crowd';
import { seedRetail, retailTick } from '../../src/world/retail';
import { stabilizerDay } from '../../src/world/boards';
import { adminFill } from '../../src/world/launchpad/commands';
import type { GameState } from '../../src/world/types';

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone = <T>(x:T):T => JSON.parse(JSON.stringify(x));
const q = (xs:number[],p:number) => xs[Math.floor((xs.length-1)*p)] ?? 0;
function stats(rs:number[]) {
  const a=rs.map(Math.abs).sort((a,b)=>a-b);
  const mean=rs.reduce((a,b)=>a+b,0)/rs.length;
  return {n:rs.length,absP50Pct:100*q(a,.5),absP95Pct:100*q(a,.95),absP99Pct:100*q(a,.99),
    maxAbsPct:100*(a.at(-1)??0),flatPct:100*rs.filter(x=>Math.abs(x)<1e-12).length/rs.length,
    sdPct:100*Math.sqrt(rs.reduce((a,b)=>a+(b-mean)**2,0)/rs.length)};
}
function economic(g:GameState) {return {market:g.market, flows:g.launchpad?.tokens.AUDIT?.flows, y:g.launchpad?.tokens.AUDIT?.y};}
const results:Record<string,unknown>={revision:'be21a34',generatedAt:new Date().toISOString(),ticksPerDay:720,secondsPerTick:5};

// Separate generated broker prints from actual account/price changes.
{
  const g=createGame('audit-retail',{warmupDays:0,npcs:false});seedRetail(g);
  const before=hash(g.market);retailTick(g);
  results.displayTape={marketUnchanged:before===hash(g.market),accounts:Object.keys(g.market.accounts).length,
    generatedPrints:Object.values(g.marketTape??{}).reduce((s,a)=>s+a.length,0),
    distinctDisplayedNames:new Set(Object.values(g.marketTape??{}).flat().map(x=>x.who)).size};
}

// Same seed, inputs and clock, only the social message differs.
for(const type of ['reply','chat'] as const) {
  const control=lpWorld('audit-messages');launch(control,CREATOR,'AUDIT');
  const treatment=clone(control);
  const r=applyCommand(treatment,TRADER,type==='reply'?{type:'lp.reply',ticker:'AUDIT',text:'I am selling everything. The creator dumped. Avoid this coin.'}:
    {type:'chat.send',channel:'world',text:'AUDIT is going to zero. I sold everything.'});
  let sameEveryTick=true;
  for(let i=0;i<120;i++){stepGame(control);stepGame(treatment);sameEveryTick &&= hash(economic(control))===hash(economic(treatment));}
  results[type]={accepted:r.ok,ticks:120,identicalPricesAccountsOrdersAndFlows:sameEveryTick};
}

// Promotions are actual commands, measured before even advancing one tick.
results.promotions=['board','wire'].map(kind=>{
  const g=lpWorld('audit-promo');launch(g,CREATOR,'AUDIT');const t=g.launchpad!.tokens.AUDIT!;
  const p=priceNow(g,t),f=g.economy.faucets.npcRetail??0,cash=g.market.accounts[TRADER]!.cash,seq=t.tradeSeq??0;
  const r=buyBuzz(g,TRADER,'AUDIT',kind as 'board'|'wire',null);
  return {kind,accepted:r.ok,payerCost:cash-g.market.accounts[TRADER]!.cash,npcMoneyCreated:(g.economy.faucets.npcRetail??0)-f,
    immediatePriceMovePct:100*(priceNow(g,t)/p-1),immediateTrades:(t.tradeSeq??0)-seq};
});

// Verify whether opposite tone headlines are distinguished by the launch crowd.
{
  const base=lpWorld('audit-headline');launch(base,CREATOR,'AUDIT');const t=base.launchpad!.tokens.AUDIT!;crowdTick(base,t,null);
  const snapshots=[];
  for(const tone of ['gain','loss'] as const){const g=clone(base);g.market.tick++;
    g.wire.unshift({id:'audit-headline',tick:g.market.tick,kind:'earnings',assetId:'HLCN',tag:'Earnings',tone,
      text:tone==='gain'?'Record profits; outlook raised':'Profits collapse; outlook cut'});
    crowdTick(g,g.launchpad!.tokens.AUDIT!,null);
    snapshots.push(g.launchpad!.tokens.AUDIT!.crowd);
  }
  results.newsTone={identicalCrowdResponse:hash(snapshots[0])===hash(snapshots[1]),positive:snapshots[0],negative:snapshots[1]};
}

// Is the supposed inflation measure sensitive to paper gains and population, without monetary inflation?
{
  const base=lpWorld('audit-stabilizer');for(const p of Object.values(base.players))p.netWorth=100000;
  base.economy.stabilizer.hist=Array(7).fill(300000);
  const a=clone(base);stabilizerDay(a);
  const b=clone(base);for(const p of Object.values(b.players))p.netWorth*=2;stabilizerDay(b);
  const c=clone(base);for(const p of Object.values(base.players))c.players[`${p.id}-copy`]={...clone(p),id:`${p.id}-copy`};stabilizerDay(c);
  results.stabilizer={unchangedWealth:a.economy.stabilizer.sinkMult,doublePaperWealth:b.economy.stabilizer.sinkMult,
    doublePopulationSameWealthPerPlayer:c.economy.stabilizer.sinkMult,cashAndFaucetsUnchanged:hash(base.market.accounts)===hash(b.market.accounts)&&hash(base.economy.faucets)===hash(b.economy.faucets)};
}

// Graduation: compare engine quote with actual liquidity ratio, and zero-order price movement.
{
  const g=lpWorld('audit-graduation');launch(g,CREATOR,'AUDIT');adminFill(g,'AUDIT',null);
  const t=g.launchpad!.tokens.AUDIT!,book=g.market.accounts['lp:book:AUDIT']!,p=priceNow(g,t);
  const ratio=book.cash/book.positions.AUDIT!.qty;
  g.market.orders=[];g.market=step(g.market).state;
  results.graduation={price:p,bookCash:book.cash,bookTokens:book.positions.AUDIT!.qty,reserveRatio:ratio,
    quotedPriceVsReserveRatioPct:100*(p/ratio-1),priceMoveWithNoOrdersPct:100*(priceNow(g,t)/p-1),bookBalancesUnchanged:hash(book)===hash(g.market.accounts['lp:book:AUDIT'])};
}

// True execution reaction, across order sizes; directly clear to isolate market noise.
results.impact=['HLCN','AUC','FROG'].map(assetId=>{
  const base=createWorld('audit-impact',universeConfig());const i=base.config.assets.findIndex(a=>a.id===assetId);
  const p=Math.exp(base.assets[i]!.lnP),def=base.config.assets[i]!;
  return {assetId,adv:def.advNotional,configuredSpreadBps:def.spreadBps,effectiveSpreadBps:halfSpread(base,i)*20000,
    orders:[1000,100000,1000000].map(usd=>{
      let s=openAccount(base,'audit',usd*2);const qty=def.assetClass==='stock'?Math.floor(usd/p):usd/p;
      const order=placeOrder(s,{playerId:'audit',assetId,side:'buy',type:'market',qty});s=order.state;
      s={...s,tick:1};const r=clearOrders(s,false);
      return {usd,filled:r.fills.length,midMovePct:100*(Math.exp(r.state.assets[i]!.lnP)/p-1),
        executionCostBps:r.fills[0]?10000*(r.fills[0].price/p-1):null};
    })};
});

// All asset classes at the production clock. Separate close ticks from the other 719 ticks/day.
const symbols=['HLCN','LMNP','AUC','LTX','FROG','AUSD','GOLD','OIL','AV10'];
const samples=Object.fromEntries(symbols.map(id=>[id,{ordinary:[] as number[],closing:[] as number[],daily:[] as number[]}]));
for(const seed of ['audit-market-a','audit-market-b','audit-market-c']) {
  let s=createWorld(seed,universeConfig());const indices=symbols.map(id=>s.config.assets.findIndex(a=>a.id===id));
  if(indices.some(i=>i<0))throw Error('missing audited symbol');
  let lastClose=indices.map(i=>Math.exp(s.assets[i]!.lnP));
  for(let n=0;n<30*720;n++) {
    const before=indices.map(i=>Math.exp(s.assets[i]!.lnP));s=step(s).state;
    indices.forEach((i,k)=>{const after=Math.exp(s.assets[i]!.lnP),v=samples[symbols[k]!]!;
      (s.tick%720===0?v.closing:v.ordinary).push(after/before[k]!-1);
      if(s.tick%720===0){v.daily.push(after/lastClose[k]!-1);lastClose[k]=after;}
    });
  }
  console.log(`completed ${seed}: 30 days at 720 ticks/day`);
}
results.market=Object.fromEntries(symbols.map(id=>{const v=samples[id]!;return [id,{ordinary:stats(v.ordinary),closing:stats(v.closing),daily:stats(v.daily),
  closingShareOfSquaredTickReturns:v.closing.reduce((s,r)=>s+r*r,0)/(v.closing.reduce((s,r)=>s+r*r,0)+v.ordinary.reduce((s,r)=>s+r*r,0))}];}));

// Optional aggregate-only snapshot inspection; SQLite read-only; no account identities or save contents exported.
if(process.argv[2]) {
  const db=new DatabaseSync(process.argv[2],{readOnly:true});const row=db.prepare('SELECT tick,data FROM snapshots ORDER BY id DESC LIMIT 1').get() as {tick:number,data:string};db.close();
  const g=JSON.parse(row.data) as GameState;
  const micro=Object.entries(g.market.accounts).filter(([id])=>id.startsWith('lp:npc:trader:')).map(([,a])=>a);
  const cash=micro.map(a=>a.cash).sort((a,b)=>a-b);
  results.liveSnapshot={tick:row.tick,players:Object.keys(g.players).length,assets:g.market.config.assets.length,
    companies:Object.keys(g.companies?.companies??{}).length,businesses:Object.keys(g.businesses).length,properties:Object.keys(g.properties).length,
    launchStatus:Object.values(g.launchpad?.tokens??{}).reduce((a,t)=>{a[t.status]=(a[t.status]??0)+1;return a;},{} as Record<string,number>),
    microTraders:micro.length,cashMin:cash[0],cashMedian:q(cash,.5),cashMax:cash.at(-1),cashTotal:cash.reduce((a,b)=>a+b,0),cashBelowOneDollar:cash.filter(c=>c<1).length,
    ecology:g.market.config.ecology,npcRetailFaucet:g.economy.faucets.npcRetail,npcRetailSink:g.economy.sinks.npcRetail};
}
mkdirSync('proof/economy-audit',{recursive:true});
writeFileSync('proof/economy-audit/experiments.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
