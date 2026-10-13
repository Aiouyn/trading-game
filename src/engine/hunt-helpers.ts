/**
 * Shared measurements for the X1/X2 hunts (Tape, hunts v1). The suite (src/engine/*.test.ts) and the multi-seed harness
 * (scripts/balance/hunts.ts) both call these, so a number means the same thing in both places. Not exported from the
 * engine index: test and harness support only.
 */
import { createWorld, shockPrice, step } from './sim';
import { defaultConfig } from './config';
import { newsPricedIn } from './news';
import { cancelOrder, estimateFill, openAccount, openOrders, placeOrder, portfolio, roundQty } from './trading';
import type { WorldConfig, WorldState } from './types';

export const LN2 = Math.log(2);

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Spearman rank correlation with average ranks for ties. */
export function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((_, i) => i).sort((p, q) => xs[p]! - xs[q]!);
    const r = new Array<number>(xs.length);
    let k = 0;
    while (k < idx.length) {
      let j = k;
      while (j + 1 < idx.length && xs[idx[j + 1]!] === xs[idx[k]!]) j++;
      const avg = (k + j) / 2 + 1;
      for (let m = k; m <= j; m++) r[idx[m]!] = avg;
      k = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let c = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    c += (ra[i]! - ma) * (rb[i]! - mb);
    va += (ra[i]! - ma) ** 2;
    vb += (rb[i]! - mb) ** 2;
  }
  return c / Math.sqrt(va * vb);
}

/**
 * Half-life of a decaying gap: the least-squares fit of r(t) = exp(−ln2 · t / h) to the ratio r = gap(t) / gap(0), over a
 * log-spaced grid of h (0.5 to 1000 game days). A grid, not a crossing time, because one path is noisy near 50%.
 */
export function fitHalfLife(r: number[], tDays: number[]): number {
  let best = NaN;
  let bestErr = Infinity;
  for (let k = 0; k <= 400; k++) {
    const h = 0.5 * Math.pow(2000, k / 400);
    let e = 0;
    for (let j = 0; j < r.length; j++) e += (r[j]! - Math.exp((-LN2 * tDays[j]!) / h)) ** 2;
    if (e < bestErr) { bestErr = e; best = h; }
  }
  return best;
}

/**
 * Shock the listed assets' prices by −30% at tick 0 (the value line does not move), then return each asset's gap
 * lnP − lnV as a fraction of its start, every tick, for `horizonDays` game days. Result[k] is the series for ids[k].
 */
export function shockedGaps(cfg: WorldConfig, seed: string, ids: string[], horizonDays: number, opts: { diffusive?: boolean } = {}): number[][] {
  let s: WorldState = createWorld(seed, cfg);
  for (const id of ids) {
    s = shockPrice(s, id, -0.3);
    // diffusive: the same -30% also books as today's diffusive innovation (the GARCH input), i.e. a move with news or
    // flow behind it that the vol model sees. Without it the GARCH reads a price-only move as nothing (see valuegap.test.ts)
    if (opts.diffusive) {
      const i = s.config.assets.findIndex((a) => a.id === id);
      s = { ...s, assets: s.assets.map((a, k) => (k === i ? { ...a, dayDiff: -0.3 } : a)) };
    }
  }
  const idx = ids.map((id) => s.config.assets.findIndex((a) => a.id === id));
  const g0 = idx.map((i) => s.assets[i]!.lnP - s.assets[i]!.lnV);
  const series: number[][] = ids.map(() => []);
  for (let t = 1; t <= horizonDays * cfg.ticksPerDay; t++) {
    s = step(s).state;
    idx.forEach((i, k) => series[k]!.push((s.assets[i]!.lnP - s.assets[i]!.lnV) / g0[k]!));
  }
  return series;
}

/**
 * Half-life of the shocked gap for every asset in the config, one seed: each asset is read over 3 of its own
 * half-lives (all assets share one world, which is fine because their gaps do not couple).
 */
export function halfLivesFor(cfg: WorldConfig, seed: string): { id: string; days: number; ratio: number }[] {
  const ids = cfg.assets.map((a) => a.id);
  const defDays = (id: string) => cfg.assets.find((a) => a.id === id)!.halfLifeDays;
  const H = 3 * Math.max(...ids.map(defDays));
  const series = shockedGaps(cfg, seed, ids, H);
  return ids.map((id, k) => {
    const n = Math.round(3 * defDays(id) * cfg.ticksPerDay);
    const r = series[k]!.slice(0, n);
    const days = fitHalfLife(r, r.map((_, j) => (j + 1) / cfg.ticksPerDay));
    return { id, days, ratio: days / defDays(id) };
  });
}

/** Per asset: the 95th percentile of |lnP − lnV| over `years` game years, no shock. */
export function gapP95(cfg: WorldConfig, seed: string, years: number): number[] {
  let s = createWorld(seed, cfg);
  const gaps: number[][] = cfg.assets.map(() => []);
  for (let t = 1; t <= years * cfg.daysPerYear * cfg.ticksPerDay; t++) {
    s = step(s).state;
    for (let i = 0; i < gaps.length; i++) gaps[i]!.push(Math.abs(s.assets[i]!.lnP - s.assets[i]!.lnV));
  }
  return gaps.map((g) => { const x = [...g].sort((a, b) => a - b); return x[Math.floor(0.95 * (x.length - 1))]!; });
}

/**
 * Cash the account can spend now: cash less what its open buy orders reserve. The engine reserves each open market buy
 * at estimateFill(remaining).total (validate and reserveCash use the same execPrice and commission), so this is exact.
 */
export function freeCash(s: WorldState, playerId: string): number {
  let reserved = 0;
  for (const o of s.orders) {
    if (o.status === 'open' && o.playerId === playerId && o.side === 'buy' && !o.reduceOnly) {
      reserved += estimateFill(s, { assetId: o.assetId, side: 'buy', qty: o.qty - o.filledQty }).total;
    }
  }
  return s.accounts[playerId]!.cash - reserved;
}

/** Units of an asset the account can sell now: its position less what its open sell orders reserve (the engine's check). */
export function freeQty(s: WorldState, playerId: string, assetId: string): number {
  let reserved = 0;
  for (const o of s.orders) {
    if (o.status === 'open' && o.playerId === playerId && o.assetId === assetId && o.side === 'sell' && !o.reduceOnly) reserved += o.qty - o.filledQty;
  }
  return (s.accounts[playerId]!.positions[assetId]?.qty ?? 0) - reserved;
}

const TRADE_CFG = () => defaultConfig({ ticksPerDay: 720 }); // the real tick for the trading tests

function assetIndex(s: WorldState, id: string) { return s.config.assets.findIndex((a) => a.id === id); }

/**
 * Ladder round trip: buy `notional` over game day 0 (one clip per tick), then sell everything over day 1 (one clip per
 * tick). pnl is the cash at the end minus the cash that opened the account (after fees). leftover is the position left.
 */
export function ladderPnl(seed: string, id: string, notional: number, cfg: WorldConfig = TRADE_CFG()): { pnl: number; leftover: number } {
  const TPD = cfg.ticksPerDay;
  const base = createWorld(seed, cfg);
  const px = base.config.assets[assetIndex(base, id)]!.initialPrice;
  const start = 1.05 * notional;
  let s = openAccount(base, 'p', start);
  const perTick = notional / px / TPD;
  for (let t = 0; t < TPD; t++) {
    s = placeOrder(s, { playerId: 'p', assetId: id, side: 'buy', type: 'market', qty: perTick }).state;
    s = step(s).state;
  }
  const bought = s.accounts.p!.positions[id]?.qty ?? 0;
  for (let t = 0; t < TPD; t++) {
    s = placeOrder(s, { playerId: 'p', assetId: id, side: 'sell', type: 'market', qty: bought / TPD }).state;
    s = step(s).state;
  }
  return { pnl: s.accounts.p!.cash - start, leftover: s.accounts.p!.positions[id]?.qty ?? 0 };
}

/**
 * Pump and dump: buy advShare × ADV a game day for D days (one clip per tick), then sell the position evenly over the
 * next D days. raw = cash P&L after fees (the spec's pump_dump_ev metric). paired = raw minus the same fills at the
 * no-trade world's mid with no spread or fee. That is a diagnostic only: the GARCH volatility update reads the world's
 * own impact (sim.ts, prev.lnP − prev.lnOpen), so after day 0 the no-trade copy is not the same path and paired is not a
 * clean frictionless comparison.
 */
export function pumpDump(seed: string, id: string, advShare: number, D: number, cfg: WorldConfig = TRADE_CFG()): { raw: number; paired: number; fills: number; leftover: number; rejects: Record<string, number> } {
  const TPD = cfg.ticksPerDay;
  const base = createWorld(seed, cfg);
  const i = assetIndex(base, id);
  const def = base.config.assets[i]!;
  const dayNotional = advShare * (def.advNotional ?? 1e9);
  const start = 1.1 * dayNotional * D;
  let s = openAccount(base, 'p', start);
  let n = base;
  const perBuy = dayNotional / def.initialPrice / TPD;
  const fills: { side: 'buy' | 'sell'; qty: number; mid: number }[] = [];
  const rejects: Record<string, number> = {};
  const run = (side: 'buy' | 'sell', ticks: number, qtyOf: () => number) => {
    for (let t = 0; t < ticks; t++) {
      // sells are capped at the free position (held less open sells), the engine's own check, so a rounding residue or a
      // partly filled earlier sell cannot make the last tick reject
      const q = side === 'sell' ? Math.min(qtyOf(), freeQty(s, 'p', id)) : qtyOf();
      if (q > 0) {
        const o = placeOrder(s, { playerId: 'p', assetId: id, side, type: 'market', qty: q });
        s = o.state;
        if (o.order.status === 'rejected') rejects[o.order.rejectReason ?? 'unknown'] = (rejects[o.order.rejectReason ?? 'unknown'] ?? 0) + 1;
      }
      const r = step(s);
      s = r.state;
      n = step(n).state;
      for (const f of r.fills) if (f.playerId === 'p' && f.assetId === id) fills.push({ side, qty: f.qty, mid: Math.exp(n.assets[i]!.lnP) });
    }
  };
  for (let d = 0; d < D; d++) run('buy', TPD, () => roundQty(def, perBuy));
  const held = s.accounts.p!.positions[id]?.qty ?? 0;
  run('sell', D * TPD, () => held / (D * TPD));
  const raw = s.accounts.p!.cash - start;
  let frictionless = 0;
  for (const f of fills) frictionless += (f.side === 'buy' ? -1 : 1) * f.qty * f.mid;
  return { raw, paired: raw - frictionless, fills: fills.length, leftover: s.accounts.p!.positions[id]?.qty ?? 0, rejects };
}

/** One seed: the (surprise, next-21-day return after the report-day close) pairs over `years` game years. */
export function earningsPairs(seed: string, cfg: WorldConfig, years: number): { x: number[]; y: number[] } {
  const TPD = cfg.ticksPerDay;
  const assetIdx = new Map(cfg.assets.map((a, i) => [a.id, i]));
  let s = createWorld(seed, cfg);
  const days = years * cfg.daysPerYear;
  const closes: number[][] = [];
  const reports: { i: number; day: number; surprise: number }[] = [];
  for (let t = 1; t <= days * TPD; t++) {
    const r = step(s);
    s = r.state;
    // the report gaps the open of its day (tick day·TPD + 1), so the day's close already holds the jump
    for (const e of r.events) if (e.type === 'earnings') reports.push({ i: assetIdx.get(e.assetId)!, day: Math.floor((e.tick - 1) / TPD), surprise: e.surprise });
    if (t % TPD === 0) closes.push(s.assets.map((a) => Math.exp(a.lnP)));
  }
  const x: number[] = [];
  const y: number[] = [];
  for (const e of reports) {
    if (e.day + 21 >= closes.length) continue;
    x.push(e.surprise);
    y.push(closes[e.day + 21]![e.i]! / closes[e.day]![e.i]! - 1);
  }
  return { x, y };
}

/**
 * news_drift (M04, ROADMAP harness strategy; tape-stonks-exploits.md X2): after a positive earnings surprise, buy the
 * stock when its news priced-in share is below `enterBelow` (0.85), sell it once the share reaches `exitAt` (0.97).
 * Each position is `fraction` of equity, market orders, fees on. The benchmark is buy-and-hold: an equal-weight basket of
 * every listed stock, bought once on `startDay` (fee-aware, as in scripts/balance/run.ts). Both run over the same
 * window from `startDay` to `years`. Returns the equity multiples over that window; the harness gate is the share of
 * seeds where news > bh, which must be ≤ 0.70.
 */
export function newsDriftVsBh(seed: string, cfg: WorldConfig, opts: { years?: number; startDay?: number; fraction?: number; enterBelow?: number; exitAt?: number } = {}): { news: number; bh: number; fills: number; rejects: Record<string, number> } {
  const TPD = cfg.ticksPerDay;
  const years = opts.years ?? 5;
  const startDay = opts.startDay ?? 63;
  const fraction = opts.fraction ?? 0.2;
  const enterBelow = opts.enterBelow ?? 0.85;
  const exitAt = opts.exitAt ?? 0.97;
  const START = 5000;
  const startTick = startDay * TPD;
  const endTick = Math.round(years * cfg.daysPerYear) * TPD;
  const PID = 'news';
  const BH = 'bh';
  let news: WorldState = openAccount(createWorld(seed, cfg), PID, START);
  let bh: WorldState = openAccount(createWorld(seed, cfg), BH, START);
  const reportTick = new Map<string, number>(); // open news positions: asset id -> tick of its report
  let newsStart = START;
  let bhStart = START;
  let fills = 0;
  const rejects: Record<string, number> = {};
  const count = (o: { order: { status: string; rejectReason?: string } }) => {
    if (o.order.status === 'rejected') rejects[o.order.rejectReason ?? 'unknown'] = (rejects[o.order.rejectReason ?? 'unknown'] ?? 0) + 1;
  };
  const sizeOf = (st: WorldState, id: string, budget: number) => {
    const i = st.config.assets.findIndex((a) => a.id === id);
    const q = budget / Math.exp(st.assets[i]!.lnP);
    return roundQty(st.config.assets[i]!, q);
  };
  for (let t = 0; t < endTick; t++) {
    if (news.tick === startTick) {
      // both books start at the same tick; the benchmark buys its basket here, the news book trades from its first report
      newsStart = portfolio(news, PID).equity;
      bhStart = portfolio(bh, BH).equity;
      const names = bh.config.assets.filter((a) => a.assetClass === 'stock' && !a.delisted).map((a) => a.id);
      for (const id of names) {
        const q = sizeOf(bh, id, (0.97 * bh.accounts[BH]!.cash) / names.length);
        if (q > 0) bh = placeOrder(bh, { playerId: BH, assetId: id, side: 'buy', type: 'market', qty: q }).state;
      }
    }
    // exits: priced-in has reached exitAt for an open position
    if (news.tick >= startTick) {
      for (const [id, tick] of [...reportTick]) {
        const pos = news.accounts[PID]!.positions[id]?.qty ?? 0;
        // a buy placed at the print fills on the next step, so an entry can read as flat before its fill: keep it open
        // while that buy is pending, and drop it only once the position is flat and nothing is pending
        const buyPending = news.orders.some((o) => o.status === 'open' && o.playerId === PID && o.assetId === id && o.side === 'buy');
        if (pos <= 0) { if (!buyPending) reportTick.delete(id); continue; }
        if (newsPricedIn(cfg, id, 'earnings', news.tick - tick) >= exitAt) {
          // sell what is free; a partly filled sell keeps its remainder reserved, so the next tick sells the rest
          const q = freeQty(news, PID, id);
          if (q > 0) {
            const o = placeOrder(news, { playerId: PID, assetId: id, side: 'sell', type: 'market', qty: q });
            count(o);
            news = o.state;
          }
        }
      }
    }
    const r = step(news);
    news = r.state;
    fills += r.fills.filter((f) => f.playerId === PID).length;
    bh = step(bh).state;
    // entries: a positive report, priced in below enterBelow at the print (age 0)
    if (news.tick > startTick) {
      for (const e of r.events) {
        if (e.type !== 'earnings' || !(e.surprise > 0) || e.tick < startTick) continue;
        if (reportTick.has(e.assetId) || (news.accounts[PID]!.positions[e.assetId]?.qty ?? 0) > 0) continue;
        if (newsPricedIn(cfg, e.assetId, 'earnings', 0) >= enterBelow) continue;
        const q = sizeOf(news, e.assetId, Math.min(fraction * portfolio(news, PID).equity, freeCash(news, PID)));
        if (q > 0) {
          const o = placeOrder(news, { playerId: PID, assetId: e.assetId, side: 'buy', type: 'market', qty: q });
          count(o);
          news = o.state;
          if (o.order.status !== 'rejected') reportTick.set(e.assetId, e.tick);
        }
      }
    }
  }
  return { news: portfolio(news, PID).equity / newsStart, bh: portfolio(bh, BH).equity / bhStart, fills, rejects };
}

/**
 * Self impact (Ledger's clip gate; selfimpact.test.ts and scripts/balance/hunts.ts). Buy `notional` of asset `id` on day 0
 * as one order at tick 1 (clips = 1) or as `ticksPerDay` equal clips, one per tick (clips = ticksPerDay), from an account
 * holding 3 × notional, against the same seed with nobody trading. `lift` is the end-of-day lnP gap to that unpushed world,
 * `peak` the largest gap at any tick of the day, `marks` the holdings on the unpushed tape and `mids` on the pushed one.
 */
export function clipDay(id: string, clips: number, c: WorldConfig, seed: string, notional = 1e6): {
  lift: number; peak: number; qty: number; total: number; state: WorldState; marks: number[]; mids: number[];
} {
  const base = createWorld(seed, c);
  const i = base.config.assets.findIndex((a) => a.id === id);
  const def = c.assets[i]!;
  const per = roundQty(def, notional / def.initialPrice / c.ticksPerDay);
  const total = per * c.ticksPerDay;
  let s = openAccount(base, 'p1', 3 * notional);
  let n = base;
  const marks: number[] = [];
  const mids: number[] = [];
  let peak = -Infinity;
  for (let t = 0; t < c.ticksPerDay; t++) {
    if (clips === 1 && t === 0) s = placeOrder(s, { playerId: 'p1', assetId: id, side: 'buy', type: 'market', qty: total }).state;
    if (clips === c.ticksPerDay) s = placeOrder(s, { playerId: 'p1', assetId: id, side: 'buy', type: 'market', qty: per }).state;
    s = step(s).state;
    n = step(n).state;
    peak = Math.max(peak, s.assets[i]!.lnP - n.assets[i]!.lnP);
    const a = s.accounts.p1!;
    const held = a.positions[id]?.qty ?? 0;
    marks.push(a.cash + held * Math.exp(n.assets[i]!.lnP));
    mids.push(a.cash + held * Math.exp(s.assets[i]!.lnP));
  }
  return { lift: s.assets[i]!.lnP - n.assets[i]!.lnP, peak, qty: s.accounts.p1!.positions[id]?.qty ?? 0, total, state: s, marks, mids };
}

/**
 * Realize to flat (X3, huge.test.ts and scripts/balance/huge-money.ts): cancel the account's resting orders, then sell every
 * long unit at market, each day split evenly over the day's ticks, until the units are worth less than $1 or `maxDays` pass.
 * Returns the game day it went flat (-1 if not), the cash at the end, and the mid value of units still held.
 */
export function realizeToFlat(start: WorldState, playerId: string, maxDays: number): { flatDay: number; cash: number; heldValue: number } {
  const TPD = start.config.ticksPerDay;
  let s = start;
  for (const o of openOrders(s, playerId)) s = cancelOrder(s, playerId, o.id);
  const heldValue = (st: WorldState) => st.config.assets.reduce((v, a, i) => {
    const q = st.accounts[playerId]?.positions[a.id]?.qty ?? 0;
    return q > 0 ? v + q * Math.exp(st.assets[i]!.lnP) : v;
  }, 0);
  let flatDay = -1;
  for (let d = 0; d < maxDays && flatDay < 0; d++) {
    for (let t = 0; t < TPD; t++) {
      const ticksLeft = TPD - t;
      for (const a of s.config.assets) {
        const q = freeQty(s, playerId, a.id);
        if (q <= 0) continue;
        const want = roundQty(a, q / ticksLeft);
        if (want > 0) s = placeOrder(s, { playerId, assetId: a.id, side: 'sell', type: 'market', qty: want }).state;
      }
      s = step(s).state;
    }
    if (heldValue(s) < 1) flatDay = d + 1;
  }
  return { flatDay, cash: s.accounts[playerId]!.cash, heldValue: heldValue(s) };
}
