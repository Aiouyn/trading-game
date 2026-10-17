import { Rng, seedStream, placeOrder, openAccount, buyingPower } from '@/engine';
import type { GameState, StepOutput } from '../types';
import type { LpToken, MicroState, MicroTrader } from './types';
import { LP, NPC, TPD } from './constants';
import { planEnd, initPa, driveAt, sizeShare, PA, type PaState } from './attention';
import { cashReserveAt, spotAt } from './curve';
import { cohortsOf } from './cohorts';
import { buyCurve, sellCurve } from './trade';
import { anonOf } from './anon';
import { priceNow } from './rug';
import { faucetCents, payableCents } from './state';
import { MAX_DESK_FOLLOWERS, scoreOf } from './desk';
import { tickerHash } from './icon';

/** Game calibration, not a claim of a statistical fit. All prices still come from settled orders. */
export const MICROFLOW = {
  enabled: true,
  traders: 64,
  population: 1_200,
  maxOrders: 32,
};

// Keep the original launch tape's RNG sequence stable while adding funded participants.
const INITIAL_TRADER_COUNT = 24;
const INITIAL_POPULATION_COUNT = 240;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const styles: MicroTrader['style'][] = ['trend', 'dip', 'scalp', 'holder', 'whale'];

/** The launch sniper's account. One wallet for every coin, funded once, never the per-ticker unwind account. */
export const SNIPER_ID = 'lp:npc:sniper';

/** Each world trader is funded once. The engine account is the sole balance across every coin. */
function population(g: GameState): void {
  const lastTraderId = `lp:npc:trader:${MICROFLOW.population - 1}`;
  if (!g.market.accounts[lastTraderId]) {
    const rng = new Rng(seedStream(g.seed, 'lp:population'));
    for (let i = 0; i < MICROFLOW.population; i++) {
      const id = `lp:npc:trader:${i}`;
      // One draw, $2,000 to $24,000. Arrivals and bursts spend this cash, and idle-world graduation stays inside 1% to 5%.
      const cents = Math.round((2_000 + rng.uniform() * 22_000) * 100);
      if (g.market.accounts[id]) continue;
      g.market = openAccount(g.market, id, 0);
      faucetCents(g, id, 'npcRetail', cents);
    }
  }
  // Enough for one full snipe. A later snipe spends what this sale put back. A broke account refuses.
  if (!g.market.accounts[SNIPER_ID]) {
    g.market = openAccount(g.market, SNIPER_ID, 0);
    faucetCents(g, SNIPER_ID, 'npcRetail', Math.round(NPC.SNIPER_MAX * 100));
  }
}

function sniperShape(): MicroTrader {
  return {
    id: SNIPER_ID, accountId: SNIPER_ID, style: 'whale', cashCents: 0,
    takeProfit: NPC.SNIPER_EXIT_MULT, stop: 1, patience: NPC.SNIPER_EXIT_TICKS, lastAction: 0,
  };
}

/** The sniper wallet. Seeding it is once per world. */
export function sniperWallet(g: GameState): MicroTrader {
  population(g);
  return sniperShape();
}

/** Cash this wallet can spend, in cents. The account's buying power is the cap. */
export function spendableCents(g: GameState, w: MicroTrader): number {
  if (w.accountId) {
    const cash = g.market.accounts[w.accountId]?.cash ?? 0;
    return payableCents(Math.min(cash, buyingPower(g.market, w.accountId)));
  }
  return Math.max(0, Math.floor(w.cashCents));
}

/** A wallet funded for one coin's launch tape. Arrivals and viral shocks do not spend it. */
export const isLaunchCrowd = (id: string) => id.startsWith('lp:npc:launch:');

/** The token's funded traders. The sniper and the launch crowd are not among them. */
export function tokenTraders(g: GameState, t: LpToken): MicroTrader[] {
  if (!MICROFLOW.enabled || t.status === 'dead') return [];
  return ensure(g, t).traders.filter(w => !!w.accountId && w.id !== SNIPER_ID && !isLaunchCrowd(w.id));
}

/**
 * Arrival order on the token's own stream. The same stream the sniper and the viral shock already advance.
 * No second seed. One trader needs no draw.
 */
export function orderByTokenStream(t: LpToken, traders: MicroTrader[]): MicroTrader[] {
  const list = traders.slice();
  if (list.length < 2) return list;
  const rng = new Rng(t.rng);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    const a = list[i]!;
    const b = list[j]!;
    list[i] = b;
    list[j] = a;
  }
  t.rng = rng.state();
  return list;
}

/** The trader object for a cohort wallet. A dedicated account (the sniper) is not on the token's list. */
export function walletById(t: LpToken, id: string): MicroTrader {
  const found = t.micro?.traders.find(w => w.id === id);
  if (found) return found;
  if (id === SNIPER_ID) return sniperShape();
  return { id, accountId: id, style: 'holder', cashCents: 0, takeProfit: 2, stop: 1, patience: 1, lastAction: 0 };
}

/** Append missing funded participants to an existing save without touching its wallets or episode state. */
function expandExistingParticipants(g: GameState, t: LpToken, m: MicroState): void {
  const existingIds = new Set(m.traders.map(w => w.id));
  let attached = m.traders.filter(w => w.id.startsWith('lp:npc:trader:')).length;
  if (attached >= MICROFLOW.traders) return;

  const candidates = Array.from({ length: MICROFLOW.population }, (_, id) => id)
    .filter(id => !existingIds.has(`lp:npc:trader:${id}`));
  const rng = new Rng(seedStream(g.seed, `lp:micro:participants:${t.ticker}`));
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  for (const id of candidates) {
    if (attached >= MICROFLOW.traders) break;
    const accountId = `lp:npc:trader:${id}`;
    if (!g.market.accounts[accountId]) continue;
    m.traders.push({
      id: accountId, accountId, style: styles[id % styles.length]!, cashCents: 0,
      takeProfit: 1.12 + 1.5 * rng.uniform(), stop: 0.06 + 0.3 * rng.uniform(),
      patience: 12 + Math.floor(rng.uniform() * 120), lastAction: g.market.tick,
    });
    existingIds.add(accountId);
    attached++;
  }
}

/** Eight wallets, once per coin. The shared population is not refilled. */
const LAUNCH_CROWD = 8;
/** Script buys stop once the curve is this far above its virtual open, under the graduation raise. */
/** Spectators may add this many dollars of net buying on one coin. Past it they can still sell. */
const ECHO_CAP = 2_500;
/** One copied print, split across the followers, may not move the reserve by more than this. */
const COPY_RESERVE = 0.02;

function fundLaunchCrowd(g: GameState, t: LpToken, rng: Rng): { traders: MicroTrader[]; cents: number[] } {
  const traders: MicroTrader[] = [];
  const cents: number[] = [];
  for (let i = 0; i < LAUNCH_CROWD; i++) {
    const id = `lp:npc:launch:${t.ticker}:${i}`;
    // $900 to $4,100. Eight of them can lift a fresh curve a few times over and cannot reach graduation alone.
    const grant = Math.round((900 + rng.uniform() * 3_200) * 100);
    if (!g.market.accounts[id]) {
      g.market = openAccount(g.market, id, 0);
      faucetCents(g, id, 'npcRetail', grant);
    }
    cents.push(Math.max(0, Math.round((g.market.accounts[id]?.cash ?? 0) * 100)));
    traders.push({
      id, accountId: id, style: styles[i % styles.length]!, cashCents: 0,
      takeProfit: 1.4, stop: 0.25, patience: 40, lastAction: g.market.tick,
    });
  }
  return { traders, cents };
}

function ensure(g: GameState, t: LpToken): MicroState {
  population(g);
  // A live absorb already stores an episode, so this clamp has to run on a later call too.
  // It rewrites only the old million-scale placeholder, and it leaves the config alone otherwise.
  if (t.status === 'graduated') {
    const asset = g.market.config.assets.find(a => a.id === t.ticker);
    if ((asset?.advNotional ?? 0) > 1_000_000) {
      const cash = g.market.accounts[`lp:book:${t.ticker}`]?.cash ?? 0;
      const advNotional = Math.max(1000, cash);
      g.market.config = {...g.market.config, assets:g.market.config.assets.map(a =>
        a.id === t.ticker ? {...a, advNotional} : a)};
    }
  }
  const rng = new Rng(t.micro?.rng ?? seedStream(g.seed, `lp:micro:${t.ticker}`));
  if (t.micro?.pa) {
    expandExistingParticipants(g, t, t.micro);
    return t.micro;
  }
  if (t.micro?.episode) {
    // A save from before v2: keep its wallets, retire the replayed recording, and give it an attention state from now on.
    t.micro.pa = initPa(g.seed, t.ticker, t.createdTick, t.buzz.base);
    t.micro.pa.insiderDone = true;
    t.micro.pa.echo = t.micro.episode.echo ?? 0;
    expandExistingParticipants(g, t, t.micro);
    return t.micro;
  }
  // Convert old external wallets exactly once; cash and owned bags are preserved.
  const previous = t.micro?.traders ?? [];
  for (const w of previous) {
    if (!g.market.accounts[w.id]) g.market = openAccount(g.market, w.id, 0);
    if (!w.accountId && w.cashCents > 0) faucetCents(g, w.id, 'npcRetail', w.cashCents);
    w.cashCents = 0;
    w.accountId = w.id;
  }
  // The first 24 actors retain the original 240-account sample and token RNG draw order.
  // Extra participants use the isolated stream in expandExistingParticipants below.
  const ids = Array.from({length: Math.min(INITIAL_POPULATION_COUNT, MICROFLOW.population)}, (_, i) => i);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const traders = ids.slice(0, Math.min(INITIAL_TRADER_COUNT, MICROFLOW.traders)).map((id): MicroTrader => ({
    id: `lp:npc:trader:${id}`, accountId: `lp:npc:trader:${id}`, style: styles[id % styles.length]!, cashCents: 0,
    takeProfit: 1.12 + 1.5 * rng.uniform(), stop: 0.06 + 0.3 * rng.uniform(),
    patience: 12 + Math.floor(rng.uniform() * 120), lastAction: g.market.tick,
  }));
  const launch = t.status === 'live' ? fundLaunchCrowd(g, t, rng) : { traders: [], cents: [] };
  const p = priceNow(g, t);
  const m = t.micro ?? {
    traders: [], rng: rng.state(), lastPrice: p, peak: p, momentum: 0, affinity: 0.2 + 0.8 * rng.uniform(),
    activity: 1, mood: 2 * rng.uniform() - 1, panic: 0,
    lastBuy: t.flows.npcBuy + t.flows.playerBuy, lastSell: t.flows.npcSell + t.flows.playerSell,
    lastPlayerBuy: t.flows.playerBuy, lastPlayerSell: t.flows.playerSell,
  };
  m.traders = [...traders, ...previous, ...launch.traders];
  // The hidden archetype and attention state live on their own stream, so they move no other draw.
  m.pa = initPa(g.seed, t.ticker, t.createdTick, t.buzz.base);
  if (t.status !== 'live') m.pa.insiderDone = true;
  m.rng = rng.state();
  expandExistingParticipants(g, t, m);
  return t.micro = m;
}

/** Persistent accounts keep spare cash after death/cancellation; only legacy external fields are retired. */
export function releaseMicroCash(_g: GameState, t: LpToken): void {
  if (!t.micro) return;
  for (const w of t.micro.traders) {
    if (w.accountId) continue;
    // Legacy off-world cash is retired; persistent accounts retain their sale proceeds.
    w.cashCents = 0;
  }
}

function holding(g: GameState, t: LpToken, w: MicroTrader) {
  if (t.status === 'graduated') {
    const a = w.accountId ? g.market.accounts[w.accountId] : undefined;
    const pos = a?.positions[t.ticker];
    return { qty: Math.max(0, pos?.qty ?? 0), cost: (pos?.avgCost ?? 0) * Math.max(0, pos?.qty ?? 0),
      cashCents: w.accountId ? payableCents(Math.min(a?.cash ?? 0, buyingPower(g.market, w.accountId))) : 0 };
  }
  let qty = 0, cost = 0;
  for (const c of cohortsOf(t)) if (c.wallet === w.id) { qty += c.tokens; cost += c.cost; }
  return { qty, cost, cashCents: w.accountId ? payableCents(Math.min(g.market.accounts[w.accountId]?.cash ?? 0, buyingPower(g.market, w.accountId))) : w.cashCents };
}

function sell(g: GameState, t: LpToken, w: MicroTrader, qty: number, out: StepOutput | null): boolean {
  if (!(qty > 0)) return false;
  if (t.status === 'graduated') return engineOrder(g, t, w, 'sell', qty);
  const cs = cohortsOf(t);
  let remaining = qty;
  const plan = cs.map(c => {
    const n = c.wallet === w.id ? Math.min(c.tokens, remaining) : 0;
    remaining -= n;
    return n;
  });
  if (remaining > 0) return false;
  return sellCurve(g, null, t.ticker, qty, 1, out, true, plan, false, w).ok;
}

function engineOrder(g: GameState, t: LpToken, w: MicroTrader, side: 'buy' | 'sell', qty: number): boolean {
  if (!w.accountId || g.market.orders.some(o => o.status === 'open' && o.playerId === w.accountId && o.assetId === t.ticker)) return false;
  const r = placeOrder(g.market, { playerId: w.accountId, assetId: t.ticker, side, type: 'market', qty });
  g.market = r.state;
  return r.order.status === 'open';
}

/**
 * Copy a queued player fill one tick later. Followers are zero until the closed record is real,
 * so a fresh account is not chased. The dollars are one budget split across the wallets, capped
 * at a small share of the reserve. Each wallet spends its own cash. A broke wallet skips.
 * Fanout is hard-bounded by the desk cap (108 copied wallets), separate from the 32-order script cap.
 */
function copyFollow(g: GameState, t: LpToken, m: MicroState, out: StepOutput | null): void {
  const f = t.follow;
  if (!f || g.market.tick < f.due) return;
  delete t.follow;
  if (t.status !== 'live') return;
  const n = scoreOf(g, f.pid).followers;
  if (n <= 0) return;
  const reserve = cashReserveAt(t.y);
  const budget = Math.min(f.usd * 0.85, reserve * COPY_RESERVE, 4_000);
  if (!(budget >= 1)) return;
  const pool = copyWallets(g, t, m, n, f.pid);
  if (!pool.length) return;
  const each = budget / pool.length;
  const price = priceNow(g, t);
  for (const w of pool) {
    let acted = false;
    if (f.side === 'buy') {
      const spend = Math.min(Math.floor(each * 100), spendableCents(g, w));
      if (spend >= 100) acted = buyCurve(g, null, t.ticker, spend, 1, out, true, false, w).ok;
    } else {
      const bag = holding(g, t, w);
      const qty = Math.min(bag.qty, Math.floor(each / Math.max(price, 1e-12)));
      if (qty > 0) acted = sell(g, t, w, qty, out);
    }
    if (acted) {
      w.lastAction = g.market.tick;
      t.lastTradeTick = g.market.tick;
    }
  }
}

/** Wallets that copy one player. The same player always wakes the same accounts. New ones stay on the coin so a later exit pays them. */
function copyWallets(g: GameState, t: LpToken, m: MicroState, n: number, pid: string): MicroTrader[] {
  const start = tickerHash(pid) % MICROFLOW.population;
  const out: MicroTrader[] = [];
  let attached = m.traders.reduce((sum, w) => sum + (w.id.startsWith('lp:npc:trader:') ? 1 : 0), 0);
  const cap = MICROFLOW.traders + MAX_DESK_FOLLOWERS;
  for (let k = 0; k < MICROFLOW.population && out.length < n; k++) {
    const id = `lp:npc:trader:${(start + k * 7) % MICROFLOW.population}`;
    let w = m.traders.find(x => x.id === id);
    if (!w) {
      if (attached >= cap) continue;
      w = {
        id, accountId: id, style: styles[(start + k) % styles.length]!, cashCents: 0,
        takeProfit: 1.35, stop: 0.18, patience: 40, lastAction: g.market.tick,
      };
      m.traders.push(w);
      attached++;
    }
    if (spendableCents(g, w) >= 100 || holding(g, t, w).qty > 0) out.push(w);
  }
  return out;
}

/** Poisson draw by inversion; lam is small (a few orders a tick). */
function poisson(rng: Rng, lam: number): number {
  if (!(lam > 0)) return 0;
  const L = Math.exp(-lam);
  let k = 0, p = rng.uniform();
  while (p > L && k < 64) { k++; p *= rng.uniform(); }
  return k;
}

/** A buy by one wallet, curve or engine. Returns the dollars spent, 0 when nothing filled. The curve clips a buy at graduation. */
function walletBuy(g: GameState, t: LpToken, w: MicroTrader, dollars: number, out: StepOutput | null): number {
  const cash = spendableCents(g, w);
  const spend = Math.min(cash, Math.floor(dollars * 100));
  if (spend < 100) return 0;
  if (t.status === 'live') {
    const r = buyCurve(g, null, t.ticker, spend, 1, out, true, false, w);
    return r.ok ? (((r.data as { spendCents?: number } | undefined)?.spendCents ?? spend) / 100) : 0;
  }
  const p = priceNow(g, t);
  return engineOrder(g, t, w, 'buy', Math.floor(spend / 100 / p / 1.15)) ? spend / 100 : 0;
}

function walletSell(g: GameState, t: LpToken, w: MicroTrader, qty: number, out: StepOutput | null): number {
  const q = Math.floor(qty);
  if (q < 1) return 0;
  const p = priceNow(g, t);
  return sell(g, t, w, q, out) ? q * p : 0;
}

function stamp(t: LpToken, w: MicroTrader, tick: number): void {
  w.lastAction = tick;
  t.lastTradeTick = tick;
  if (t.status === 'live') {
    const last = t.tape[t.tape.length - 1];
    if (last && last.tick === tick) last.anon = anonOf(t.ticker, w.id);
  }
}

/**
 * One tick of the coin's own flow (price action v2, attention.ts). The launch wallets are the insiders: they buy over the first
 * ticks, may sell a slice early (a public tell), and on a rug dump their bag over a few ticks. Everyone else arrives on the attention
 * state: Poisson(drive + excitation) orders, sides from the archetype's lean, sizes from the recorded law scaled by attention.
 * Every order is a real settled order from a funded wallet: no price is set here.
 */
const LAUNCH_SPOT = spotAt(LP.Y0);

function paTick(g: GameState, t: LpToken, m: MicroState, out: StepOutput | null): void {
  const pa = m.pa;
  if (!pa) return;
  const rng = new Rng(pa.rng);
  const tick = g.market.tick;
  const age = tick - pa.born;
  const live = t.status === 'live';
  const before = priceNow(g, t);
  const insiders = m.traders.filter(w => isLaunchCrowd(w.id));
  // Excitation per settled order grows with its size against the reserve (a big print wakes more traders). The mean branching
  // ratio stays under one (ALPHA x mean size factor x the decay sum), so attention always dies down without new drive.
  const depthNow = () => t.status === 'live' ? cashReserveAt(t.y) : Math.max(1000, g.market.accounts[`lp:book:${t.ticker}`]?.cash ?? 0);
  const excite = (usd: number) => {
    const k = 0.5 + 0.5 * Math.min(3, usd / (PA.TYPICAL_SHARE * depthNow()));
    pa.e = Math.min(PA.E_MAX, pa.e + PA.ALPHA * k);
    pa.f = Math.min(PA.E_MAX, (pa.f ?? 0) + PA.FAST_ALPHA * k * k);
  };

  // insiders' entry, spread over the first ticks
  if (live && !pa.insiderDone && age >= 1) {
    for (const w of insiders) {
      if (rng.uniform() < 0.45) continue;
      const usd = walletBuy(g, t, w, spendableCents(g, w) / 100 * pa.insider * (0.05 + 0.07 * rng.uniform()), out);
      if (usd > 0) { stamp(t, w, tick); excite(usd); }
    }
    if (age >= 5) pa.insiderDone = true;
  }
  // an early insider sale: the dev-sell tell (shown by rug-profile coins, real or mimic)
  if (pa.devSellAt >= 0 && !pa.devSold && age >= pa.devSellAt) {
    pa.devSold = true;
    for (const w of insiders) {
      if (rng.uniform() < 0.5) continue;
      const usd = walletSell(g, t, w, holding(g, t, w).qty * pa.devSellFrac, out);
      if (usd > 0) { stamp(t, w, tick); excite(usd); }
    }
  }
  // the rug: insiders dump over rugTicks ticks
  if (pa.rugAt >= 0 && age >= pa.rugAt && age < pa.rugAt + pa.rugTicks) {
    const left = pa.rugAt + pa.rugTicks - age;
    for (const w of insiders) {
      const bag = holding(g, t, w).qty;
      const usd = walletSell(g, t, w, left <= 1 ? bag : bag * (0.4 + 0.5 * rng.uniform()), out);
      if (usd > 0) { stamp(t, w, tick); excite(usd); }
    }
  }
  // fresh buzz (viral shocks, promos) wakes attention; a trender also re-pumps on it
  const buzz = t.buzz.base + t.buzz.board + t.buzz.wire;
  const fresh = Math.max(0, buzz - pa.lastBuzz);
  pa.lastBuzz = buzz;
  pa.e += fresh * PA.BUZZ_EXCITE * (pa.arch === 'trender' ? PA.TRENDER_BUZZ : 1);
  if (pa.arch === 'trender' && age < 6 * TPD) {
    const busy = pa.pumps.some(([s0, len]) => age < s0 + 3 * len);
    if (!busy && (fresh > 2 || (age >= TPD && rng.uniform() < 1 / 420))) {
      pa.pumps.push([age, 24 + Math.floor(rng.uniform() * 72), 0.4 + 0.5 * rng.uniform(), 0.52 + 0.04 * rng.uniform(), 1.2]);
      if (pa.pumps.length > 12) pa.pumps.shift();
    }
  }

  if (pa.p0 === undefined) pa.p0 = before;
  pa.anc = pa.anc === undefined ? before : pa.anc * Math.pow(before / pa.anc, 1 - Math.pow(0.5, 1 / PA.ANCHOR_HALF));
  const { drive, buyP, size } = driveAt(pa, age);
  pa.e *= Math.pow(0.5, 1 / PA.EXCITE_HALF);
  if (pa.e < 1e-4) pa.e = 0;
  pa.f = (pa.f ?? 0) * Math.pow(0.5, 1 / PA.FAST_HALF);
  if (pa.f < 1e-4) pa.f = 0;
  const lam = drive + pa.e + pa.f;
  const n = Math.min(PA.MAX_ORDERS, poisson(rng, lam));
  // breadth: the crowd widens while the coin has attention (unique-buyer growth)
  const pool = m.traders.filter(w => w.id.startsWith('lp:npc:trader:'));
  pa.breadth = Math.min(pool.length, pa.breadth + (pa.growth / 12) * (lam > 0.1 ? 1 : 0));
  const crowd = pool.slice(0, Math.max(1, Math.floor(pa.breadth)));
  const intensity = clamp(Math.sqrt(lam / 0.6), 0.5, 2);
  for (let k = 0; k < n && t.status !== 'dead' && crowd.length; k++) {
    const p = priceNow(g, t);
    const ret = p / before - 1;
    // Short momentum (traders chase a moving tape), selling pressure above the slow anchor (a climb pauses and consolidates; a
    // crash is not bought back by it), and profit taking that grows with the distance from launch.
    let pb = buyP + 0.08 * clamp((pa.lastRet + ret) / 0.1, -1, 1)
      - (buyP >= 0.6 ? 0.5 : 1) * (PA.ANCHOR_PULL * Math.max(0, Math.log(p / (pa.anc ?? p))) + PA.PROFIT_PULL * Math.max(0, Math.log(p / (pa.p0 ?? p))));
    if (pa.lastRet + ret < -0.03) pb += pa.dipBuy;
    // a falling tick cascades: holders who see the drop rush for the exit in the same tick
    if (buyP < 0.5 && pa.arch !== 'runner') pb -= PA.PANIC * clamp(-ret / 0.1, 0, 1);
    const share = PA.SIZE_SCALE * size * intensity * (0.6 + 0.8 * rng.uniform());
    if (rng.uniform() < pb) {
      const w = crowd[Math.floor(rng.uniform() * crowd.length)]!;
      const depth = t.status === 'live' ? cashReserveAt(t.y) : Math.max(1000, g.market.accounts[`lp:book:${t.ticker}`]?.cash ?? 0);
      // in a selling phase the buyers are dip scalpers with small clips
      // and near the launch price a fading coin has almost no buyers left (a dead coin chops on dust, it does not spike)
      // (the long stories, grinder, trender and runner, keep their buyers through a consolidation or a bleed)
      const short = pa.arch === 'rug' || pa.arch === 'quick';
      const nearFloor = clamp(Math.log(p / LAUNCH_SPOT) / Math.LN2, PA.FLOOR_BUY, 1);
      const clip = short ? (buyP < 0.47 ? PA.FADE_BUY : 1) * (buyP < 0.53 ? nearFloor : 1) : (buyP < 0.47 ? nearFloor : 1);
      // half of the thinning is fewer buyers, half is smaller clips
      if (clip < 1 && rng.uniform() > Math.sqrt(clip)) continue;
      const usd = walletBuy(g, t, w, Math.min(PA.BUY_CAP, sizeShare('buy', rng.uniform()) * share * Math.sqrt(clip)) * depth, out);
      if (usd > 0) { stamp(t, w, tick); excite(usd); }
    } else {
      // Any wallet on the coin can sell; a bigger bag is likelier to be the seller (weight: square root of the bag).
      let wsum = 0;
      const insOk = age >= (pa.insHold ?? 0);
      let bags = m.traders.map(x => { const q = !insOk && isLaunchCrowd(x.id) ? 0 : holding(g, t, x).qty; const wt = q > 0 ? Math.sqrt(q) : 0; wsum += wt; return wt; });
      // nobody else holds: the launch wallets are the only sellers left
      if (!(wsum > 0) && !insOk) bags = m.traders.map(x => { const q = holding(g, t, x).qty; const wt = q > 0 ? Math.sqrt(q) : 0; wsum += wt; return wt; });
      if (!(wsum > 0)) continue;
      let pick = rng.uniform() * wsum, wi = 0;
      while (wi < bags.length - 1 && (pick -= bags[wi]!) > 0) wi++;
      const w = m.traders[wi]!;
      const bag = holding(g, t, w).qty;
      const depth = t.status === 'live' ? cashReserveAt(t.y) : Math.max(1000, g.market.accounts[`lp:book:${t.ticker}`]?.cash ?? 0);
      // Sized in dollars from the same recorded law as buys; when the coin leans to selling, holders also cut a slice of the bag.
      let qty = (pa.arch === 'rug' || pa.arch === 'quick' ? PA.SELL_SCALE : PA.LONG_SELL_SCALE) * sizeShare('sell', rng.uniform()) * share * depth / Math.max(p, 1e-12);
      if (buyP < 0.42) qty = Math.max(qty, bag * (0.4 + 0.5 * rng.uniform()));
      // capitulation: on a fading short story a holder sometimes dumps the whole bag at once
      if (buyP < 0.47 && (pa.arch === 'rug' || pa.arch === 'quick') && rng.uniform() < PA.CAPITULATE) qty = bag;
      const usd = walletSell(g, t, w, Math.min(bag, Math.max(1, qty)), out);
      if (usd > 0) { stamp(t, w, tick); excite(usd); }
    }
  }
  // Abandonment: once attention is gone, holders walk away one by one, so a dead coin bleeds back toward the floor.
  if (live && age >= planEnd(pa) && lam < PA.ABANDON_LAM && rng.uniform() < PA.ABANDON_P) {
    const holders = m.traders.filter(x => holding(g, t, x).qty > 0);
    if (holders.length) {
      const w = holders[Math.floor(rng.uniform() * holders.length)]!;
      const usd = walletSell(g, t, w, holding(g, t, w).qty * (0.1 + 0.3 * rng.uniform()), out);
      if (usd > 0) stamp(t, w, tick);
    }
  }
  pa.lastRet = priceNow(g, t) / before - 1;
  pa.rng = rng.state();
}

/** A tick contains a bounded series of orders, each reacting to the reserves left by the previous fill. */
export function microTick(g: GameState, t: LpToken, out: StepOutput | null): void {
  if (!MICROFLOW.enabled || t.status === 'dead') {
    // A disabled pit still drops the queue, so the key does not linger into a later save.
    if (t.follow && g.market.tick >= t.follow.due) delete t.follow;
    return;
  }
  const m = ensure(g, t);
  const rng = new Rng(m.rng);
  const tick = g.market.tick;
  const before = priceNow(g, t);
  const change = Math.log(before / m.lastPrice);
  const buy = t.flows.npcBuy + t.flows.playerBuy;
  const sale = t.flows.npcSell + t.flows.playerSell;
  const net = buy - m.lastBuy - (sale - m.lastSell);
  m.lastBuy = buy; m.lastSell = sale;
  m.momentum = clamp(m.momentum * 0.7 + change * 0.3, -0.6, 0.6);
  m.activity = clamp(m.activity * 0.9 + Math.abs(change) * 5 + Math.min(1, Math.abs(net) / 3000), 0, 3);
  m.peak = Math.max(before, m.peak * 0.997);
  const drawdown = 1 - before / m.peak;
  m.panic = Math.max(m.panic * 0.72, drawdown > 0.14 ? Math.min(1, drawdown * 2) : 0);
  if (rng.chance(0.08)) m.mood = clamp(m.mood * 0.5 + (rng.uniform() * 2 - 1) * 0.9, -1, 1);
  const age = Math.max(0, tick - t.createdTick);
  const playerBuy = Math.max(0, t.flows.playerBuy - (m.lastPlayerBuy ?? t.flows.playerBuy));
  const playerSell = Math.max(0, t.flows.playerSell - (m.lastPlayerSell ?? t.flows.playerSell));
  m.lastPlayerBuy = t.flows.playerBuy;
  m.lastPlayerSell = t.flows.playerSell;
  const pa = m.pa;
  // A reply is public chatter. While a reply's attention lasts it adds a little excitation (attention.ts); it is not an order.
  let replyAttn = false;
  for (const w of m.traders) {
    if (w.attnUntil === undefined) continue;
    if (tick > w.attnUntil) { w.attn = undefined; w.attnUntil = undefined; } else if ((w.attn ?? 0) !== 0) replyAttn = true;
  }
  if (replyAttn && pa) pa.e += PA.REPLY_EXCITE;
  paTick(g, t, m, out);
  copyFollow(g, t, m, out);
  if (t.status === 'live') {
    if (playerSell >= 200) {
      const reserve = cashReserveAt(t.y);
      const shock = Math.min(1, playerSell / Math.max(1000, reserve));
      m.panic = Math.max(m.panic, shock);
      const holders = m.traders.filter(w => holding(g, t, w).qty > 0);
      const nDump = Math.min(holders.length, Math.max(1, Math.floor(holders.length * Math.min(0.6, shock * 1.5))));
      for (let k = 0; k < nDump; k++) {
        const w = holders[Math.floor(rng.uniform() * holders.length)]!;
        const bag = holding(g, t, w);
        if (bag.qty <= 0) continue;
        const frac = 0.25 + 0.55 * shock * rng.uniform();
        const qty = Math.max(1, Math.floor(bag.qty * Math.min(0.9, frac)));
        if (sell(g, t, w, qty, out)) stamp(t, w, tick);
      }
    } else if (playerBuy >= 200 && m.panic < 0.35 && age < TPD * 0.5 && pa) {
      const room = Math.max(0, ECHO_CAP - pa.echo);
      const fomoBudget = Math.min(room, playerBuy * 0.22, cashReserveAt(t.y) * 0.012);
      if (fomoBudget >= 5) {
        const buyers = m.traders.filter(w => w.id.startsWith('lp:npc:trader:') && spendableCents(g, w) >= 500);
        const nFomo = Math.min(buyers.length, 1 + Math.floor(rng.uniform() * 3));
        let spent = 0;
        for (let k = 0; k < nFomo && spent + 1 <= fomoBudget; k++) {
          const w = buyers[Math.floor(rng.uniform() * buyers.length)]!;
          const slice = Math.min(spendableCents(g, w), Math.floor((fomoBudget - spent) * 100));
          if (slice >= 100 && buyCurve(g, null, t.ticker, slice, 1, out, true, false, w).ok) {
            spent += slice / 100;
            stamp(t, w, tick);
          }
        }
        pa.echo += spent;
      }
    }
  }
  const after = priceNow(g, t);
  m.momentum = clamp(m.momentum + 0.4 * Math.log(after / before), -0.6, 0.6);
  m.lastPrice = after;
  m.peak = Math.max(m.peak, after);
  m.rng = rng.state();
}
