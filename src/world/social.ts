import { linkedAccounts, recordGift, touchLinks } from './collusion';
import { rankIndex } from '@/content/lifestyle';
import {
  CHAT_KEEP, TPD, cashOf, debit, notify, pushWire, sanitize, shiftBaselines, spendableCash, today, transfer,
} from './core';
import type { ChatMessage, CommandResult, Deal, GameState, Player, StepOutput } from './types';

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

// ================================================================ chat

/** world, country:XX, alliance:<id>, dm:<a>:<b> (ids sorted) */
export function canPost(g: GameState, p: Player, channel: string): boolean {
  if (channel === 'world') return true;
  if (channel.startsWith('country:')) return channel === `country:${p.country}`;
  if (channel.startsWith('alliance:')) return p.allianceId === channel.slice(9);
  if (channel.startsWith('dm:')) {
    const [, a, b] = channel.split(':');
    return (a === p.id || b === p.id) && !!g.players[a === p.id ? b! : a!];
  }
  return false;
}

export function dmChannel(a: string, b: string): string {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export function postChat(g: GameState, p: Player, channel: string, textIn: string, out: StepOutput | null): CommandResult {
  const text = sanitize(textIn, 280);
  if (!text) return fail('empty message');
  if (!canPost(g, p, channel)) return fail('you cannot post there');
  const log = (g.chat[channel] ??= []);
  const mine = log.filter((m) => m.playerId === p.id && g.market.tick - m.tick < 2);
  if (mine.length >= 2) return fail('slow down');
  g.chatSeq++;
  const m: ChatMessage = { id: `c${g.chatSeq}`, tick: g.market.tick, playerId: p.id, handle: p.handle, text };
  log.push(m);
  if (log.length > CHAT_KEEP) log.splice(0, log.length - CHAT_KEEP);
  p.stats.chats++;
  out?.chat.push({ ...m, ...{ channel } } as ChatMessage);
  if (channel.startsWith('dm:')) {
    const [, a, b] = channel.split(':');
    notify(g, out, a === p.id ? b! : a!, { kind: 'system', tone: 'info', text: `Message from ${p.handle}: ${text.slice(0, 80)}` });
  }
  return ok(m);
}

// ================================================================ alliances

export const ALLIANCE_COST = 25_000;
export const ALLIANCE_MAX = 20;

export function createAlliance(g: GameState, p: Player, name: string, tag: string, motto: string, out: StepOutput | null): CommandResult {
  if (p.allianceId) return fail('leave your alliance first');
  if (rankIndex(p.rankId) < 1) return fail('alliances unlock at Hustler');
  const n = sanitize(name, 32);
  const t = sanitize(tag, 5).toUpperCase();
  if (n.length < 3) return fail('name: 3+ characters');
  if (!/^[A-Z0-9]{2,5}$/.test(t)) return fail('tag: 2-5 letters or digits');
  if (Object.values(g.alliances).some((a) => a.name.toLowerCase() === n.toLowerCase() || a.tag === t)) return fail('name or tag taken');
  if (cashOf(g, p.id) < ALLIANCE_COST) return fail(`founding costs $${ALLIANCE_COST.toLocaleString('en-US')}`);
  debit(g, p.id, ALLIANCE_COST, 'alliance charters');
  g.allianceSeq++;
  const id = `al${g.allianceSeq}`;
  g.alliances[id] = { id, name: n, tag: t, ownerId: p.id, members: { [p.id]: 'owner' }, treasury: 0, createdTick: g.market.tick, motto: sanitize(motto, 80), sharedDefense: 0 };
  p.allianceId = id;
  touchLinks(g);
  pushWire(g, out, { kind: 'alliance', tag: 'Alliance', tone: 'brass', playerId: p.id, text: `${p.handle} founds the alliance ${n} [${t}]` });
  return ok({ id });
}

export function joinAlliance(g: GameState, p: Player, allianceId: string, out: StepOutput | null): CommandResult {
  const a = g.alliances[allianceId];
  if (!a) return fail('unknown alliance');
  if (p.allianceId) return fail('leave your alliance first');
  if (Object.keys(a.members).length >= ALLIANCE_MAX) return fail('the alliance is full');
  a.members[p.id] = 'member';
  p.allianceId = allianceId;
  touchLinks(g);
  for (const m of Object.keys(a.members)) if (m !== p.id) notify(g, out, m, { kind: 'alliance', tone: 'info', text: `${p.handle} joined ${a.name}.` });
  return ok();
}

export function leaveAlliance(g: GameState, p: Player): CommandResult {
  const a = p.allianceId ? g.alliances[p.allianceId] : null;
  if (!a) return fail('not in an alliance');
  delete a.members[p.id];
  p.allianceId = null;
  touchLinks(g);
  const left = Object.keys(a.members);
  if (!left.length) {
    // the treasury of a dissolved alliance returns to its last member (none left: it is lost)
    delete g.alliances[a.id];
  } else if (a.ownerId === p.id) {
    const next = left.find((m) => a.members[m] === 'officer') ?? left[0]!;
    a.ownerId = next;
    a.members[next] = 'owner';
  }
  return ok();
}

export function allianceDeposit(g: GameState, p: Player, amount: number): CommandResult {
  const a = p.allianceId ? g.alliances[p.allianceId] : null;
  if (!a) return fail('not in an alliance');
  const amt = Math.min(amount, spendableCash(g, p.id));
  if (!(amt > 0)) return fail('enter an amount');
  g.market.accounts[p.id] = { ...g.market.accounts[p.id]!, cash: g.market.accounts[p.id]!.cash - amt, startingCash: g.market.accounts[p.id]!.startingCash - amt };
  a.treasury += amt;
  return ok();
}

export function allianceWithdraw(g: GameState, p: Player, amount: number): CommandResult {
  const a = p.allianceId ? g.alliances[p.allianceId] : null;
  if (!a) return fail('not in an alliance');
  if (a.members[p.id] === 'member') return fail('only the owner and officers can withdraw');
  const amt = Math.min(amount, a.treasury);
  if (!(amt > 0)) return fail('the treasury is empty');
  a.treasury -= amt;
  const acct = g.market.accounts[p.id]!;
  g.market.accounts[p.id] = { ...acct, cash: acct.cash + amt, startingCash: acct.startingCash + amt };
  for (const m of Object.keys(a.members)) if (m !== p.id) notify(g, null, m, { kind: 'alliance', tone: 'warn', text: `${p.handle} withdrew $${Math.round(amt).toLocaleString('en-US')} from the ${a.name} treasury.` });
  return ok();
}

export function alliancePromote(g: GameState, p: Player, target: string): CommandResult {
  const a = p.allianceId ? g.alliances[p.allianceId] : null;
  if (!a || a.ownerId !== p.id) return fail('only the owner can promote');
  if (!a.members[target] || target === p.id) return fail('not a member');
  a.members[target] = a.members[target] === 'officer' ? 'member' : 'officer';
  return ok();
}

export function allianceKick(g: GameState, p: Player, target: string): CommandResult {
  const a = p.allianceId ? g.alliances[p.allianceId] : null;
  if (!a || a.members[p.id] === 'member') return fail('only the owner and officers can remove members');
  if (!a.members[target] || target === a.ownerId || target === p.id) return fail('cannot remove that member');
  delete a.members[target];
  const t = g.players[target];
  if (t) t.allianceId = null;
  touchLinks(g);
  return ok();
}

// ================================================================ deals (loans and transfers)

/** Anti-alt rule (bible 02 anti-cheat): transfers are capped and taxed. */
export const TRANSFER_TAX = 0.05;

/** Lowest rank that may offer or receive a deal (loan or transfer). The Bank app gates its form on this too. */
export const DEALS_RANK = 'R1';

/**
 * The loans each borrower owes (active or defaulted: a default is still a debt), built once per change of the deal book. Every
 * deal mutation calls bumpDeals (here and in court.ts), so the index is never stale; a rebuild is O(deals) and a read is O(1).
 */
const dealVersion = new WeakMap<object, number>();
const owedIndex = new WeakMap<object, { ver: number; owed: Map<string, number> }>();

/** Marks the deal book changed. Every deal mutation calls it, including the court's loan-default verdict (court.ts). */
export function bumpDeals(g: GameState): void {
  dealVersion.set(g, (dealVersion.get(g) ?? 0) + 1);
}

/** Principal and interest a player owes on the loans it borrowed (the lender's receivable is not counted here). */
export function loansOwedOf(g: GameState, pid: string): number {
  const ver = dealVersion.get(g) ?? 0;
  let ix = owedIndex.get(g);
  if (!ix || ix.ver !== ver) {
    const owed = new Map<string, number>();
    for (const d of Object.values(g.deals)) {
      if (d.kind !== 'loan' || (d.status !== 'active' && d.status !== 'defaulted')) continue;
      owed.set(d.toId, (owed.get(d.toId) ?? 0) + (d.outstanding ?? d.amount));
    }
    ix = { ver, owed };
    owedIndex.set(g, ix);
  }
  return ix.owed.get(pid) ?? 0;
}

/**
 * The active loans of the deal book, in the book's order, with the receivable each has now (outstanding, else the amount), and
 * the indexes into that list by lender. Built once per change of the deal book (bumpDeals), like the owed index above, so the
 * tax basis reads the loans of a group, not every deal.
 */
const receivableIdx = new WeakMap<object, { ver: number; loans: { fromId: string; toId: string; amt: number }[]; byFrom: Map<string, number[]> }>();

function receivableIndex(g: GameState): { loans: { fromId: string; toId: string; amt: number }[]; byFrom: Map<string, number[]> } {
  const ver = dealVersion.get(g) ?? 0;
  const hit = receivableIdx.get(g);
  if (hit && hit.ver === ver) return hit;
  const loans: { fromId: string; toId: string; amt: number }[] = [];
  const byFrom = new Map<string, number[]>();
  for (const d of Object.values(g.deals)) {
    if (d.kind !== 'loan' || d.status !== 'active') continue;
    const list = byFrom.get(d.fromId);
    const i = loans.length;
    loans.push({ fromId: d.fromId, toId: d.toId, amt: d.outstanding ?? d.amount });
    if (list) list.push(i); else byFrom.set(d.fromId, [i]);
  }
  const ix = { ver, loans, byFrom };
  receivableIdx.set(g, ix);
  return ix;
}

/**
 * Cash a player holds that it does not own outright: the loans it owes and the gifts it has received, net of gifts it gave.
 * The rank basis subtracts it (assets.ts refreshNetWorth), so borrowing or being gifted money buys no rank peak (ROADMAP R5).
 */
export function unearnedCashOf(g: GameState, pid: string): number {
  return loansOwedOf(g, pid) + (g.players[pid]?.giftsNet ?? 0);
}

/**
 * The rank basis of a player now (R-9-4, Phase 9 rulings): the marked net worth minus the loans owed and the net gifts received.
 * Rank-ups key off its peak (assets.ts refreshNetWorth), and the leaderboards rank on this same value. The ECA fine cap and the
 * comeback card keep raw net worth (no money moves).
 */
export function rankBasisOf(g: GameState, p: Player): number {
  return (p.markNetWorth ?? p.netWorth) - unearnedCashOf(g, p.id);
}

/**
 * The tax basis of an owner (R-9-10, the bracket of its business income): the marked net worth of its owner group (every
 * account linkedAccounts returns, the owner included) plus what that group lends to accounts outside it (the receivable on
 * each active loan). Loans owed and gifts received are NOT taken off: a shop bought with borrowed or gifted money is taxed at
 * the wealth it adds, so it never runs at a lower bracket than the same shop bought with the owner's own cash. Money moved
 * inside the group nets to zero, so a gift or a loan between linked accounts moves no bracket. The rank basis (rankBasisOf,
 * R-9-4) keeps its own rule.
 */
export function taxBasisOf(g: GameState, pid: string): number {
  const group = linkedAccounts(g, pid);
  const inside = new Set(group);
  let basis = 0;
  for (const id of group) {
    const p = g.players[id];
    if (p) basis += p.markNetWorth ?? p.netWorth;
  }
  // the receivables that leave the group, in the deal book's own order (the sum is the same as a scan of every deal)
  const ix = receivableIndex(g);
  const leaving: number[] = [];
  for (const id of group) for (const i of ix.byFrom.get(id) ?? []) if (!inside.has(ix.loans[i]!.toId)) leaving.push(i);
  leaving.sort((x, y) => x - y);
  for (const i of leaving) basis += ix.loans[i]!.amt;
  return basis;
}

/** Gift bookkeeping (Player.giftsNet): the receiver gains what arrives; the giver gives up the gross it sent (never below zero). */
function noteGift(g: GameState, fromId: string, toId: string, received: number, gross: number): void {
  const to = g.players[toId];
  const from = g.players[fromId];
  if (to && !to.npc) to.giftsNet = (to.giftsNet ?? 0) + received;
  if (from && !from.npc) from.giftsNet = Math.max(0, (from.giftsNet ?? 0) - gross);
}

export function offerDeal(g: GameState, p: Player, kind: Deal['kind'], toId: string, amount: number, rate: number, termDays: number, note: string, out: StepOutput | null): CommandResult {
  const to = g.players[toId];
  if (!to || toId === p.id) return fail('pick another player');
  if (kind !== 'loan' && kind !== 'transfer') return fail('unsupported deal');
  if (!(amount >= 100)) return fail('at least $100');
  if (rankIndex(p.rankId) < rankIndex(DEALS_RANK)) return fail('deals unlock at Hustler');
  if (kind === 'transfer') {
    if (rankIndex(to.rankId) < rankIndex(DEALS_RANK)) return fail('the receiver must be Hustler or above');
    if (amount > p.netWorth * 0.1) return fail('transfers are capped at 10% of your net worth');
  }
  if (kind === 'loan') {
    if (!(rate >= 0 && rate <= 1)) return fail('rate between 0% and 100% a year');
    if (!(termDays >= 1 && termDays <= 252)) return fail('term between 1 and 252 game days');
  }
  // ad cash cannot leave the account by a transfer or a loan (velvet-rewarded-ads.md, ROADMAP C5)
  if (spendableCash(g, p.id) < amount) return fail(cashOf(g, p.id) >= amount ? 'adCashTransfer' : 'not enough cash');
  g.dealSeq++;
  const id = `d${g.dealSeq}`;
  g.deals[id] = { id, kind, fromId: p.id, toId, amount, rate: kind === 'loan' ? rate : 0, termDays: kind === 'loan' ? Math.round(termDays) : 0, status: 'offered', createdTick: g.market.tick, paid: 0, note: sanitize(note, 120) };
  bumpDeals(g);
  notify(g, out, toId, { kind: 'deal', tone: 'brass', text: kind === 'loan'
    ? `${p.handle} offers you a loan of $${amount.toLocaleString('en-US')} at ${(rate * 100).toFixed(1)}% for ${termDays} days.`
    : `${p.handle} wants to send you $${amount.toLocaleString('en-US')}.` });
  return ok({ id });
}

export function respondDeal(g: GameState, p: Player, dealId: string, accept: boolean, out: StepOutput | null): CommandResult {
  const d = g.deals[dealId];
  if (!d || d.toId !== p.id || d.status !== 'offered') return fail('no such offer');
  if (!accept) { d.status = 'declined'; notify(g, out, d.fromId, { kind: 'deal', tone: 'info', text: `${p.handle} declined your offer.` }); return ok(); }
  if (spendableCash(g, d.fromId) < d.amount) { d.status = 'cancelled'; return fail('the sender no longer has the cash'); }
  if (d.kind === 'transfer') {
    const tax = d.amount * TRANSFER_TAX;
    transfer(g, d.fromId, d.toId, d.amount - tax);
    recordGift(g, d.fromId, d.toId);
    noteGift(g, d.fromId, d.toId, d.amount - tax, d.amount);
    bumpDeals(g);
    debit(g, d.fromId, tax, 'transfer tax');
    shiftBaselines(g, d.fromId, -tax);
    d.status = 'repaid';
    notify(g, out, d.fromId, { kind: 'deal', tone: 'info', text: `${p.handle} accepted your transfer.` });
    return ok();
  }
  transfer(g, d.fromId, d.toId, d.amount);
  // a loan is player-to-player money too: it counts toward the funding link (collusion.ts), so a loan-funded alt is linked
  recordGift(g, d.fromId, d.toId);
  d.status = 'active';
  d.startTick = g.market.tick;
  d.outstanding = d.amount;
  bumpDeals(g);
  notify(g, out, d.fromId, { kind: 'deal', tone: 'gain', text: `${p.handle} accepted your loan of $${d.amount.toLocaleString('en-US')}.` });
  return ok();
}

export function cancelDeal(g: GameState, p: Player, dealId: string): CommandResult {
  const d = g.deals[dealId];
  if (!d || d.fromId !== p.id || d.status !== 'offered') return fail('no such offer');
  d.status = 'cancelled';
  bumpDeals(g);
  return ok();
}

export function repayDeal(g: GameState, p: Player, dealId: string, amount: number, out: StepOutput | null): CommandResult {
  const d = g.deals[dealId];
  if (!d || d.toId !== p.id || d.status !== 'active') return fail('no active loan');
  const amt = Math.min(amount, d.outstanding ?? 0, spendableCash(g, p.id));
  if (!(amt > 0)) return fail('nothing to repay');
  transfer(g, p.id, d.fromId, amt);
  bumpDeals(g);
  d.outstanding! -= amt;
  d.paid += amt;
  if (d.outstanding! <= 0.005) {
    d.status = 'repaid';
    notify(g, out, d.fromId, { kind: 'deal', tone: 'gain', text: `${p.handle} repaid your loan in full.` });
    p.reputation += 1;
  }
  bumpDeals(g);
  return ok();
}

/** Day boundary: interest accrues on loans; at maturity the lender collects or the loan defaults. */
export function dealsDay(g: GameState, out: StepOutput): void {
  const dpy = g.market.config.daysPerYear;
  bumpDeals(g);
  for (const d of Object.values(g.deals)) {
    if (d.status !== 'active' || d.kind !== 'loan') continue;
    d.outstanding! *= 1 + d.rate / dpy;
    if (g.market.tick - d.startTick! < d.termDays * TPD) continue;
    const borrower = g.players[d.toId];
    const can = Math.max(0, Math.min(d.outstanding!, spendableCash(g, d.toId)));
    if (can > 0) { transfer(g, d.toId, d.fromId, can); d.outstanding! -= can; d.paid += can; }
    if (d.outstanding! <= 0.005) {
      d.status = 'repaid';
      notify(g, out, d.fromId, { kind: 'deal', tone: 'gain', text: `Loan to ${borrower?.handle ?? 'a player'} collected at maturity.` });
    } else {
      d.status = 'defaulted';
      if (borrower) borrower.reputation -= 5;
      notify(g, out, d.fromId, { kind: 'deal', tone: 'loss', text: `${borrower?.handle ?? 'A player'} defaulted on $${Math.round(d.outstanding!).toLocaleString('en-US')}. You can take it to court.` });
      notify(g, out, d.toId, { kind: 'deal', tone: 'loss', text: `You defaulted on a loan. The lender can sue.` });
    }
  }
  bumpDeals(g);
  void today;
}
