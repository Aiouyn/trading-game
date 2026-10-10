import { type Fill } from '@/engine';
import { ACHIEVEMENTS, CONTRACTS, emptyStats, isRareAchievement, type PlayerStats } from '@/content/progression';
import { RANKS, licenseFor, rankFor, rankIndex } from '@/content/lifestyle';
import {
  ONBOARDING_GRANT, TPD, clamp, credit, findOrder, gx, keyedRng, notify, playerBusinesses, playerProperties, priceOf, pushWire, sanitize, today,
} from './core';
import { playerBizSectors, refreshNetWorth } from './assets';
import { computeBoards } from './boards';
import { seedConnections } from './cyber';
import { ensureLedger } from './ledger';
import type { CommandResult, GameState, Player, StepOutput } from './types';

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'AV', name: 'Avalon Republic' }, { code: 'NH', name: 'Nordhaven' }, { code: 'MU', name: 'Meridian Union' },
  { code: 'SD', name: 'Sundara' }, { code: 'KY', name: 'Kaiyo' },
  { code: 'FR', name: 'France' }, { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' }, { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' }, { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' }, { code: 'CA', name: 'Canada' }, { code: 'BR', name: 'Brazil' }, { code: 'MA', name: 'Morocco' },
  { code: 'IN', name: 'India' }, { code: 'JP', name: 'Japan' }, { code: 'NL', name: 'Netherlands' }, { code: 'XX', name: 'Elsewhere' },
];

export function validHandle(h: string): string | null {
  const s = h.trim();
  if (!/^[A-Za-z0-9_.-]{3,18}$/.test(s)) return null;
  return s;
}

export function createPlayer(g: GameState, id: string, handle: string, country: string, opts: { npc?: string; bio?: string; cash?: number } = {}): Player {
  const cash = opts.cash ?? g.market.config.trading?.startingCash ?? 5000;
  if (g.market.accounts[id]) throw new Error(`account ${id} already exists`);
  g.market.accounts[id] = {
    playerId: id, cash, startingCash: cash, positions: {}, realizedPnl: 0, feesPaid: 0, peakEquity: cash, maxDrawdown: 0, dayStartEquity: cash,
    ...(opts.npc ? { npc: true } : {}),
  };
  const nw = cash;
  const p: Player = {
    id, handle, country, joinedTick: g.market.tick, lastSeenTick: g.market.tick, online: !opts.npc, bio: opts.bio ?? '',
    netWorthPeak: nw, netWorth: nw, rankId: 'R0', licenseId: 'retail', prestige: 0, reputation: 0, notoriety: 0, title: '',
    lifestyle: [], homePropId: null, stats: emptyStats(), achievements: {}, contracts: [], contractsDay: -1,
    dayStart: { day: today(g), netWorth: nw, gx: gx(g), stats: emptyStats() }, chapterStartNetWorth: nw,
    watchlist: ['GX', 'HLCN', 'NRON', 'AVBK', 'AUC', 'GOLD'], alerts: [], alertSeq: 0, notes: {}, inbox: [], inboxSeq: 0,
    onboarding: { step: 0, done: !!opts.npc, skipped: false }, pendingIncome: 0, allianceId: null,
    shieldUntil: g.market.tick + 72 * TPD, rivalId: null, digestSeenTick: g.market.tick, mostWantedOptIn: false, heldUntil: 0,
    filings: {}, digestNetWorth: nw,
    ...(opts.npc ? { npc: opts.npc } : {}),
  };
  g.players[id] = p;
  applyRank(g, p, null, true);
  return p;
}

export function join(g: GameState, id: string, handleIn: string, countryIn: string, out: StepOutput | null): CommandResult {
  if (g.players[id]) return fail('already joined');
  const handle = validHandle(handleIn);
  if (!handle) return fail('handle: 3-18 letters, digits, _ . -');
  if (Object.values(g.players).some((p) => p.handle.toLowerCase() === handle.toLowerCase())) return fail('handle taken');
  const country = COUNTRIES.some((c) => c.code === countryIn) ? countryIn : 'XX';
  const p = createPlayer(g, id, handle, country);
  credit(g, id, ONBOARDING_GRANT, 'onboarding grant');
  refreshNetWorth(g, p);
  p.netWorthPeak = Math.max(p.netWorthPeak, p.markNetWorth ?? p.netWorth);
  // the trade ledger and the benchmark start here, from the cash the player actually has after the sign-up grant
  ensureLedger(g, id);
  pickRival(g, p);
  notify(g, out, id, { kind: 'system', tone: 'brass', text: `Welcome to Port Avalon, ${handle}. Your broker added a $${ONBOARDING_GRANT} sign-up bonus. Rent is due Friday.` });
  // No account-opening story on the public Wire: every guest account would make one (the player sees the welcome).
  if (Object.keys(g.players).length < 500) computeBoards(g); // big worlds refresh boards on their own schedule
  return ok({ id });
}

/** Everyone's rival at once: sort by net worth, each player's rival is the next one up. O(N log N). */
export function pickRivals(g: GameState): void {
  const sorted = Object.values(g.players).sort((a, b) => a.netWorth - b.netWorth || a.id.localeCompare(b.id));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (p.npc) continue;
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.netWorth <= p.netWorth) j++;
    p.rivalId = sorted[j]?.id ?? null;
  }
}

/** The rival is the closest player above you (an NPC early on), refreshed with the boards. */
export function pickRival(g: GameState, p: Player): void {
  let best: Player | null = null;
  for (const q of Object.values(g.players)) {
    if (q.id === p.id || q.netWorth <= p.netWorth) continue;
    if (!best || q.netWorth < best.netWorth) best = q;
  }
  p.rivalId = best?.id ?? null;
}

/** Rank and license follow the net worth peak; ranks are never lost. */
export function applyRank(g: GameState, p: Player, out: StepOutput | null, silent = false): void {
  const r = rankFor(p.netWorthPeak);
  if (rankIndex(r.id) <= rankIndex(p.rankId) && !silent) return;
  const prev = p.rankId;
  p.rankId = r.id;
  const lic = licenseFor(r.id);
  p.licenseId = lic.id;
  // in place: the world owns its market copy (the pure helper would copy every account)
  const acct = g.market.accounts[p.id];
  if (acct && (acct.maxLeverage !== lic.maxLeverage || acct.canShort !== lic.canShort || acct.canOptions !== lic.canOptions)) {
    g.market.accounts[p.id] = { ...acct, maxLeverage: lic.maxLeverage, canShort: lic.canShort, canOptions: lic.canOptions };
  }
  if (rankIndex(r.id) >= 3) seedConnections(g, p.id);
  if (silent || prev === r.id) return;
  out?.rankUps.push({ playerId: p.id, rankId: r.id });
  notify(g, out, p.id, { kind: 'rank', tone: 'brass', text: `Rank up: you are now ${r.name}. ${r.unlocks.join(' · ')}.` });
  // The public Wire names rank milestones from R3 up only; lower ranks are the player's own news.
  if (rankIndex(r.id) >= 3) pushWire(g, out, { kind: 'milestone', tag: 'Milestone', tone: 'brass', playerId: p.id, text: `${p.handle} reaches ${r.name}` });
}

export function rankName(id: string): string {
  return RANKS.find((r) => r.id === id)?.name ?? id;
}

// ---------------------------------------------------------------- achievements

export function checkAchievements(g: GameState, p: Player, out: StepOutput | null): void {
  const ctx = {
    stats: p.stats,
    netWorth: p.netWorth,
    rankIdx: rankIndex(p.rankId),
    prestige: p.prestige,
    businesses: playerBusinesses(g, p.id).length,
    bizSectors: playerBizSectors(g, p.id),
    properties: playerProperties(g, p.id).length,
    cities: new Set(playerProperties(g, p.id).map((x) => x.cityId)).size,
    allianceMember: !!p.allianceId,
    leaderboardRank: g.boards.nwRank[p.id] ?? 0,
  };
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id] !== undefined) continue;
    if (!a.check(ctx)) continue;
    p.achievements[a.id] = g.market.tick;
    notify(g, out, p.id, { kind: 'achievement', tone: 'brass', text: `Achievement unlocked: ${a.name}. ${a.text}` });
    if (p.npc) continue;
    g.firstUnlocks ??= {};
    const first = g.firstUnlocks[a.id] === undefined;
    if (first) g.firstUnlocks[a.id] = p.handle;
    // Public only when rare or the first in the world. Common unlocks stay in the player's own inbox.
    if (first || isRareAchievement(a)) {
      const text = first && !isRareAchievement(a) ? `${p.handle} unlocks ${a.name}, the first in Port Avalon` : `${p.handle} unlocks ${a.name}`;
      pushWire(g, out, { kind: 'milestone', tag: 'Achievement', tone: 'brass', playerId: p.id, text });
    }
  }
}

// ---------------------------------------------------------------- hourly contracts

export function contractCap(rankIdx: number): number {
  return 400 * 5 ** rankIdx;
}

/** Called at the start of each game day for every human player (and on join). */
export function rollContracts(g: GameState, p: Player): void {
  const d = today(g);
  if (p.contractsDay === d) return;
  if (p.online && p.contractsDay >= 0) p.stats.daysActive++;
  p.contractsDay = d;
  p.dayStart = { day: d, netWorth: p.netWorth, gx: gx(g), stats: { ...p.stats } };
  const rIdx = rankIndex(p.rankId);
  const pool = CONTRACTS.filter((c) => c.minRank <= rIdx);
  const rng = keyedRng(g, `contracts:${p.id}:${d}`);
  const picks: typeof pool = [];
  while (picks.length < 3 && picks.length < pool.length) {
    const c = pool[Math.floor(rng.uniform() * pool.length)]!;
    if (!picks.includes(c)) picks.push(c);
  }
  p.contracts = picks.map((c) => ({
    id: `${d}-${c.id}`, defId: c.id, text: c.text, done: false, claimed: false,
    reward: Math.round(clamp(c.reward * Math.max(p.netWorth, 5000), 50, contractCap(rIdx))),
  }));
}

export function contractProgress(g: GameState, p: Player, defId: string): { value: number; target: number } {
  const c = CONTRACTS.find((x) => x.id === defId)!;
  if (c.stat === 'netWorthGain') return { value: p.dayStart.netWorth > 0 ? p.netWorth / p.dayStart.netWorth - 1 : 0, target: c.target };
  if (c.stat === 'beatIndex') {
    const mine = p.dayStart.netWorth > 0 ? p.netWorth / p.dayStart.netWorth - 1 : 0;
    const idx = p.dayStart.gx > 0 ? gx(g) / p.dayStart.gx - 1 : 0;
    return { value: mine - idx, target: c.target };
  }
  const k = c.stat as keyof PlayerStats;
  return { value: p.stats[k] - p.dayStart.stats[k], target: c.target };
}

export function updateContracts(g: GameState, p: Player, out: StepOutput | null): void {
  for (const c of p.contracts) {
    if (c.done) continue;
    const { value, target } = contractProgress(g, p, c.defId);
    if (value >= target) {
      c.done = true;
      notify(g, out, p.id, { kind: 'contract', tone: 'brass', text: `Contract done: ${c.text}. Claim $${c.reward.toLocaleString('en-US')}.` });
    }
  }
}

export function claimContract(g: GameState, p: Player, contractId: string): CommandResult {
  const c = p.contracts.find((x) => x.id === contractId);
  if (!c) return fail('unknown contract');
  if (!c.done) return fail('not done yet');
  if (c.claimed) return fail('already claimed');
  c.claimed = true;
  credit(g, p.id, c.reward, 'contracts');
  p.stats.contractsDone++;
  return ok({ reward: c.reward });
}

// ---------------------------------------------------------------- alerts

export function checkAlerts(g: GameState, p: Player, out: StepOutput): void {
  if (!p.alerts.length) return;
  p.alerts = p.alerts.filter((a) => {
    const px = a.assetId === 'GX' ? gx(g) : priceOf(g, a.assetId);
    const hit = a.above ? px >= a.price : px <= a.price;
    if (hit) notify(g, out, p.id, { kind: 'alert', tone: 'info', text: `Alert: ${a.assetId} is ${a.above ? 'above' : 'below'} ${a.price.toLocaleString('en-US')} (now ${px.toLocaleString('en-US', { maximumFractionDigits: 4 })})` });
    return !hit;
  });
}

export function addAlert(p: Player, assetId: string, above: boolean, price: number): CommandResult {
  if (!(price > 0)) return fail('enter a price');
  if (p.alerts.length >= 20) return fail('20 alerts at most');
  p.alertSeq++;
  p.alerts.push({ id: `a${p.alertSeq}`, assetId, above, price });
  return ok();
}

// ---------------------------------------------------------------- trade stats from fills

/**
 * Update trading stats after a tick: realized P&L deltas tell wins from losses, stop orders
 * that fired are counted, positions are tallied.
 */
export function tradeStats(g: GameState, fills: Fill[], realizedBefore: Record<string, number>, out: StepOutput): void {
  const byPlayer = new Map<string, Fill[]>();
  for (const f of fills) {
    const arr = byPlayer.get(f.playerId) ?? [];
    arr.push(f);
    byPlayer.set(f.playerId, arr);
  }
  for (const [pid, fs] of byPlayer) {
    const p = g.players[pid];
    const acct = g.market.accounts[pid];
    if (!p || !acct) continue;
    p.stats.trades += fs.length;
    const delta = acct.realizedPnl - (realizedBefore[pid] ?? acct.realizedPnl);
    if (Math.abs(delta) > 0.005) {
      if (delta > 0) {
        p.stats.winningTrades++;
        if (fs.some((f) => f.side === 'buy')) p.stats.shortsWon += fs.every((f) => f.side === 'buy') ? 1 : 0;
        const d = today(g);
        for (const f of fs) {
          const i = g.market.config.assets.findIndex((a) => a.id === f.assetId);
          const last = g.market.assets[i]?.lastEarnings;
          if (last && d - last.day <= 3) { p.stats.earningsWins++; break; }
        }
      }
      p.stats.bestTrade = Math.max(p.stats.bestTrade, delta);
      p.stats.worstTrade = Math.min(p.stats.worstTrade, delta);
    }
    for (const f of fs) {
      const o = findOrder(g, pid, f.orderId);
      if (o && (o.type === 'stop' || o.type === 'trailing' || o.type === 'stop_limit')) p.stats.stopsTriggered++;
      notify(g, out, pid, {
        kind: 'fill', tone: f.side === 'buy' ? 'gain' : 'loss',
        text: `${o?.forced ? 'Liquidated: ' : ''}${f.side === 'buy' ? 'Bought' : 'Sold'} ${+f.qty.toFixed(4)} ${f.assetId} at ${f.price.toLocaleString('en-US', { maximumFractionDigits: f.price < 1 ? 6 : 2 })} · fee $${f.fee.toFixed(2)}`,
      });
    }
    p.stats.maxPositions = Math.max(p.stats.maxPositions, Object.keys(acct.positions).length);
  }
}

export function updateProfile(g: GameState, p: Player, patch: { bio?: string; country?: string; title?: string; mostWantedOptIn?: boolean }): CommandResult {
  if (patch.bio !== undefined) p.bio = sanitize(patch.bio, 160);
  if (patch.country !== undefined && COUNTRIES.some((c) => c.code === patch.country)) p.country = patch.country;
  if (patch.title !== undefined) {
    const t = sanitize(patch.title, 30);
    // titles come from achievements the player has unlocked (or none)
    if (t && !ACHIEVEMENTS.some((a) => a.name === t && p.achievements[a.id] !== undefined)) return fail('earn that title first');
    p.title = t;
  }
  if (patch.mostWantedOptIn !== undefined) p.mostWantedOptIn = !!patch.mostWantedOptIn;
  void g;
  return ok();
}

/**
 * Flags each NPC persona's engine account (Account.npc), so a save written before the flag keeps NPC flow out of the
 * public Players rule and out of You (P1). Idempotent; changes no price.
 */
export function flagNpcAccounts(g: GameState): void {
  for (const p of Object.values(g.players)) {
    const acct = g.market.accounts[p.id];
    if (p.npc && acct && !acct.npc) acct.npc = true;
  }
}
