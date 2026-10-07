import { rankIndex } from '@/content/lifestyle';
import {
  CHAT_KEEP, TPD, cashOf, debit, notify, pushWire, sanitize, today, transfer,
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
  for (const m of Object.keys(a.members)) if (m !== p.id) notify(g, out, m, { kind: 'alliance', tone: 'info', text: `${p.handle} joined ${a.name}.` });
  return ok();
}

export function leaveAlliance(g: GameState, p: Player): CommandResult {
  const a = p.allianceId ? g.alliances[p.allianceId] : null;
  if (!a) return fail('not in an alliance');
  delete a.members[p.id];
  p.allianceId = null;
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
  const amt = Math.min(amount, cashOf(g, p.id));
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
  return ok();
}

// ================================================================ deals (loans and transfers)

/** Anti-alt rule (bible 02 anti-cheat): transfers are capped and taxed. */
export const TRANSFER_TAX = 0.05;

export function offerDeal(g: GameState, p: Player, kind: Deal['kind'], toId: string, amount: number, rate: number, termDays: number, note: string, out: StepOutput | null): CommandResult {
  const to = g.players[toId];
  if (!to || toId === p.id) return fail('pick another player');
  if (kind !== 'loan' && kind !== 'transfer') return fail('unsupported deal');
  if (!(amount >= 100)) return fail('at least $100');
  if (rankIndex(p.rankId) < 1) return fail('deals unlock at Hustler');
  if (kind === 'transfer') {
    if (rankIndex(to.rankId) < 1) return fail('the receiver must be Hustler or above');
    if (amount > p.netWorth * 0.1) return fail('transfers are capped at 10% of your net worth');
  }
  if (kind === 'loan') {
    if (!(rate >= 0 && rate <= 1)) return fail('rate between 0% and 100% a year');
    if (!(termDays >= 1 && termDays <= 252)) return fail('term between 1 and 252 game days');
  }
  if (cashOf(g, p.id) < amount) return fail('not enough cash');
  g.dealSeq++;
  const id = `d${g.dealSeq}`;
  g.deals[id] = { id, kind, fromId: p.id, toId, amount, rate: kind === 'loan' ? rate : 0, termDays: kind === 'loan' ? Math.round(termDays) : 0, status: 'offered', createdTick: g.market.tick, paid: 0, note: sanitize(note, 120) };
  notify(g, out, toId, { kind: 'deal', tone: 'brass', text: kind === 'loan'
    ? `${p.handle} offers you a loan of $${amount.toLocaleString('en-US')} at ${(rate * 100).toFixed(1)}% for ${termDays} days.`
    : `${p.handle} wants to send you $${amount.toLocaleString('en-US')}.` });
  return ok({ id });
}

export function respondDeal(g: GameState, p: Player, dealId: string, accept: boolean, out: StepOutput | null): CommandResult {
  const d = g.deals[dealId];
  if (!d || d.toId !== p.id || d.status !== 'offered') return fail('no such offer');
  if (!accept) { d.status = 'declined'; notify(g, out, d.fromId, { kind: 'deal', tone: 'info', text: `${p.handle} declined your offer.` }); return ok(); }
  if (cashOf(g, d.fromId) < d.amount) { d.status = 'cancelled'; return fail('the sender no longer has the cash'); }
  if (d.kind === 'transfer') {
    const tax = d.amount * TRANSFER_TAX;
    transfer(g, d.fromId, d.toId, d.amount - tax);
    debit(g, d.fromId, tax, 'transfer tax');
    d.status = 'repaid';
    notify(g, out, d.fromId, { kind: 'deal', tone: 'info', text: `${p.handle} accepted your transfer.` });
    return ok();
  }
  transfer(g, d.fromId, d.toId, d.amount);
  d.status = 'active';
  d.startTick = g.market.tick;
  d.outstanding = d.amount;
  notify(g, out, d.fromId, { kind: 'deal', tone: 'gain', text: `${p.handle} accepted your loan of $${d.amount.toLocaleString('en-US')}.` });
  return ok();
}

export function cancelDeal(g: GameState, p: Player, dealId: string): CommandResult {
  const d = g.deals[dealId];
  if (!d || d.fromId !== p.id || d.status !== 'offered') return fail('no such offer');
  d.status = 'cancelled';
  return ok();
}

export function repayDeal(g: GameState, p: Player, dealId: string, amount: number, out: StepOutput | null): CommandResult {
  const d = g.deals[dealId];
  if (!d || d.toId !== p.id || d.status !== 'active') return fail('no active loan');
  const amt = Math.min(amount, d.outstanding ?? 0, cashOf(g, p.id));
  if (!(amt > 0)) return fail('nothing to repay');
  transfer(g, p.id, d.fromId, amt);
  d.outstanding! -= amt;
  d.paid += amt;
  if (d.outstanding! <= 0.005) {
    d.status = 'repaid';
    notify(g, out, d.fromId, { kind: 'deal', tone: 'gain', text: `${p.handle} repaid your loan in full.` });
    p.reputation += 1;
  }
  return ok();
}

/** Day boundary: interest accrues on loans; at maturity the lender collects or the loan defaults. */
export function dealsDay(g: GameState, out: StepOutput): void {
  const dpy = g.market.config.daysPerYear;
  for (const d of Object.values(g.deals)) {
    if (d.status !== 'active' || d.kind !== 'loan') continue;
    d.outstanding! *= 1 + d.rate / dpy;
    if (g.market.tick - d.startTick! < d.termDays * TPD) continue;
    const borrower = g.players[d.toId];
    const can = Math.max(0, Math.min(d.outstanding!, cashOf(g, d.toId)));
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
  void today;
}
