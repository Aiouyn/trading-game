import { cashOf, debit, notify, pushWire, transfer, TPD } from '../core';
import type { CommandResult, CourtCase, GameState, Player, StepOutput } from '../types';
import { LP } from './constants';
import { spotAt } from './curve';
import { dayOf, isCreatorLinked, lpWire, refuse, tokenOf } from './state';
import { vestFraction } from './vest';
import type { LpToken } from './types';

/**
 * Anti-rug (lead-launchpad.md L5). The creator's sales are public. Two rules raise a public flag on a token:
 *   - dump: the creator (with owner-linked accounts) sells 50% or more of their holding within 24 game days after graduation;
 *   - sweep: the creator sells 3% of supply or more in one game day while the price falls 40% or more that day.
 * Sales that follow the vesting pace are paced and do not count toward the dump rule, so an honest creator who sells as the
 * allocation unlocks is never flagged. A holder who bought in the 7 game days before a flagged dump may sue the creator for the
 * realised loss, capped pro rata at the creator's proceeds from the dump; a lost case bans the creator from launching for 8 weeks.
 */

const SEV = { pct: 0.01, floor: 10_000, cap: 100_000_000 };
/** the court's floor: a verdict never takes a player below this cash (court.ts FLOOR) */
const FLOOR = 5_000;
const FILING_FEE = 2_000;
const HEARING_DAYS = 2;

/** The creator-side set of a token: the creator and owner-linked accounts, which the rules read together. */
function isCreatorSet(g: GameState, t: LpToken, pid: string): boolean {
  return t.creatorId !== null && isCreatorLinked(g, t.creatorId, pid);
}

/**
 * A creator-side sale of `tokens` for `proceedsCents` (net of the fee, as booked). The vesting pace is applied to the creator's own
 * allocation first, then the rest counts toward the rules. Raises a flag when a rule is met (the first flag stays).
 */
export function recordCreatorSale(g: GameState, t: LpToken, pid: string, tokens: number, proceedsCents: number, out: StepOutput | null): void {
  if (!isCreatorSet(g, t, pid) || !(tokens > 0)) return;
  const tick = g.market.tick;
  const day = dayOf(tick);
  const spot = spotAt(t.y);
  if (t.creatorDay.day !== day) t.creatorDay = { day, qty: 0, proceeds: 0, startPrice: spot, wired: false };
  let paced = 0;
  if (pid === t.creatorId) {
    const unlocked = Math.floor(t.allocation * vestFraction(t, tick));
    paced = Math.max(0, Math.min(tokens, unlocked - t.allocSold));
    t.allocSold += paced;
  }
  const rest = tokens - paced;
  t.creatorDay.qty += tokens;
  t.creatorDay.proceeds += proceedsCents / 100;
  if (t.status === 'graduated' && t.gradTick !== undefined) {
    t.creatorSoldSinceGrad += rest;
    t.creatorProceedsSinceGrad += (proceedsCents / 100) * (rest / tokens);
  }
  const supplyFrac = t.creatorDay.qty / LP.SUPPLY;
  if (!t.creatorDay.wired && supplyFrac >= LP.BIG_SELL_SUPPLY_FRAC) {
    t.creatorDay.wired = true;
    lpWire(g, out, 'warn', 'Launchpad', { key: 'lp.wire.bigSell', vars: { name: t.name, ticker: t.ticker, pct: (supplyFrac * 100).toFixed(1) } }, t.ticker);
  }
  if (!t.flag) {
    const fell = t.creatorDay.startPrice > 0 && spot <= t.creatorDay.startPrice * (1 - LP.RUG_DUMP_PRICE_FALL);
    if (supplyFrac >= LP.RUG_DUMP_SUPPLY_FRAC && fell) {
      t.flag = { tick, reason: 'sweep', proceeds: t.creatorDay.proceeds, window: day };
    } else if (t.status === 'graduated' && t.gradTick !== undefined && t.creatorHeldAtGrad && tick - t.gradTick <= LP.RUG_WINDOW_DAYS * TPD
      && t.creatorSoldSinceGrad >= LP.RUG_SELL_FRAC * t.creatorHeldAtGrad) {
      t.flag = { tick, reason: 'dump', proceeds: t.creatorProceedsSinceGrad, window: day };
    }
    if (t.flag) {
      lpWire(g, out, 'warn', 'Launchpad', { key: 'lp.wire.flag', vars: { name: t.name, ticker: t.ticker, reason: '@lp.reason.' + t.flag.reason } }, t.ticker);
    }
  }
}

/**
 * The engine's fills of graduated tokens (the creator's post-graduation sells and the holders' buys and sells): the holder's FIFO
 * lots and realised P&L are kept after graduation, and a creator sale feeds the anti-rug rules. Only tokens that graduated are read.
 */
export function lpFills(g: GameState, fills: { playerId: string; assetId: string; side: 'buy' | 'sell'; qty: number; price: number; fee: number }[], out: StepOutput | null): void {
  const s = g.launchpad;
  if (!s) return;
  for (const f of fills) {
    const t = s.tokens[f.assetId];
    if (!t || t.status !== 'graduated') continue;
    const tick = g.market.tick;
    if (f.side === 'buy') {
      const L = t.lots[f.playerId] ?? (t.lots[f.playerId] = []);
      L.push({ qty: f.qty, cost: f.price, tick });
      if (L.length > 300) L.splice(0, L.length - 300);
      t.buyLog.push({ pid: f.playerId, tick, qty: f.qty });
      if (t.buyLog.length > 2000) t.buyLog.splice(0, t.buyLog.length - 2000);
      continue;
    }
    let rem = f.qty;
    let cost = 0;
    const L = t.lots[f.playerId] ?? [];
    while (rem > 0 && L.length > 0) {
      const lot = L[0]!;
      const take = Math.min(rem, lot.qty);
      cost += take * lot.cost;
      lot.qty -= take;
      rem -= take;
      if (lot.qty <= 0) L.shift();
    }
    t.lots[f.playerId] = L;
    t.realized[f.playerId] = (t.realized[f.playerId] ?? 0) + f.qty * f.price - f.fee - cost;
    recordCreatorSale(g, t, f.playerId, f.qty, Math.round((f.qty * f.price - f.fee) * 100), out);
  }
}

/**
 * A holder files a rug case on a flagged token (through the Court, the `rug` kind). The holder must have bought within the 7 game
 * days before the flag, and may file once per token. The defendant is the creator.
 */
export function fileRugCase(g: GameState, pid: string, ticker: string, out: StepOutput | null): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return refuse('noPlayer', {});
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (!t.flag || !t.creatorId) return refuse('noFlag', { ticker });
  if (pid === t.creatorId || isCreatorSet(g, t, pid)) return refuse('ownFlag', { ticker });
  const from = t.flag.tick - LP.RUG_BUY_WINDOW_DAYS * TPD;
  const eligible = t.buyLog.some((b) => b.pid === pid && b.tick >= from && b.tick <= t.flag!.tick);
  if (!eligible) return refuse('notEligible', { ticker });
  if (t.sued[pid]) return refuse('alreadySued', { ticker });
  if (cashOf(g, pid) < FILING_FEE) return refuse('cash', { need: FILING_FEE.toLocaleString('en-US') });
  debit(g, pid, FILING_FEE, 'legal fees');
  const s = g.court;
  s.seq++;
  const id = `case${s.seq}`;
  const c: CourtCase = {
    id, plaintiffId: pid, defendantId: t.creatorId, kind: 'rug', tokenId: t.ticker, evidence: 60, bar: 40,
    counselPlaintiff: 0, counselDefendant: 0, filedTick: g.market.tick, hearingTick: g.market.tick + HEARING_DAYS * TPD,
    status: 'filed', damages: 0, fine: 0,
  };
  s.cases[id] = c;
  t.sued[pid] = id;
  const creatorName = g.players[t.creatorId]?.handle ?? 'the creator';
  notify(g, out, t.creatorId, { kind: 'court', tone: 'warn', text: `${p.handle} is suing you over ${t.ticker}. Hearing in ${HEARING_DAYS} game days.`, msg: { key: 'lp.inbox.rugFiled', vars: { player: p.handle, ticker: t.ticker, days: HEARING_DAYS } } });
  pushWire(g, out, { kind: 'court', tag: 'Court', tone: 'warn', text: `${p.handle} sues ${creatorName} over ${t.ticker}` });
  return { ok: true, data: { id } };
}

/**
 * The verdict of a won rug case. The damages are the holder's realised loss on the token (FIFO), capped pro rata at the creator's
 * proceeds from the dump: the holder's share of the buys in the 7 days before it. The fine is on the court's scale (SEV). The
 * creator is banned from launching for 8 weeks.
 */
export function rugVerdict(g: GameState, c: CourtCase, out: StepOutput | null, df: Player): void {
  const t = tokenOf(g, c.tokenId ?? '');
  const pl = g.players[c.plaintiffId];
  if (!t || !t.flag || !pl) {
    c.status = 'dismissed';
    return;
  }
  const loss = Math.max(0, -(t.realized[c.plaintiffId] ?? 0));
  const from = t.flag.tick - LP.RUG_BUY_WINDOW_DAYS * TPD;
  let total = 0;
  let mine = 0;
  for (const b of t.buyLog) {
    if (b.tick < from || b.tick > t.flag.tick) continue;
    total += b.qty;
    if (b.pid === c.plaintiffId) mine += b.qty;
  }
  const share = total > 0 ? mine / total : 0;
  const cap = t.flag.proceeds * share;
  const headroom = Math.max(0, df.netWorth - FLOOR);
  const fine = Math.min(headroom * 0.5, Math.min(SEV.cap, Math.max(SEV.floor, df.netWorth * SEV.pct)));
  const damages = Math.max(0, Math.min(loss, cap, Math.max(0, cashOf(g, c.defendantId) - FLOOR)));
  transfer(g, c.defendantId, c.plaintiffId, damages);
  debit(g, c.defendantId, fine, 'fines');
  c.damages = damages;
  c.fine = fine;
  g.launchpad!.bans[c.defendantId] = g.market.tick + LP.RUG_BAN_TICKS;
  df.reputation -= 5;
  df.notoriety += 2;
  c.verdictText = `Liable: $${Math.round(damages).toLocaleString('en-US')} in damages and a $${Math.round(fine).toLocaleString('en-US')} fine. No new launches for 8 weeks.`;
  notify(g, out, c.plaintiffId, { kind: 'court', tone: 'gain', text: `You won against ${df.handle} over ${t.ticker}. ${c.verdictText}`, msg: { key: 'lp.inbox.rugWon', vars: { player: df.handle, ticker: t.ticker, damages: Math.round(damages).toLocaleString('en-US'), fine: Math.round(fine).toLocaleString('en-US') } } });
  notify(g, out, c.defendantId, { kind: 'court', tone: 'loss', text: `Verdict for ${pl.handle} over ${t.ticker}. ${c.verdictText}`, msg: { key: 'lp.inbox.rugLost', vars: { player: pl.handle, ticker: t.ticker, damages: Math.round(damages).toLocaleString('en-US'), fine: Math.round(fine).toLocaleString('en-US') } } });
}
