import type { Msg } from '@/i18n';
import { placeOrder, portfolio, type AssetState, type OrderRequest } from '@/engine';
import { BIZ_BY_ID, BIZ_SECTOR_BY_ID } from '@/content/businesses';
import { rankIndex } from '@/content/lifestyle';
import { BOT_CADENCE, DATA_SOURCES, RESEARCH_BY_ID, mcsTier } from '@/content/research';
import {
  GPU_TIERS, TPD, assetFlow, cashOf, clamp, credit, debit, keyedRng, labValue, notify, playerBusinesses, priceOf, today,
} from './core';
import { crossRefusal } from './funds/guard';
import { noteOrderPlaced } from './eca';
import { controlledQty } from './tips';
import type { CommandResult, GameState, LabState, Model, StepOutput, TradingBot } from './types';

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, msg?: Msg): CommandResult => ({ ok: false, error, ...(msg ? { msg } : {}) });

export const LAB_RANK = 'R2';
const ALPHA = 0.34;
const BETA = 0.28;
const K = 0.25;

export function emptyLab(): LabState {
  return { gpus: {}, reserved: null, data: 0, dataSynth: 0, research: [], researching: null, models: [], training: null, researchers: 0, bots: [], lastSignalTick: -1e9, modelSeq: 0 };
}

export function labFor(g: GameState, pid: string): LabState {
  return (g.lab[pid] ??= emptyLab());
}

function gate(g: GameState, pid: string): string | null {
  const p = g.players[pid];
  if (!p) return 'no player';
  if (rankIndex(p.rankId) < rankIndex(LAB_RANK)) return 'the AI Lab unlocks at Owner ($250k)';
  return null;
}

/** Spot compute price per PFLOP-day: $1.20 at the reference Compute price of 120 (1 PFLOP-day = 10 GPUh). */
export function spotPflopPrice(g: GameState): number {
  return 1.2 * (priceOf(g, 'CMPT') / 120);
}

export function dataPrice(g: GameState): number {
  return priceOf(g, 'DATA') / 1000;
}

export function ownedPflopPerDay(lab: LabState): number {
  return GPU_TIERS.reduce((s, t) => s + (lab.gpus[t.id] ?? 0) * t.pflopPerDay, 0);
}

export function algorithmA(lab: LabState): number {
  return lab.research.reduce((a, id) => a * (RESEARCH_BY_ID.get(id)?.aMult ?? 1), 1);
}

export function bestModel(lab: LabState, kind: Model['kind']): Model | null {
  let m: Model | null = null;
  for (const x of lab.models) if (x.kind === kind && (!m || x.mcs > m.mcs)) m = x;
  return m;
}

/** Model Capability Score (bible 05): A × k × C^α × D^β × balance bonus × collapse penalty. */
export function mcsFor(lab: LabState, pflop: number, dqu: number, careful: boolean): number {
  const A = algorithmA(lab);
  const balance = 1 + 0.15 * Math.exp(-(Math.log(Math.max(1, dqu) / Math.max(1, pflop)) ** 2));
  const synthLimit = lab.research.includes('synthdata') ? 0.6 : 0.4;
  const collapse = lab.dataSynth > synthLimit ? Math.max(0.3, 1 - 1.2 * (lab.dataSynth - synthLimit)) : 1;
  return A * K * Math.max(1, pflop) ** ALPHA * Math.max(1, dqu) ** BETA * balance * collapse * (careful ? 1.05 : 1);
}

export function buyGpus(g: GameState, pid: string, tierId: string, qty: number): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  const t = GPU_TIERS.find((x) => x.id === tierId);
  if (!t) return fail('unknown GPU');
  if (rankIndex(g.players[pid]!.rankId) < rankIndex(t.rank)) return fail('unlocks at a higher rank');
  const n = Math.floor(qty);
  if (n === 0) return fail('enter a quantity');
  const lab = labFor(g, pid);
  if (n < 0) {
    const have = lab.gpus[t.id] ?? 0;
    if (-n > have) return fail('you have fewer');
    const before = labValue(g, pid);
    lab.gpus[t.id] = have + n;
    credit(g, pid, -n * t.price * 0.6, 'GPU resale');
    assetFlow(g, pid, labValue(g, pid) - before); // the cards leave the lab at resale value
    return ok();
  }
  const cost = n * t.price;
  if (cashOf(g, pid) < cost) return fail('not enough cash');
  const before = labValue(g, pid);
  debit(g, pid, cost, 'GPUs');
  lab.gpus[t.id] = (lab.gpus[t.id] ?? 0) + n;
  assetFlow(g, pid, labValue(g, pid) - before); // the cards enter the lab at resale value; the gap to the price is a trading cost
  return ok();
}

export function reserveCompute(g: GameState, pid: string, perDay: number, days: number): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  if (!(perDay > 0 && days >= 1 && days <= 63)) return fail('reserve 1 to 63 days');
  const cost = reserveCost(perDay, days, spotPflopPrice(g));
  if (cashOf(g, pid) < cost) return fail('not enough cash');
  debit(g, pid, cost, 'compute');
  labFor(g, pid).reserved = { perDay, untilTick: g.market.tick + Math.round(days) * TPD };
  return ok({ cost });
}

export function buyData(g: GameState, pid: string, sourceId: string, qty: number, out: StepOutput | null): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  const s = DATA_SOURCES.find((x) => x.id === sourceId);
  if (!s || s.id === 'partnership') return fail('unknown source');
  if (!(qty > 0)) return fail('enter a quantity');
  const cost = qty * dataPrice(g) * s.priceMult;
  if (cashOf(g, pid) < cost) return fail('not enough cash');
  debit(g, pid, cost, 'data');
  const lab = labFor(g, pid);
  const synth = lab.data * lab.dataSynth + (s.synthetic ? qty : 0);
  lab.data += qty;
  lab.dataSynth = synth / lab.data;
  if (s.legalRisk > 0) {
    const rng = keyedRng(g, `scrape:${pid}:${g.market.tick}:${qty}`);
    if (rng.chance(s.legalRisk)) {
      const fine = Math.max(1000, cost * 4);
      debit(g, pid, fine, 'fines');
      notify(g, out, pid, { kind: 'lab', tone: 'loss', text: `The data regulator fined your lab $${Math.round(fine).toLocaleString('en-US')} for scraping without a license.`, msg: { key: 'lab.msg.fined', vars: { fine: `#n:${Math.round(fine)},0,0` } } });
    }
  }
  return ok({ cost });
}

export function startResearch(g: GameState, pid: string, nodeId: string): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  const n = RESEARCH_BY_ID.get(nodeId);
  if (!n) return fail('unknown project');
  const lab = labFor(g, pid);
  if (lab.research.includes(nodeId)) return fail('already researched');
  if (lab.researching) return fail('one project at a time');
  if (!n.requires.every((r) => lab.research.includes(r))) return fail('research the prerequisites first');
  if (cashOf(g, pid) < n.cost) return fail('not enough cash');
  debit(g, pid, n.cost, 'research');
  const speed = 1 + 0.05 * lab.researchers;
  lab.researching = { nodeId, doneTick: g.market.tick + Math.round((n.days * TPD) / speed) };
  return ok();
}

const SESSION_DRAIN = { whisper: 0.02, tap: 0.05, siphon: 0.1 } as const;

export const RESEARCHER_SALARY = 1_500;

export function hireResearchers(g: GameState, pid: string, qty: number): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  const lab = labFor(g, pid);
  const n = Math.round(qty);
  if (lab.researchers + n < 0 || lab.researchers + n > 50) return fail('0 to 50 researchers');
  lab.researchers += n;
  return ok();
}

export interface TrainingPlan {
  /** PFLOP-days bought with the budget at spot. */
  spot: number;
  /** Game days the run takes. */
  days: number;
  /** Total compute: spot plus owned and reserved PFLOP-days over the run. */
  pflop: number;
  /** Data the run consumes. */
  dqu: number;
  expectedMcs: number;
  failOdds: number;
}

/**
 * What a training run would do with this budget. startTraining uses it, and the AI Lab shows the same
 * numbers before the player commits, so a preview cannot drift from the run. Reads only; it changes nothing.
 */
export function trainingPlan(lab: LabState, budget: number, careful: boolean, spotPrice: number, tick: number): TrainingPlan {
  const spot = budget / spotPrice;
  let days = 1 + 0.5 * Math.log10(1 + spot);
  if (careful) days *= 1.5;
  if (lab.research.includes('distributed')) days *= 0.7;
  const reserved = lab.reserved && lab.reserved.untilTick > tick ? lab.reserved.perDay : 0;
  const pflop = spot + (ownedPflopPerDay(lab) + reserved) * days;
  const dqu = Math.min(lab.data, pflop * 1.5);
  const expectedMcs = mcsFor(lab, pflop, dqu, careful);
  const failOdds = Math.max(0.02, (careful ? 0.06 : 0.18) - 0.01 * lab.researchers);
  return { spot, days, pflop, dqu, expectedMcs, failOdds };
}

/** Cash a compute reserve costs for perDay PFLOP-days a day over days, at the spot price. */
export function reserveCost(perDay: number, days: number, spotPrice: number): number {
  return perDay * days * 2.0 * (spotPrice / 1.2);
}

export function startTraining(g: GameState, pid: string, kind: Model['kind'], nameIn: string, budget: number, careful: boolean): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  const lab = labFor(g, pid);
  if (lab.training) return fail('a run is already in progress');
  if (kind === 'security' && !lab.research.includes('anomaly')) return fail('research anomaly detection first');
  if (kind === 'analyst' && !lab.research.includes('regression')) return fail('research regression models first');
  if (kind === 'trading' && !lab.research.includes('rules')) return fail('research rule-based scripts first');
  if (!(budget >= 0)) return fail('bad budget');
  if (cashOf(g, pid) < budget) return fail('not enough cash');
  if (budget === 0 && ownedPflopPerDay(lab) === 0) return fail('you need a budget or your own GPUs');
  debit(g, pid, budget, 'compute');
  const plan = trainingPlan(lab, budget, careful, spotPflopPrice(g), g.market.tick);
  const { pflop, dqu, days, expectedMcs, failOdds } = plan;
  lab.data -= dqu;
  const name = (nameIn || `${kind} model`).replace(/[\u0000-\u001f]/g, '').slice(0, 32);
  lab.training = { kind, name, budget, pflopDays: pflop, dqu, careful, startTick: g.market.tick, doneTick: g.market.tick + Math.round(days * TPD), expectedMcs, failOdds };
  return ok({ expectedMcs, failOdds, days });
}

export function deployBot(g: GameState, pid: string, modelId: string, strategy: TradingBot['strategy'], assets: string[], allocation: number): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  const lab = labFor(g, pid);
  const m = lab.models.find((x) => x.id === modelId && x.kind === 'trading');
  if (!m) return fail('pick a trading model');
  const need: Record<TradingBot['strategy'], string> = { momentum: 'rules', meanrev: 'rules', value: 'trees', earnings: 'nlp', trend: 'rl' };
  if (!lab.research.includes(need[strategy])) return fail(`research ${RESEARCH_BY_ID.get(need[strategy])!.name} first`, { key: 'lab.refuse.researchFirst', vars: { name: RESEARCH_BY_ID.get(need[strategy])!.name } });
  const list = [...new Set(assets)].filter((a) => g.market.config.assets.some((d) => d.id === a && d.listed !== false)).slice(0, 12);
  if (!list.length) return fail('pick at least one asset');
  if (lab.bots.length >= 8) return fail('8 bots at most');
  const used = lab.bots.filter((b) => b.active).reduce((s, b) => s + b.allocation, 0);
  const alloc = clamp(allocation, 0.01, 1);
  if (used + alloc > 1.0001) return fail('your bots would use more than 100% of equity');
  lab.modelSeq++;
  lab.bots.push({ id: `bot${lab.modelSeq}`, modelId, strategy, assets: list, allocation: alloc, active: true, pnl: 0, trades: 0, lastRunTick: 0, memory: {} });
  return ok();
}

export function toggleBot(g: GameState, pid: string, botId: string, active: boolean): CommandResult {
  const b = labFor(g, pid).bots.find((x) => x.id === botId);
  if (!b) return fail('unknown bot');
  b.active = active;
  return ok();
}

/**
 * Analyst signal (bible 05 product line): the player's analyst model reads the market's hidden
 * fair values and returns the biggest mispricings, with noise that shrinks as MCS grows. One
 * signal pack per game day.
 */
export function analystSignal(g: GameState, pid: string, out: StepOutput | null): CommandResult {
  const e = gate(g, pid); if (e) return fail(e);
  const lab = labFor(g, pid);
  const m = bestModel(lab, 'analyst');
  if (!m) return fail('train an analyst model first');
  if (g.market.tick - lab.lastSignalTick < TPD) return fail('one signal pack per game day');
  lab.lastSignalTick = g.market.tick;
  const rng = keyedRng(g, `signal:${pid}:${g.market.tick}`);
  const noise = 0.12 / (1 + m.mcs / 60);
  const picks = g.market.config.assets
    .map((d, i) => ({ d, gap: g.market.assets[i]!.lnV - g.market.assets[i]!.lnP + noise * rng.normal() }))
    .filter((x) => x.d.assetClass === 'stock' || x.d.assetClass === 'crypto')
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 5);
  const text = picks.map((x) => `${x.d.id} ${x.gap > 0 ? 'undervalued' : 'overvalued'} ~${(Math.abs(x.gap) * 100).toFixed(0)}%`).join(' · ');
  notify(g, out, pid, { kind: 'lab', tone: 'info', text: `${m.name} signal pack: ${text}`, msg: { key: 'lab.msg.signalPack', vars: { model: m.name, picks: picks.map((x) => ({ key: 'lab.msg.pick', vars: { asset: x.d.id, dir: `@${x.gap > 0 ? 'lab.msg.undervalued' : 'lab.msg.overvalued'}`, pct: `#n:${(Math.abs(x.gap) * 100).toFixed(0)},0,0` } })) } } });
  return ok(picks.map((x) => ({ assetId: x.d.id, gap: x.gap })));
}

/** Per tick: research and training completion, bots. Per day: power and salaries, data decay and partnership data. */
export function labTick(g: GameState, out: StepOutput, newDay: boolean): void {
  const tick = g.market.tick;
  for (const [pid, lab] of Object.entries(g.lab)) {
    if (!g.players[pid]) continue;
    if (lab.researching && tick >= lab.researching.doneTick) {
      const n = RESEARCH_BY_ID.get(lab.researching.nodeId)!;
      lab.research.push(n.id);
      lab.researching = null;
      g.players[pid]!.stats.researchDone++;
      notify(g, out, pid, { kind: 'lab', tone: 'brass', text: `Research complete: ${n.name}.${n.unlocks ? ` Unlocked: ${n.unlocks}.` : ''}`, msg: n.unlocks ? { key: 'lab.msg.researchUnlocked', vars: { name: n.name, unlocks: n.unlocks } } : { key: 'lab.msg.researchDone', vars: { name: n.name } } });
    }
    if (lab.training && tick >= lab.training.doneTick) {
      const t = lab.training;
      lab.training = null;
      const rng = keyedRng(g, `train:${pid}:${t.startTick}`);
      if (rng.chance(t.failOdds)) {
        notify(g, out, pid, { kind: 'lab', tone: 'loss', text: `Training run "${t.name}" diverged and failed. The compute is gone.${t.careful ? '' : ' Careful runs fail less often.'}`, msg: { key: t.careful ? 'lab.msg.diverged' : 'lab.msg.divergedHint', vars: { name: t.name } } });
      } else {
        lab.modelSeq++;
        const mcs = t.expectedMcs * Math.exp(0.1 * rng.normal());
        lab.models.push({ id: `m${lab.modelSeq}`, name: t.name, kind: t.kind, mcs, createdTick: tick, residue: 0 });
        g.players[pid]!.stats.trainingRuns++;
        notify(g, out, pid, { kind: 'lab', tone: 'gain', text: `Training run "${t.name}" finished: MCS ${mcs.toFixed(0)} (tier ${mcsTier(mcs)}).`, msg: { key: 'lab.msg.trained', vars: { name: t.name, mcs: `#n:${mcs.toFixed(0)},0,0`, tier: mcsTier(mcs) } } });
      }
    }
    for (const bot of lab.bots) {
      if (!bot.active) continue;
      const m = lab.models.find((x) => x.id === bot.modelId);
      if (!m) { bot.active = false; continue; }
      const cadence = lab.research.includes('agents') ? 1 : BOT_CADENCE[mcsTier(m.mcs)]!;
      if (tick - bot.lastRunTick < cadence) continue;
      bot.lastRunTick = tick;
      // hostile sessions eat compute: the bot skips runs in proportion (the "slowdown" clue)
      const drain = Math.min(0.2, Object.values(g.cyber.entries).reduce((s, e) => s + (e.ownerId === pid && e.hostile ? SESSION_DRAIN[e.hostile.strength] : 0), 0));
      if (drain > 0 && keyedRng(g, `drain:${pid}:${bot.id}:${tick}`).chance(drain)) continue;
      runBot(g, pid, bot, m, out);
    }
    if (newDay) {
      // OpEx: power for owned GPUs (offset by the owner's own power plants) and salaries
      const mwh = GPU_TIERS.reduce((s, t) => s + (lab.gpus[t.id] ?? 0) * t.powerMwhPerDay, 0);
      const ownPower = playerBusinesses(g, pid).reduce((s, b) => s + (BIZ_BY_ID.get(b.defId)?.power ?? 0), 0);
      const buy = Math.max(0, mwh - ownPower);
      debit(g, pid, buy * priceOf(g, 'PWR'), 'power');
      debit(g, pid, lab.researchers * RESEARCHER_SALARY, 'salaries');
      // data decays (freshness) and partnerships deliver new data from the owner's businesses
      lab.data *= 0.98;
      let fresh = 0;
      for (const b of playerBusinesses(g, pid)) {
        const sec = BIZ_SECTOR_BY_ID.get(BIZ_BY_ID.get(b.defId)!.sector)!;
        fresh += (b.incomePerDay / 1e6) * sec.dataPerM * 1000 * (1 + 0.25 * b.levels.research);
      }
      if (fresh > 0) {
        const synth = lab.data * lab.dataSynth;
        lab.data += fresh;
        lab.dataSynth = synth / lab.data;
      }
    }
  }
  void today;
}

/**
 * A strategy block's raw signal for one asset, before the model's noise (bible 02). Pure apart from the trend bot's EMA
 * memory, which it updates in place. Shared by the live bots (runBot) and the isolated tournament runs (tournament.ts),
 * so a model in a tournament trades the same rules it trades in the game.
 */
export function strategySignal(strategy: TradingBot['strategy'], assetId: string, a: AssetState, memory: Record<string, number>, tick: number, held: number): number {
  switch (strategy) {
    case 'momentum': return (a.lnP - a.lnOpen) * 40;
    case 'meanrev': return -(a.lnP - a.lnOpen) * 40;
    case 'value': return (a.lnV - a.lnP) * 15;
    case 'trend': {
      const ema = memory[assetId] ?? a.lnP;
      memory[assetId] = ema + 0.05 * (a.lnP - ema);
      return (a.lnP - ema) * 60;
    }
    case 'earnings': {
      const c = a.consensus ?? 0;
      return a.nextEarnings !== undefined && a.nextEarnings - Math.floor(tick / TPD) <= 2 ? c * 2 + (a.rumor ?? 0) : -Math.sign(held);
    }
  }
}

/**
 * Trading bots run on the same order API as humans (bible 02: no player code on the server, only
 * strategy blocks). Better models see a less noisy market; crowded strategies decay.
 */
function runBot(g: GameState, pid: string, bot: TradingBot, m: Model, out: StepOutput): void {
  const pf = portfolio(g.market, pid);
  const budgetPerAsset = (pf.equity * bot.allocation) / bot.assets.length;
  const crowd = Object.values(g.lab).reduce((s, l) => s + l.bots.filter((b) => b.active && b.strategy === bot.strategy).length, 0);
  const noise = (0.08 / (1 + m.mcs / 80)) * (1 + 0.05 * Math.max(0, crowd - 5));
  const rng = keyedRng(g, `bot:${pid}:${bot.id}:${g.market.tick}`);
  for (const assetId of bot.assets) {
    const i = g.market.config.assets.findIndex((a) => a.id === assetId);
    if (i < 0) continue;
    const a = g.market.assets[i]!;
    const def = g.market.config.assets[i]!;
    const px = Math.exp(a.lnP);
    const held = g.market.accounts[pid]?.positions[assetId]?.qty ?? 0;
    let signal = strategySignal(bot.strategy, assetId, a, bot.memory, g.market.tick, held);
    signal += noise * 10 * rng.normal();
    const step = def.qtyStep ?? (def.assetClass === 'stock' ? 1 : 0);
    const round = (q: number) => (step === 1 ? Math.floor(q) : Math.floor(q * 1e4) / 1e4);
    let req: Omit<OrderRequest, 'playerId'> | null = null;
    if (signal > 0.6 && held <= 0) {
      const q = round(budgetPerAsset / px);
      if (q > 0) req = { assetId, side: 'buy', type: 'market', qty: held < 0 ? -held + q : q };
    } else if (signal < -0.6 && held > 0) {
      req = { assetId, side: 'sell', type: 'market', qty: held };
    }
    if (!req) continue;
    // a lab order is a personal order: it may not match a fund's open order that the player or a linked account controls
    if (crossRefusal(g, pid, req.assetId, req.side, { fund: false })) continue;
    const posBefore = controlledQty(g, pid, req.assetId);
    const r = placeOrder(g.market, { ...req, playerId: pid });
    if (r.order.status === 'open') {
      g.market = r.state;
      bot.trades++;
      // the model's order is the player's trade: the tip rules score it on the player's account (eca.ts noteOrderPlaced)
      noteOrderPlaced(g, pid, req.assetId, req.side, req.qty, posBefore, r.order.id);
    }
  }
  void out; void credit;
}
