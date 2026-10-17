import { cashOf, debit, notify, priceOf, spendableCash, transfer, TPD } from '../core';
import type { CommandResult, CourtCase, GameState, Player, StepOutput } from '../types';
import { SEVERITY } from '../court-scale';
import { textProvider } from '../text';
import type { Msg } from '@/i18n';
import { LP, isNpcAccount } from './constants';
import { spotAt } from './curve';
import { anonOf } from './anon';
import { pushTape } from './tape';
import { dayOf, isCreatorLinked, lpWire, pushBuy, pushLot, refuse, tokenOf } from './state';
import { vestFraction } from './vest';
import { noteClose } from './desk';
import type { LpToken, LpLot } from './types';

/**
 * Anti-rug (lead-launchpad.md L5). The creator's sales are public. Two rules raise a public flag on a token:
 *   - dump: the creator (with owner-linked accounts) sells 50% or more of their holding within 24 game days after graduation;
 *   - sweep: the creator sells 3% of supply or more in one game day while the price falls 40% or more that day.
 * Sales that follow the vesting pace are paced and do not count toward the dump rule, so an honest creator who sells as the
 * allocation unlocks is never flagged. A holder who bought in the 7 game days before a flagged dump may sue the creator for the
 * realised loss, capped pro rata at the creator's proceeds from the dump; a lost case bans the creator from launching for 8 weeks.
 */

// the flag's fine level and the ban are constants.ts RUG_SEVERITY and RUG_BAN_TICKS; the court's scale is court-scale.ts
/** the court's floor: a verdict never takes a player below this cash (court.ts FLOOR) */
const FLOOR = 5_000;
export const FILING_FEE = 2_000;
const HEARING_DAYS = 2;

/** The creator-side set of a token: the creator and owner-linked accounts, which the rules read together. */
function isCreatorSet(g: GameState, t: LpToken, pid: string): boolean {
  return t.creatorId !== null && isCreatorLinked(g, t.creatorId, pid);
}

/**
 * The price a token trades at now. On the curve that is the curve's spot; once graduated the curve is frozen, so it is the engine's
 * mid (the price the post-graduation sweep test reads, lead-launchpad.md L5).
 */
export function priceNow(g: GameState, t: LpToken): number {
  if (t.status !== 'graduated') return spotAt(t.y);
  const p = priceOf(g, t.ticker);
  return Number.isFinite(p) ? p : (t.gradPrice ?? spotAt(t.y));
}

/** The tokens each holder bought in the rug window before a tick (the flag's snapshot: eligibility and the damages' share). */
function buyersBefore(t: LpToken, tick: number): Record<string, number> {
  const from = tick - LP.RUG_BUY_WINDOW_DAYS * TPD;
  const out: Record<string, number> = {};
  for (const b of t.buyLog) {
    if (b.tick >= from && b.tick <= tick) out[b.pid] = (out[b.pid] ?? 0) + b.qty;
  }
  return out;
}

/**
 * A creator-side sale of `tokens` for `proceedsCents` (net of the fee, as booked). The vesting pace is applied to the creator's own
 * allocation first, then the rest counts toward the rules. Raises a flag when a rule is met (the first flag stays).
 */
export function recordCreatorSale(g: GameState, t: LpToken, pid: string, tokens: number, proceedsCents: number, out: StepOutput | null): void {
  if (!isCreatorSet(g, t, pid) || !(tokens > 0)) return;
  const tick = g.market.tick;
  const day = dayOf(tick);
  const spot = priceNow(g, t);
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
      t.flag = { tick, reason: 'sweep', proceeds: t.creatorDay.proceeds, window: day, buyers: buyersBefore(t, tick) };
    } else if (t.status === 'graduated' && t.gradTick !== undefined && t.creatorHeldAtGrad && tick - t.gradTick <= LP.RUG_WINDOW_DAYS * TPD
      && t.creatorSoldSinceGrad >= LP.RUG_SELL_FRAC * t.creatorHeldAtGrad) {
      t.flag = { tick, reason: 'dump', proceeds: t.creatorProceedsSinceGrad, window: day, buyers: buyersBefore(t, tick) };
    }
    if (t.flag) {
      lpWire(g, out, 'warn', 'Launchpad', { key: 'lp.wire.flag', vars: { name: t.name, ticker: t.ticker, reason: '@lp.reason.' + t.flag.reason } }, t.ticker);
    }
  }
}

/**
 * The engine's fills of graduated tokens (the creator's post-graduation sells and the holders' buys and sells): the holder's FIFO
 * lots and realised P&L are kept after graduation, and a creator sale feeds the anti-rug rules. Only tokens that graduated are read.
 * A buy's cost per token includes its fee, as the curve's does.
 */
export function lpFills(g: GameState, fills: { playerId: string; assetId: string; side: 'buy' | 'sell'; qty: number; price: number; fee: number }[], out: StepOutput | null): void {
  const s = g.launchpad;
  if (!s) return;
  for (const f of fills) {
    const t = s.tokens[f.assetId];
    if (!t || t.status !== 'graduated') continue;
    const tick = g.market.tick;
    const npc = isNpcAccount(f.playerId) || !g.players[f.playerId] || Boolean(g.players[f.playerId]!.npc);
    pushTape(t, {
      tick, side: f.side, qty: f.qty, price: f.price,
      usd: f.qty * f.price + (f.side === 'buy' ? f.fee : 0),
      creator: f.playerId === t.creatorId, npc,
      anon: anonOf(t.ticker, f.playerId),
    });
    // The cohort's unwind contributes a real candle touch but keeps no lots and feeds no anti-rug rule (L6.2).
    if (isNpcAccount(f.playerId)) {
      if (t.micro?.traders.some(w => w.accountId === f.playerId)) {
        if (f.side === 'buy') t.flows.npcBuy += f.qty * f.price + f.fee;
        else t.flows.npcSell += f.qty * f.price;
        t.lastTradeTick = tick;
      }
      continue;
    }
    if (f.side === 'buy') {
      const L: LpLot[] = t.lots[f.playerId] ?? (t.lots[f.playerId] = []);
      pushLot(L, { qty: f.qty, cost: f.price + f.fee / f.qty, tick });
      pushBuy(t, f.playerId, tick, f.qty);
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
    noteClose(g, f.playerId);
    recordCreatorSale(g, t, f.playerId, f.qty, Math.round((f.qty * f.price - f.fee) * 100), out);
  }
}

/**
 * A holder files a rug case on a flagged token (through the Court, the `rug` kind). The holder must have bought within the 7 game
 * days before the flag (the flag's snapshot), and may file once per token. The defendant is the creator.
 */
export function fileRugCase(g: GameState, pid: string, ticker: string, out: StepOutput | null): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return refuse('noPlayer', {});
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (!t.flag || !t.creatorId) return refuse('noFlag', { ticker });
  if (pid === t.creatorId || isCreatorSet(g, t, pid)) return refuse('ownFlag', { ticker });
  if (!((t.flag.buyers[pid] ?? 0) > 0)) return refuse('notEligible', { ticker });
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
  lpWire(g, out, 'warn', 'Court', { key: 'lp.wire.rugSued', vars: { plaintiff: p.handle, defendant: creatorName, ticker: t.ticker } }, t.ticker);
  return { ok: true, data: { id } };
}

/**
 * The verdict of a won rug case. The damages are the holder's realised loss on the token (FIFO), capped pro rata at the creator's
 * proceeds from the dump: the holder's share of the buys in the 7 days before it (the flag's snapshot). The fine is on the court's
 * scale (court-scale.ts, level RUG_SEVERITY). The creator is banned from launching for 8 real weeks.
 */
export function rugVerdict(g: GameState, c: CourtCase, out: StepOutput | null, df: Player): void {
  const t = tokenOf(g, c.tokenId ?? '');
  const pl = g.players[c.plaintiffId];
  if (!t || !t.flag || !pl) {
    c.status = 'dismissed';
    return;
  }
  const loss = Math.max(0, -(t.realized[c.plaintiffId] ?? 0));
  const total = Object.values(t.flag.buyers).reduce((a, b) => a + b, 0);
  const mine = t.flag.buyers[c.plaintiffId] ?? 0;
  const share = total > 0 ? mine / total : 0;
  const cap = t.flag.proceeds * share;
  const headroom = Math.max(0, df.netWorth - FLOOR);
  const sev = SEVERITY[LP.RUG_SEVERITY]!;
  const fine = Math.min(headroom * 0.5, Math.min(sev.cap, Math.max(sev.floor, df.netWorth * sev.pct)));
  const damages = Math.max(0, Math.min(loss, cap, Math.max(0, spendableCash(g, c.defendantId) - FLOOR)));
  transfer(g, c.defendantId, c.plaintiffId, damages);
  debit(g, c.defendantId, fine, 'fines');
  c.damages = damages;
  c.fine = fine;
  g.launchpad!.bans[c.defendantId] = g.market.tick + LP.RUG_BAN_TICKS;
  df.reputation -= 5;
  df.notoriety += 2;
  const verdict: Msg = { key: 'lp.verdict.rugLiable', vars: { damages: Math.round(damages).toLocaleString('en-US'), fine: Math.round(fine).toLocaleString('en-US'), weeks: LP.RUG_BAN_WEEKS } };
  c.verdictText = textProvider.render(verdict, 'en');
  c.verdictMsg = verdict;
  notify(g, out, c.plaintiffId, { kind: 'court', tone: 'gain', text: `You won against ${df.handle} over ${t.ticker}. ${c.verdictText}`, msg: { key: 'lp.inbox.rugWon', vars: { player: df.handle, ticker: t.ticker, damages: Math.round(damages).toLocaleString('en-US'), fine: Math.round(fine).toLocaleString('en-US') } } });
  notify(g, out, c.defendantId, { kind: 'court', tone: 'loss', text: `Verdict for ${pl.handle} over ${t.ticker}. ${c.verdictText}`, msg: { key: 'lp.inbox.rugLost', vars: { player: pl.handle, ticker: t.ticker, damages: Math.round(damages).toLocaleString('en-US'), fine: Math.round(fine).toLocaleString('en-US') } } });
}
