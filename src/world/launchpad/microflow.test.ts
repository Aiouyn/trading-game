import { describe, expect, it } from 'vitest';
import { stepGame, applyCommand } from '../game';
import { bookedNet, engineTallyOf, netWorldMoney } from '../company/exploits/sequences';
import { CREATOR, TRADER, lpWorld, launch, run } from './fixture';
import { microTick, MICROFLOW } from './microflow';
import { lpTick } from './flow';
import { cohortsOf } from './cohorts';
import { spotAt } from './curve';
import { pushTape } from './tape';
import { crowdTick } from './crowd';
import { lpPageOf } from './view';
import { anonOf } from './anon';
import { buyCurve } from './trade';
import { TPD } from './constants';
import { npcLaunchDraw } from './launch';

const make = (seed: string, ticker = 'WAVE') => {
  const g = lpWorld(seed);
  expect(launch(g, CREATOR, ticker).ok).toBe(true);
  return { g, t: g.launchpad!.tokens[ticker]! };
};
const advance = (g: ReturnType<typeof lpWorld>, n: number) => {
  for (let k = 0; k < n; k++) { g.market = { ...g.market, tick: g.market.tick + 1 }; lpTick(g, null); }
};

describe('funded meme-coin price action', () => {
  it('has two-sided meaningful moves and actual bursts without a human trade', () => {
    const returns: number[] = [];
    let bursts = 0;
    for (const seed of ['action-a','action-b','action-c','action-d','action-e','action-f']) {
      const { g,t } = make(seed);
      // An hour, so the rug minute (after the first ten) is inside the window.
      for (let k = 0; k < 720 && t.status === 'live'; k++) {
        const price = spotAt(t.y);
        const seq = t.tradeSeq ?? 0;
        advance(g,1);
        returns.push(spotAt(t.y)/price-1);
        if ((t.tradeSeq ?? 0)-seq >= 3) bursts++;
      }
    }
    expect(returns.some(r => r > 0.2)).toBe(true);
    expect(returns.some(r => r < -0.2)).toBe(true);
    // Most five-second ticks are quiet on purpose: the move has to survive as a minute close.
    // The share of ticks that jump 5% is no longer the yardstick.
    expect(bursts).toBeGreaterThan(50);
  });

  it('closes money, supply and cohort inventory through real game steps and migration', () => {
    const { g,t } = make('funded-money');
    const m0 = netWorldMoney(g), b0 = bookedNet(g), e0 = engineTallyOf(g);
    for (let k = 0; k < 120; k++) stepGame(g);
    expect(Math.abs((netWorldMoney(g)-m0)-(bookedNet(g)-b0)-(engineTallyOf(g)-e0))).toBeLessThan(0.005);
    const cs = cohortsOf(t);
    expect(cs.reduce((sum,c)=>sum+c.tokens,0)).toBe(t.npcBal);
    expect(t.micro!.traders.every(w=>Number.isInteger(w.cashCents)&&w.cashCents>=0)).toBe(true);
    expect(applyCommand(g,'admin',{type:'admin.lpFill',ticker:t.ticker}).ok).toBe(true);
    expect(t.status).toBe('graduated');
    expect(g.market.config.assets.find(a=>a.id===t.ticker)!.advNotional).toBeLessThan(100_000);
    expect(t.micro!.traders.every(w=>w.accountId===w.id)).toBe(true);
    const total = Object.values(g.market.accounts).reduce((sum,a)=>sum+(a.positions[t.ticker]?.qty??0),0);
    expect(total).toBe(1_000_000_000);
    for (let k = 0; k < 40; k++) stepGame(g);
    expect(Math.abs((netWorldMoney(g)-m0)-(bookedNet(g)-b0)-(engineTallyOf(g)-e0))).toBeLessThan(0.005);
    expect(t.tape.some(tr=>tr.npc && tr.anon && tr.tick > t.gradTick!)).toBe(true);
  });

  it('survives JSON save/reload with exactly the same price path and wallet state', () => {
    const {g:a} = make('flow-reload');
    advance(a,60);
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    advance(a,80); advance(b,80);
    expect(JSON.stringify(a.launchpad)).toBe(JSON.stringify(b.launchpad));
    expect(JSON.stringify(a.market.accounts)).toBe(JSON.stringify(b.market.accounts));
  });

  it('funds each launch crowd once and does not refill the shared population', () => {
    const {g,t} = make('own-wallet');
    microTick(g,t,null);
    const funding = g.economy.faucets.npcRetail;
    const wallet = t.micro!.traders[0]!;
    expect(wallet.accountId).toBe(wallet.id);
    expect(g.market.accounts[wallet.id]!.cash).toBeGreaterThan(0);
    expect(g.launchpad!.flowCapital).toBeUndefined();
    expect(Object.keys(g.market.accounts).filter(id => id.startsWith(`lp:npc:launch:${t.ticker}:`))).toHaveLength(8);
    expect(npcLaunchDraw(g, null)).toBe(true);
    const other = g.launchpad!.tokens[g.launchpad!.order.at(-1)!]!;
    microTick(g,other,null);
    // The shared population is not refilled. The new coin has its own crowd, granted once.
    const before = g.economy.faucets.npcRetail;
    microTick(g,other,null);
    expect(g.economy.faucets.npcRetail).toBe(before);
    expect(before).toBeGreaterThan(funding);
    expect(Object.keys(g.market.accounts).filter(id => id.startsWith('lp:npc:trader:'))).toHaveLength(MICROFLOW.population);
    g.market.accounts[wallet.id]!.cash = 0;
    const accounts = JSON.stringify(g.market.accounts);
    expect(buyCurve(g,null,t.ticker,10_000,1,null,true,false,wallet).ok).toBe(false);
    expect(JSON.stringify(g.market.accounts)).toBe(accounts);
  });

  it('keeps page wallets consistent with settled tape and actual held inventory', () => {
    const {g,t} = make('real-tape');
    advance(g,80);
    const page = lpPageOf(g,TRADER,t.ticker)!;
    expect(t.wall).toBeUndefined();
    expect(t.tape.some(tr=>tr.chatter)).toBe(false);
    for (const row of page.tape) expect(t.tape.some(tr=>tr.anon===row.anon && tr.qty===row.qty && tr.tick===row.tick)).toBe(true);
    if(t.status==='live') {
      const wallets = new Set(cohortsOf(t).filter(c => c.wallet).map(c => c.wallet));
      expect(wallets.size).toBeLessThanOrEqual(t.micro!.traders.length + 1);
      for (const w of t.micro!.traders) {
        const qty=cohortsOf(t).filter(c=>c.wallet===w.id).reduce((sum,c)=>sum+c.tokens,0);
        const shown = page.holders.find(h=>h.anon===anonOf(t.ticker,w.id));
        if(shown) expect(shown.qty).toBe(qty); // only the largest holders are public
      }
    }
    const publicPage=JSON.stringify(page);
    for(const w of t.micro!.traders) expect(publicPage).not.toContain(w.id);
  });

  it('does not lose a large player signal after repeated tape wraps or over 80 prints in one tick', () => {
    const enabled=MICROFLOW.enabled;
    MICROFLOW.enabled=false;
    try {
      const {g,t}=make('signal-wrap','WRAP');
      crowdTick(g,t,null); // first observation intentionally ignores pre-existing launch prints
      for(let k=0;k<240;k++) pushTape(t,{tick:g.market.tick,side:'buy',qty:1,price:spotAt(t.y),usd:1,npc:true,creator:false});
      crowdTick(g,t,null);
      const seq=t.tradeSeq!;
      // A low previous EMA plus a much larger new print should arm the delayed response.
      t.crowd!.volEma=0;
      expect(run(g,TRADER,{type:'lp.buy',ticker:t.ticker,spendCents:40_000,maxSlip:0.5}).ok).toBe(true);
      crowdTick(g,t,null);
      expect(t.tape).toHaveLength(80);
      expect(t.tradeSeq).toBeGreaterThan(seq);
      expect(t.crowd!.dueUsd).toBeGreaterThan(0);
    } finally {MICROFLOW.enabled=enabled;}
  });

  it('migrates an older saved token lazily without inventing a trade or replaying its tape', () => {
    const {g,t}=make('old-flow');
    delete t.micro; delete t.tradeSeq; delete t.crowdPrints;
    g.market={...g.market,tick:g.market.tick+TPD};
    microTick(g,t,null);
    expect(t.micro).toBeDefined();
    expect(t.micro!.traders.every(w=>w.cashCents>=0)).toBe(true);
  });

  it('funds an already graduated old save once and preserves its money identity', () => {
    const {g,t}=make('old-graduated');
    expect(applyCommand(g,'admin',{type:'admin.lpFill',ticker:t.ticker}).ok).toBe(true);
    g.market.config = {...g.market.config,assets:g.market.config.assets.map(a=>a.id===t.ticker?{...a,advNotional:400_000_000}:a)};
    const m0=netWorldMoney(g), b0=bookedNet(g), e0=engineTallyOf(g);
    microTick(g,t,null);
    expect(g.market.config.assets.find(a=>a.id===t.ticker)!.advNotional).toBeLessThan(100_000);
    expect(t.micro!.traders.every(w=>w.accountId===w.id&&w.cashCents===0)).toBe(true);
    expect(t.micro!.traders.some(w=>(g.market.accounts[w.id]?.cash??0)>0)).toBe(true);
    const funding=g.economy.faucets.npcRetail;
    microTick(g,t,null);
    expect(g.economy.faucets.npcRetail).toBe(funding);
    expect(Math.abs((netWorldMoney(g)-m0)-(bookedNet(g)-b0)-(engineTallyOf(g)-e0))).toBeLessThan(.005);
  });

  it('keeps each traders proceeds and spare cash after cancellation', () => {
    const {g,t}=make('cancel-funded');
    advance(g,20);
    const previous = new Map(t.micro!.traders.map(w => [w.id, g.market.accounts[w.id]!.cash]));
    expect(run(g,CREATOR,{type:'lp.cancel',ticker:t.ticker}).ok).toBe(true);
    expect(t.status).toBe('dead');
    expect(t.micro!.traders.every(w=>g.market.accounts[w.id]!.cash >= previous.get(w.id)!)).toBe(true);
    expect(t.npcBal).toBe(0);
  });

  it('does not starve fresh launches in a mature world with hundreds of coins', () => {
    const g = lpWorld('mature-population');
    for (let i = 0; i < 200; i++) npcLaunchDraw(g, null);
    const old = Object.values(g.launchpad!.tokens);
    for (const t of old) microTick(g,t,null);
    const funding = g.economy.faucets.npcRetail;
    let overlap = false, buys = 0;
    const oldIds = new Set(old.flatMap(t=>t.micro!.traders.map(w=>w.id)));
    for (let i = 0; i < 10; i++) {
      npcLaunchDraw(g,null);
      const t = g.launchpad!.tokens[g.launchpad!.order.at(-1)!]!;
      microTick(g,t,null);
      overlap ||= t.micro!.traders.some(w=>oldIds.has(w.id));
      const before = t.flows.npcBuy;
      // Ten minutes: the open of the rally, not the whole purse.
      for (let k = 0; k < 120; k++) { g.market.tick++; microTick(g,t,null); }
      buys += t.flows.npcBuy - before;
      for (const w of t.micro!.traders) expect(g.market.accounts[w.id]!.cash).toBeGreaterThanOrEqual(0);
    }
    expect(overlap).toBe(true);
    expect(buys).toBeGreaterThan(20_000);
    // No new population grant on any of these ten fresh coins.
    expect(Object.keys(g.market.accounts).filter(id=>id.startsWith('lp:npc:trader:'))).toHaveLength(MICROFLOW.population);
    expect(g.economy.faucets.npcRetail - funding).toBeLessThan(500_000);
  });
});
