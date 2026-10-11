import {
  cancelOrderResult, createWorld, forceWorldEvent, indexLevel, modifyOrder, placeOrder, seedStream, step, tradeOption, universeConfig,
  type WorldConfig,
} from '@/engine';
import {
  BOARD_EVERY, CHAPTER_TICKS, CREDIT_EVERY, NW_EVERY, SHARE_EVERY, TPD, cashOf, credit, creditExternal, debit, drawFrom, findOrder, newOutput, notify, sanitize,
} from './core';
import {
  accrueBusinesses, businessEvents, buyBusiness, buyItem, buyNote, buyProperty, lifestyleDay, propertyDay, recomputeShares,
  refreshNetWorth, renameBusiness, renovateProperty, repayMortgage, sellBusiness, sellItem, sellProperty, setHome, upgradeBusiness,
} from './assets';
import { shopCommand, shopsDay } from './shops';
import { enterTournament, settleTournament, TOURNAMENT_SYSTEM, TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import { adminOpenLots, auctionTick, placeBid } from './auctions';
import { adminStreakAccent, claimStreak, markStreakAction } from './streak';
import { insuranceWeek, lossDay, setInsurance } from './insurance';
import { placeInSlot, setVisibility } from './home';
import { newsFromEvents, filings } from './news';
import {
  addAlert, applyRank, checkAchievements, checkAlerts, claimContract, join, pickRivals, rollContracts, tradeStats,
  updateContracts, updateProfile,
} from './players';
import {
  allianceDeposit, allianceKick, alliancePromote, allianceWithdraw, cancelDeal, createAlliance, dealsDay, joinAlliance,
  leaveAlliance, offerDeal, postChat, repayDeal, respondDeal,
} from './social';
import { chapterCheck, computeBoards, emptyBoards, stabilizerDay } from './boards';
import {
  analystSignal, bestModel, buyData, buyGpus, deployBot, emptyLab, hireResearchers, labFor, labTick, reserveCompute,
  startResearch, startTraining, toggleBot,
} from './lab';
import { cyberDay, deployHoneypot, disconnect, emptyCyber, lockdown, manualScan, plantSession, setBudget, tagEntry } from './cyber';
import { attackFund, rivalCrewDay } from './rivalCrews';
import { acceptSettlement, courtTick, fileCase, offerSettlement } from './court';
import { adminSeedInquiry, ecaDay, ecaEvents, ecaFills, noteOrderPlaced } from './eca';
import { adminSeedTip, controlledQty, tipsDay } from './tips';
import { collusionDay, noteFills } from './collusion';
import { npcTick, seedNpcs } from './npc';
import { shockPrice } from '@/engine/sim';
import { ensureLedger, ledgerTick, recordOptionTrade } from './ledger';
import { closeDay, recordDayClose } from './close';
import { hireAnalyst, fireAnalyst, resumeDesk, unlockDesk, workDay } from './work';
import { deskFileOf, deskQuery } from './desk';
import { tripDetail } from './journal';
import { addRecurring, cancelBlock, cancelRecurring, dripDay, planDay, planTick, setDrip, startBlock } from './plans';
import { checkGoals, claimChallenge, completeLesson, setGoalsOptIn } from './learn';
import { applyFundCommand, crossRefusal, fundsBeforeStep, fundsDay, fundsFills, type FundCommand } from './funds';
import { orderError } from './orders';
import { comebackCommand, comebackMarginRefusal, comebackRefresh, comebackTick } from './comeback';
import { adOptionRefusal, adOrderRefusal, finishBreak, pruneAdLots, sponsorDayStart, startBreak } from './sponsor';
import { lessonsRebateOf } from './perks';
import { launchpadCommand, lockedEngineSell, lpFills, lpTick, refuse as lpRefuse, ensureLaunchpad, vestingSweep } from './launchpad';
import { companyCommand, companyDay, companyFinanceCommand, companyStep, type CompanyFinanceCommand } from './company/bridge';
import { adminIpoReady } from './company/ipo';
import { scorePlanAbuse, scoreWindowAttempt } from './company/backstop';
import { adminFiledLate, adminLaunchCredit } from './company/seams';
import type { Command, CommandResult, GameState, StepOutput } from './types';

export interface CreateOptions {
  /** game days simulated before the world opens, so charts have history (default 63) */
  warmupDays?: number;
  config?: Partial<WorldConfig>;
  npcs?: boolean;
  /** the world launches NPC tokens on the Launchpad. Off by default (the bare test worlds keep every fingerprint); the server's game world turns it on (server/host.ts). */
  launchpadNpc?: boolean;
  /** called during warmup with progress 0..1 and every tick's state (for history recording) */
  onWarmupTick?: (g: GameState) => void;
}

export function createGame(seed: string, opts: CreateOptions = {}): GameState {
  const market = createWorld(seed, universeConfig(opts.config ?? {}));
  const g: GameState = {
    version: 2,
    seed,
    market,
    players: {},
    businesses: {},
    bizSeq: 0,
    properties: {},
    propSeq: 0,
    wire: [],
    wireSeq: 0,
    chat: { world: [] },
    chatSeq: 0,
    alliances: {},
    allianceSeq: 0,
    deals: {},
    dealSeq: 0,
    boards: emptyBoards(),
    ledgers: {},
    dayCloses: {},
    collectibles: 1,
    economy: { faucets: {}, sinks: {}, moneyIndex: 1, stabilizer: { integral: 0, sinkMult: 1, lastSupply: 0 } },
    chapter: { number: 1, startTick: 0, endTick: CHAPTER_TICKS },
    hallOfFame: [],
    lab: {},
    cyber: emptyCyber(),
    court: { cases: {}, seq: 0 },
    rng: {
      biz: seedStream(seed, 'world:biz'), npc: seedStream(seed, 'world:npc'), world: seedStream(seed, 'world:misc'),
      cyber: seedStream(seed, 'world:cyber'), court: seedStream(seed, 'world:court'), lab: seedStream(seed, 'world:lab'),
    },
  };
  const warm = (opts.warmupDays ?? 63) * g.market.config.ticksPerDay;
  for (let k = 0; k < warm; k++) {
    const r = step(g.market);
    g.market = r.state;
    const out = newOutput();
    newsFromEvents(g, r.events, out);
    // the day records start here, so the benchmark's momentum lookback has its closes from the first real day
    if (g.market.tick % g.market.config.ticksPerDay === 0) recordDayClose(g, Math.floor((g.market.tick - 1) / g.market.config.ticksPerDay), g.market.tick);
    opts.onWarmupTick?.(g);
  }
  g.chapter = { number: 1, startTick: g.market.tick, endTick: g.market.tick + CHAPTER_TICKS };
  if (opts.npcs !== false) seedNpcs(g);
  if (opts.launchpadNpc) ensureLaunchpad(g).npcLaunches = true;
  computeBoards(g);
  return g;
}

/** Advance the world one tick (5 real seconds). Mutates `g` and returns what changed. */
export function stepGame(g: GameState): StepOutput {
  const out = newOutput();
  const realizedBefore: Record<string, number> = {};
  for (const [id, a] of Object.entries(g.market.accounts)) realizedBefore[id] = a.realizedPnl;
  const ordersBefore = new Map(g.market.orders.filter((o) => o.status === 'open').map((o) => [o.id, o]));
  // every human has a ledger before the tick, so its mirror starts from the account the engine is about to change
  for (const p of Object.values(g.players)) if (!p.npc) ensureLedger(g, p.id);

  // a fund order that an alliance change has put opposite a linked order is cancelled before the engine can match them
  fundsBeforeStep(g, out);
  // the Launchpad's vesting re-check, before the engine matches (lead-launchpad.md L5): resting creator sells are cut to what is unlocked
  vestingSweep(g, out);
  const r = step(g.market);
  g.market = r.state;
  const tick = g.market.tick;
  const newDay = tick > 1 && (tick - 1) % TPD === 0;

  newsFromEvents(g, r.events, out);
  for (const f of r.fills) out.fills.push({ playerId: f.playerId, assetId: f.assetId, side: f.side, qty: f.qty, price: f.price, fee: f.fee, orderId: f.orderId });
  ledgerTick(g, r.events, r.fills);
  fundsFills(g, r.fills, out);
  // the collusion graph (fills only feed the mirror score), then the ECA's pre-announcement window (eca.ts)
  noteFills(g, r.fills);
  ecaFills(g, r.fills);
  ecaEvents(g, r.events);
  lpFills(g, r.fills, out);
  // Lessons learned (velvet-bankruptcy.md): half the fee of a fill back while the perk runs, a booked faucet
  for (const f of r.fills) {
    const fp = g.players[f.playerId];
    const rebate = fp && !fp.npc ? lessonsRebateOf(fp, tick, f.fee) : 0;
    if (rebate > 0) credit(g, f.playerId, rebate, 'lessons rebate');
  }
  companyStep(g, r.fills, r.events);
  tradeStats(g, r.fills, realizedBefore, out);
  const stillOpen = new Set(g.market.orders.filter((o) => o.status === 'open').map((o) => o.id));
  for (const before of ordersBefore.values()) {
    if (stillOpen.has(before.id)) continue;
    const o = findOrder(g, before.playerId, before.id);
    if (!o || o.closedTick !== tick || o.status === 'filled') continue;
    if (o.status === 'cancelled' && !o.rejectReason) continue;
    out.closed.push(o);
    const what = `${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.qty} ${o.assetId}`;
    notify(g, out, o.playerId, {
      kind: 'order', tone: o.status === 'expired' ? 'info' : 'loss',
      text: o.status === 'expired' ? `${what} expired at the close` : `${what} closed: ${o.rejectReason ?? o.status}`,
    });
  }

  if (tick % SHARE_EVERY === 0) recomputeShares(g);
  accrueBusinesses(g, tick % CREDIT_EVERY === 0, out);
  labTick(g, out, newDay);
  courtTick(g, out);

  if (newDay) {
    businessEvents(g, out);
    shopsDay(g, out);
    propertyDay(g, out);
    lifestyleDay(g);
    dealsDay(g, out);
    securityDay(g, out);
    stabilizerDay(g);
    // collectibles index: slow random walk with a gentle upward drift
    const { rng, save } = drawFrom(g, "world");
    g.collectibles = Math.max(0.6, Math.min(2.5, g.collectibles * Math.exp(0.0004 + 0.006 * rng.normal())));
    save();
    for (const p of Object.values(g.players)) if (!p.npc) rollContracts(g, p);
    pruneAdLots(g);
    // the analyst and desk dues, recurring buys, and DRIP on the day's dividends (orders fill at the next tick)
    workDay(g, out);
    planDay(g, out);
    dripDay(g, out, r.events);
    companyDay(g, out);
    fundsDay(g, out);
    // insider tips arrive once the report's surprise is locked; then the regulator's day close (M16 v2)
    tipsDay(g, out);
    ecaDay(g, out);
    collusionDay(g);
  }

  if (tick % NW_EVERY === 0 || newDay) {
    for (const p of Object.values(g.players)) {
      refreshNetWorth(g, p);
      applyRank(g, p, out);
      if (!p.npc) {
        checkAlerts(g, p, out);
        updateContracts(g, p, out);
        checkGoals(g, p, out);
      }
      filings(g, p.id, out);
    }
    comebackRefresh(g, out);
    // the real-day snapshot of cash for the sponsor offer (a no-op inside a real day that already has one)
    if (newDay) sponsorDayStart(g);
  }
  if (tick % BOARD_EVERY === 0) {
    computeBoards(g);
    for (const p of Object.values(g.players)) checkAchievements(g, p, out);
    pickRivals(g);
  }
  planTick(g, out);
  npcTick(g, (gg, pid, cmd) => applyCommand(gg, pid, cmd, out));
  lpTick(g, out);
  comebackTick(g, out);
  auctionTick(g, out);
  insuranceWeek(g, out);
  chapterCheck(g, out);
  // the close: after the net worth refresh of this tick, so the card and the ghosts read the day's final marks
  if (tick % TPD === 0) closeDay(g, out);
  return out;
}

const fail = (error: string): CommandResult => ({ ok: false, error });

/** Apply one player command at the current tick. Mutates `g`. Deterministic. */
/**
 * The e2e price shock (tape-e2e-conventions.md section 3). Only the admin route sends it (the server refuses
 * admin.* from clients). A refused move is a failed result, not a throw.
 */
function adminEvent(g: GameState, kind: string, days?: number): CommandResult {
  if (kind !== 'crash' && kind !== 'bubble' && kind !== 'crisis' && kind !== 'flash') return { ok: false, error: 'unknown event kind' };
  const next = forceWorldEvent(g.market, kind as 'crash' | 'bubble' | 'crisis' | 'flash', days, true);
  if (!next?.active) return { ok: false, error: 'an event is already live' };
  // the GX level at the start, as the engine's own start path records it (the banner's "since it began")
  if (g.market.config.indices.some((x) => x.id === 'GX')) next.active.gxStart = indexLevel(g.market, 'GX');
  g.market.worldEvents = next;
  return { ok: true };
}

function adminShock(g: GameState, assetId: string, pct: number): CommandResult {
  try {
    g.market.assets = shockPrice(g.market, assetId, pct).assets;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Apply one command. A successful action (anything but presence, the claim and the read receipts) also records the day's
 * action for the streak (streak.ts).
 */
export function applyCommand(g: GameState, pid: string, cmd: Command, out: StepOutput | null = null): CommandResult {
  const r = applyCommandInner(g, pid, cmd, out);
  if (r.ok && STREAK_ACTIONS.has(cmd.type)) markStreakAction(g, pid);
  return r;
}

const STREAK_ACTIONS = new Set<Command['type']>([
  'order.place', 'order.cancel', 'order.modify', 'position.close', 'option.trade', 'biz.buy', 'biz.upgrade', 'biz.sell', 'biz.rename',
  'biz.crew', 'biz.price', 'biz.quality', 'biz.marketing', 'biz.maintain', 'biz.manager.hire', 'biz.manager.fire', 'prop.buy', 'prop.sell',
  'prop.renovate', 'prop.home', 'prop.repay', 'life.buy', 'life.sell', 'note.buy', 'contract.claim', 'chat.send', 'auction.bid',
  'lab.gpu', 'lab.reserve', 'lab.data', 'lab.research', 'lab.hire', 'lab.train', 'lab.bot', 'lab.botToggle', 'lab.signal', 'tournament.enter',
  'alliance.deposit', 'alliance.withdraw', 'deal.offer', 'deal.respond', 'deal.repay', 'watch.set', 'alert.add', 'alert.remove',
]);

function applyCommandInner(g: GameState, pid: string, cmd: Command, out: StepOutput | null = null): CommandResult {
  if (cmd.type === 'join') return join(g, pid, cmd.handle, cmd.country, out, cmd.device);
  // the server settles a tournament week as TOURNAMENT_SYSTEM, which is not a player; a player's own call is refused here
  if (cmd.type === 'tournament.settle') return pid === TOURNAMENT_SYSTEM ? settleTournament(g, cmd.week, cmd.seeds, cmd.rows, out) : { ok: false, error: 'tnServerOnly' };
  if (cmd.type === 'admin.shock') return adminShock(g, cmd.assetId, cmd.pct);
  if (cmd.type === 'admin.event') return adminEvent(g, cmd.kind, cmd.days);
  if (cmd.type === 'admin.age') {
    const target = g.players[cmd.playerId];
    if (!target) return fail('unknown player');
    target.joinedTick -= Math.max(0, cmd.ticks);
    return { ok: true };
  }
  if (cmd.type === 'admin.ipoReady') return adminIpoReady(g, cmd.playerId);
  if (cmd.type === 'admin.filedLate') return adminFiledLate(g, cmd.playerId);
  if (cmd.type === 'admin.launchCredit') return adminLaunchCredit(g, cmd.playerId, cmd.score);
  if (cmd.type === 'admin.lpFill') return launchpadCommand(g, pid, cmd, out) ?? fail('unknown command');
  if (cmd.type === 'admin.tip') return adminSeedTip(g, cmd.playerId, cmd.assetId, out);
  if (cmd.type === 'admin.inquiry') return adminSeedInquiry(g, cmd.playerId, cmd.assetId, out);
  if (cmd.type === 'admin.streakAccent') return adminStreakAccent(g, cmd.playerId, cmd.accent);
  if (cmd.type === 'admin.auctionOpen') return adminOpenLots(g, cmd.week ?? Math.floor(g.market.tick / TOURNAMENT_WEEK_TICKS), cmd.ticksLeft);
  const p = g.players[pid];
  if (!p) return fail('join the world first');
  if (!p.npc) p.lastSeenTick = g.market.tick;
  const held = p.heldUntil > g.market.tick;

  switch (cmd.type) {
    case 'presence': {
      p.online = cmd.online;
      if (cmd.online) rollContracts(g, p);
      return { ok: true };
    }
    case 'order.place': {
      const o = cmd.order;
      // the license, the court hold and simple mode's cap until Hustler (orders.ts), even when onboarding was skipped
      const err = orderError(g, p, o);
      if (err) return fail(err);
      // ad cash cannot be margin: a buy past the cash, or a short (velvet-rewarded-ads.md, ROADMAP C5)
      const adErr = adOrderRefusal(g, pid, { ...o, playerId: pid });
      if (adErr) return fail(adErr);
      // a fresh start blocks margin for 14 real days (ROADMAP 2.6): a buy past the cash and a short are refused
      const marginErr = comebackMarginRefusal(g, pid, { ...o, playerId: pid });
      if (marginErr) return fail(marginErr);
      // a creator's vesting-locked allocation cannot be sold after graduation (L5)
      if (o.side === 'sell' && lockedEngineSell(g, pid, o.assetId, o.qty)) return lpRefuse('lockedEngine', { ticker: o.assetId });
      const posBefore = controlledQty(g, pid, o.assetId);
      const r = placeOrder(g.market, { ...o, playerId: pid });
      g.market = r.state;
      if (r.order.status === 'rejected') {
        // an insider's order refused by the window is a closed-window attempt (O-15)
        if (r.order.rejectReason === 'closedWindow') scoreWindowAttempt(g, pid, o.assetId);
        return { ok: false, error: r.order.rejectReason ?? 'rejected', data: r.order };
      }
      // a trade on an insider tip is flagged when placed (M16 v1); every accepted order feeds the size factor's median (eca.ts)
      noteOrderPlaced(g, pid, o.assetId, o.side, o.qty, posBefore);
      return { ok: true, data: r.order };
    }
    case 'order.cancel': {
      const o = g.market.orders.find((x) => x.id === cmd.orderId);
      if (!o || o.playerId !== pid) return fail('not your order');
      // the engine's cancel route reports a program order's refusal (planImmutable, buybackImmutable) to the player (B1)
      const res = cancelOrderResult(g.market, pid, cmd.orderId);
      if (res.error) {
        // a committed plan cannot be cancelled: the attempt is plan abuse (O-15)
        if (res.error === 'planImmutable') scorePlanAbuse(g, pid, o.assetId);
        return fail(res.error);
      }
      g.market = res.state;
      return { ok: true };
    }
    case 'order.modify': {
      const mo = g.market.orders.find((x) => x.id === cmd.orderId);
      const r = modifyOrder(g.market, pid, cmd.orderId, {
        ...(cmd.qty !== undefined ? { qty: cmd.qty } : {}), ...(cmd.limitPrice !== undefined ? { limitPrice: cmd.limitPrice } : {}),
        ...(cmd.stopPrice !== undefined ? { stopPrice: cmd.stopPrice } : {}), ...(cmd.trailPct !== undefined ? { trailPct: cmd.trailPct } : {}),
      });
      if (r.error) {
        if (r.error === 'planImmutable' && mo) scorePlanAbuse(g, pid, mo.assetId);
        return fail(r.error);
      }
      g.market = r.state;
      return { ok: true };
    }
    case 'position.close': {
      const q = g.market.accounts[pid]?.positions[cmd.assetId]?.qty ?? 0;
      if (!q) return fail('no position');
      if (q > 0 && lockedEngineSell(g, pid, cmd.assetId, q)) return lpRefuse('lockedEngine', { ticker: cmd.assetId });
      const refused = crossRefusal(g, pid, cmd.assetId, q > 0 ? 'sell' : 'buy', { fund: false });
      if (refused) return fail(refused);
      const posBefore = controlledQty(g, pid, cmd.assetId);
      const r = placeOrder(g.market, { playerId: pid, assetId: cmd.assetId, side: q > 0 ? 'sell' : 'buy', type: 'market', qty: Math.abs(q), reduceOnly: true });
      g.market = r.state;
      if (r.order.status === 'rejected') return fail(r.order.rejectReason ?? 'rejected');
      // a reduce-only close is a trade like any other for the tip rules (a close that sells a pre-tip long is not flagged)
      noteOrderPlaced(g, pid, cmd.assetId, q > 0 ? 'sell' : 'buy', Math.abs(q), posBefore);
      return { ok: true, data: r.order };
    }
    case 'option.trade': {
      if (held && cmd.side === 'buy') return fail('your assets are held by the court');
      const derivErr = adOptionRefusal(g, pid, cmd.side);
      if (derivErr) return fail(derivErr);
      const before = g.market.accounts[pid]?.realizedPnl ?? 0;
      const r = tradeOption(g.market, pid, cmd.contractId, cmd.side, cmd.qty);
      if (r.error) return fail(r.error);
      g.market = r.state;
      p.stats.trades++;
      const realized = (g.market.accounts[pid]?.realizedPnl ?? 0) - before;
      if (cmd.side === 'sell' && realized > 0) { p.stats.optionsWon++; p.stats.winningTrades++; }
      if (r.fill) recordOptionTrade(g, pid, cmd.contractId, cmd.side, cmd.qty, r.fill.price, r.fill.fee, realized, g.market.tick);
      return { ok: true, data: r.fill };
    }
    case 'biz.buy': return buyBusiness(g, pid, cmd.defId, cmd.cityId, cmd.name, out);
    case 'biz.upgrade': return upgradeBusiness(g, pid, cmd.bizId, cmd.axis);
    case 'biz.sell': return held ? fail('your assets are held by the court') : sellBusiness(g, pid, cmd.bizId, out);
    case 'biz.rename': return renameBusiness(g, pid, cmd.bizId, cmd.name);
    case 'biz.crew':
    case 'biz.price':
    case 'biz.quality':
    case 'biz.marketing':
    case 'biz.maintain':
    case 'biz.manager.hire':
    case 'biz.manager.fire': return shopCommand(g, pid, cmd) ?? fail('unknown command');
    case 'prop.buy': return buyProperty(g, pid, cmd.cityId, cmd.districtId, cmd.typeId, cmd.ltv, out);
    case 'prop.sell': return held ? fail('your assets are held by the court') : sellProperty(g, pid, cmd.propId);
    case 'prop.renovate': return renovateProperty(g, pid, cmd.propId);
    case 'prop.home': return setHome(g, pid, cmd.propId);
    case 'prop.repay': return repayMortgage(g, pid, cmd.propId, cmd.amount);
    case 'life.buy': return held ? fail('your assets are held by the court') : buyItem(g, pid, cmd.itemId);
    case 'life.sell': return held ? fail('your assets are held by the court') : sellItem(g, pid, cmd.uid);
    case 'note.buy': {
      const lab = g.lab[pid];
      const m = lab ? bestModel(lab, 'analyst') : null;
      return buyNote(g, pid, cmd.assetId, m?.mcs ?? 0);
    }
    case 'watch.set': {
      const ids = cmd.assetIds.filter((id) => id === 'GX' || g.market.config.indices.some((x) => x.id === id) || g.market.config.assets.some((a) => a.id === id && a.listed !== false));
      p.watchlist = [...new Set(ids)].slice(0, 40);
      return { ok: true };
    }
    case 'alert.add': return addAlert(p, cmd.assetId, cmd.above, cmd.price);
    case 'alert.remove': p.alerts = p.alerts.filter((a) => a.id !== cmd.alertId); return { ok: true };
    case 'contract.claim': return claimContract(g, p, cmd.contractId);
    case 'onboarding':
      p.onboarding = { step: Math.max(p.onboarding.step, cmd.step), done: cmd.done ?? p.onboarding.done, skipped: cmd.skipped ?? p.onboarding.skipped };
      return { ok: true };
    case 'profile': return updateProfile(g, p, cmd);
    case 'inbox.read': for (const n of p.inbox) n.read = true; return { ok: true };
    case 'digest.seen': p.digestSeenTick = g.market.tick; p.digestNetWorth = p.netWorth; return { ok: true };
    case 'close.seen': {
      // the latest closed day the player has dismissed: it only moves forward, and only to a whole game day
      const L = ensureLedger(g, pid);
      if (L && Number.isInteger(cmd.day) && cmd.day >= 0) L.closeSeenDay = Math.max(L.closeSeenDay ?? -1, cmd.day);
      return { ok: true };
    }
    case 'chat.send': return postChat(g, p, cmd.channel, cmd.text, out);
    case 'alliance.create': return createAlliance(g, p, cmd.name, cmd.tag, cmd.motto, out);
    case 'alliance.join': return joinAlliance(g, p, cmd.allianceId, out);
    case 'alliance.leave': return leaveAlliance(g, p);
    case 'alliance.deposit': return allianceDeposit(g, p, cmd.amount);
    case 'alliance.withdraw': return allianceWithdraw(g, p, cmd.amount);
    case 'alliance.promote': return alliancePromote(g, p, cmd.playerId);
    case 'alliance.kick': return allianceKick(g, p, cmd.playerId);
    case 'deal.offer': return offerDeal(g, p, cmd.kind, cmd.toId, cmd.amount, cmd.rate, cmd.termDays, cmd.note, out);
    case 'deal.respond': return respondDeal(g, p, cmd.dealId, cmd.accept, out);
    case 'deal.cancel': return cancelDeal(g, p, cmd.dealId);
    case 'deal.repay': return repayDeal(g, p, cmd.dealId, cmd.amount, out);
    case 'lab.gpu': return buyGpus(g, pid, cmd.tier, cmd.qty);
    case 'lab.reserve': return reserveCompute(g, pid, cmd.perDay, cmd.days);
    case 'lab.data': return buyData(g, pid, cmd.source, cmd.qty, out);
    case 'lab.research': return startResearch(g, pid, cmd.nodeId);
    case 'lab.hire': return hireResearchers(g, pid, cmd.qty);
    case 'lab.train': return startTraining(g, pid, cmd.kind, cmd.name, cmd.budget, cmd.careful);
    case 'lab.bot': return deployBot(g, pid, cmd.modelId, cmd.strategy, cmd.assets, cmd.allocation);
    case 'lab.botToggle': return toggleBot(g, pid, cmd.botId, cmd.active);
    case 'lab.signal': return analystSignal(g, pid, out);
    case 'tournament.enter': return enterTournament(g, pid, !!cmd.publishLog);
    case 'auction.bid': return placeBid(g, pid, cmd.lot, cmd.amount);
    case 'streak.claim': return claimStreak(g, pid, out);
    case 'insurance.set': return setInsurance(g, pid, cmd.on, out);
    case 'home.place': return placeInSlot(g, pid, cmd.slot, cmd.uid);
    case 'visibility.set': return setVisibility(g, pid, cmd.surface, cmd.on);
    case 'sec.budget': return setBudget(g, pid, cmd.budget);
    case 'sec.scan': return manualScan(g, pid, out);
    case 'sec.tag': return tagEntry(g, pid, cmd.entryId, cmd.tag);
    case 'sec.disconnect': return disconnect(g, pid, cmd.entryId, out);
    case 'sec.lockdown': return lockdown(g, pid, out);
    case 'sec.plant': return plantSession(g, pid, cmd.victimId, cmd.strength, cmd.modelId, out, cmd.canary === true);
    case 'sec.honeypot': return deployHoneypot(g, pid, cmd.kind, cmd.bait ?? 1, out);
    case 'sec.fund': return attackFund(g, pid, cmd.fundId, cmd.strength, cmd.modelId, cmd.canary === true, out);
    case 'court.file': return fileCase(g, pid, cmd.defendantId, cmd.kind, cmd.counsel, out);
    case 'court.settle': return offerSettlement(g, pid, cmd.caseId, cmd.amount, out);
    case 'court.acceptSettlement': return acceptSettlement(g, pid, cmd.caseId, out);
    case 'donate': {
      const amt = Math.min(cmd.amount, cashOf(g, pid));
      if (!(amt >= 100)) return fail('at least $100');
      debit(g, pid, amt, 'philanthropy');
      p.stats.donations += amt;
      p.reputation += Math.log10(amt) - 1;
      notify(g, out, pid, { kind: 'system', tone: 'brass', text: `You gave $${Math.round(amt).toLocaleString('en-US')} to ${sanitize(cmd.cause, 40) || 'charity'}. Reputation up.` });
      return { ok: true };
    }
    case 'analyst.hire': return hireAnalyst(g, p, cmd.tier, out);
    case 'analyst.fire': return fireAnalyst(g, p, out);
    case 'desk.unlock': return unlockDesk(g, p, out);
    case 'desk.resume': return resumeDesk(g, p, out);
    case 'desk.query': return deskQuery(g, p, cmd.assetId, cmd.from, cmd.to);
    case 'desk.file': return deskFileOf(g, p, cmd.no);
    case 'journal.detail': return tripDetail(g, p, cmd.tripId);
    case 'lesson.complete': return completeLesson(p, cmd.lessonId);
    case 'goals.optIn': return setGoalsOptIn(p, cmd.on);
    case 'challenge.claim': return claimChallenge(p, cmd.weekKey);
    case 'recurring.add': return addRecurring(g, p, cmd.assetId, cmd.dollars, cmd.everyDays);
    case 'recurring.cancel': return cancelRecurring(g, p, cmd.planId);
    case 'drip.set': return setDrip(g, p, cmd.assetId, cmd.on);
    case 'block.start': return startBlock(g, p, cmd.assetId, cmd.side, cmd.qty, cmd.slices);
    case 'block.cancel': return cancelBlock(g, p, cmd.planId);
    case 'company.found': return companyCommand(g, pid, cmd, out);
    case 'company.act': return companyCommand(g, pid, cmd, out);
    case 'company.ipo':
    case 'company.ipoOrder':
    case 'company.plan':
    case 'company.planCancel':
    case 'company.buyback':
    case 'company.loan':
    case 'company.repay':
    case 'company.dividend':
      return companyFinanceCommand(g, pid, cmd as CompanyFinanceCommand, out);
    case 'company.bid': return companyCommand(g, pid, cmd, out);
    case 'fund.trade': {
      const r = applyFundCommand(g, pid, cmd as FundCommand, out);
      // a fund refused by the window is a closed-window attempt by its manager, when the manager is an insider (O-15)
      if (!r.ok && (r.data as { reason?: string } | undefined)?.reason === 'closedWindow') scoreWindowAttempt(g, pid, (cmd as { assetId: string }).assetId);
      return r;
    }
    case 'fund.create':
    case 'fund.mandate':
    case 'fund.deposit':
    case 'fund.redeem':
      return applyFundCommand(g, pid, cmd as FundCommand, out);
    case 'lp.launch':
    case 'lp.buy':
    case 'lp.sell':
    case 'lp.buzz':
    case 'lp.cancel':
    case 'lp.file': return launchpadCommand(g, pid, cmd, out) ?? fail('unknown command');
    case 'ad.start': return startBreak(g, pid);
    case 'ad.finish': return finishBreak(g, pid, cmd.id, cmd.skip, out);
    case 'comeback.confirm':
    case 'comeback.dismiss': return comebackCommand(g, pid, cmd, out);
    case 'admin.advance': return fail('admin only');
    case 'admin.grant': {
      creditExternal(g, pid, cmd.amount, 'admin');
      refreshNetWorth(g, p);
      applyRank(g, p, out);
      return { ok: true };
    }
  }
  void labFor; void emptyLab;
  return fail('unknown command');
}

/**
 * The security day, once per game day, in the order stepGame runs it: the players' cyber day (sessions, clues, scans, decoy
 * sessions), then the rival crews' attacks (M31). The harness calls this same function, so its numbers are the game's.
 */
export function securityDay(g: GameState, out: StepOutput | null): void {
  cyberDay(g, out);
  rivalCrewDay(g, out);
  lossDay(g, out);
}
