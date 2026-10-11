/**
 * Insiders and the trading window (quant-company-building v1.7 sections 6.1 and 6.5, Phase 4 B1). The insider roster is the
 * founder, the accounts linked to the founder (the owner set and alliance mates), the company treasury, and any player
 * account holding at least 10% of the shares outstanding. The roster is the engine's covered set: the engine refuses a
 * covered account's orders outside the window (F+2..F+21 after each filing) and cancels its open ones when the window
 * shuts. A scheduled plan is the one exception (programs.ts). Founder trades are filed on the Wire the next day.
 */

import { COMPANY } from '@/content/company';
import { restrictionsOf, setWindow, type WorldState } from '@/engine';
import { notify, today } from '../core';
import type { GameState, StepOutput } from '../types';
import { fundsOf, linked } from '../funds/state';
import { treasuryIdOf } from './ipo';
import type { Company, InsiderTradeRow } from './types';

/** The covered accounts of a listed company, sorted (the engine's covered set). Private companies have no engine window. */
export function rosterOf(g: GameState, c: Company): string[] {
  const ids = new Set<string>([c.ownerId]);
  if (c.treasuryId) ids.add(c.treasuryId);
  for (const pid of Object.keys(g.players)) if (!g.players[pid]!.npc && linked(g, c.ownerId, pid)) ids.add(pid);
  // a fund that the owner (or a linked player) manages trades the stock inside the same window (O-14)
  for (const f of Object.values(fundsOf(g).funds)) if (linked(g, c.ownerId, f.managerId)) ids.add(f.accountId);
  if (c.listed) {
    const need = COMPANY.insiders.holderPct * c.listed.sharesOut;
    for (const [id, a] of Object.entries(g.market.accounts)) {
      if (!g.players[id] || g.players[id]!.npc) continue;
      if ((a.positions[c.listed.assetId]?.qty ?? 0) >= need) ids.add(id);
    }
  }
  return [...ids].sort();
}

/** Pushes the company's window ranges and roster into the engine (a no-op for a private company). */
export function syncWindow(g: GameState, c: Company): void {
  if (!c.listed) return;
  const r = restrictionsOf(g.market);
  g.market = { ...g.market, restrictions: setWindow(r, c.listed.assetId, { covered: rosterOf(g, c), open: c.windowRanges }) };
}

/** Records the window of a new filing: from F + 2 to F + 21, inclusive (Ledger Q2). */
export function addWindowRange(c: Company, filedDay: number): void {
  const I = COMPANY.insiders;
  c.windowRanges.push([filedDay + I.windowOpenDay, filedDay + I.windowCloseDay]);
  if (c.windowRanges.length > 16) c.windowRanges.splice(0, c.windowRanges.length - 16);
}

/**
 * The next day the window opens after `day`: the scheduled range's start when one is known, else a quarter after the last
 * filing's window (F + 63 + F+2, the next filing's window). The founder's line and the public schedule both read it.
 */
export function nextOpenDay(c: Company, day: number): number {
  const known = windowAt(c, day).opensDay;
  if (known !== undefined) return known;
  const last = c.windowRanges[c.windowRanges.length - 1];
  const lastFiling = last ? last[1] - COMPANY.insiders.windowCloseDay : day;
  return lastFiling + COMPANY.quarterDays + COMPANY.insiders.windowOpenDay;
}

/** Whether the window is open on a day, and when it shuts or next opens (the public schedule and the founder's card). */
export function windowAt(c: Company, day: number): { open: boolean; closesDay?: number; opensDay?: number } {
  for (const [a, b] of c.windowRanges) if (day >= a && day <= b) return { open: true, closesDay: b };
  let next: number | undefined;
  for (const [a] of c.windowRanges) if (a > day && (next === undefined || a < next)) next = a;
  return { open: false, ...(next !== undefined ? { opensDay: next } : {}) };
}

/** The founder's trades in the stock, filed the next day (side, size and day only; plan fills count the same, Ledger v1.4). */
export function recordFounderFills(g: GameState, fills: { playerId: string; assetId: string; side: 'buy' | 'sell'; qty: number }[]): void {
  if (!g.companies) return;
  const day = today(g);
  for (const c of Object.values(g.companies.companies)) {
    if (!c.listed) continue;
    for (const f of fills) {
      if (f.playerId !== c.ownerId || f.assetId !== c.listed.assetId) continue;
      const row: InsiderTradeRow = { day, filedDay: day + 1, side: f.side, qty: f.qty, instrument: 'stock' };
      c.insiderTrades.push(row);
    }
    if (c.insiderTrades.length > 200) c.insiderTrades.splice(0, c.insiderTrades.length - 200);
  }
}

/** The ADV of a listing: 0.8% of the float cap at listing, decaying to 0.4% (half-life 21 gd) (§5.1). */
export function advOn(c: Company, day: number, listedDay: number): number {
  const I = COMPANY.ipo;
  const age = Math.max(0, day - listedDay);
  return c.listed!.floatCap * (I.advFloor + (I.advAtListing - I.advFloor) * Math.pow(0.5, age / I.advHalfLifeDays));
}

/** Writes the ADV into the engine's config for the listed asset (the listing sets it once; this keeps it on the decay). */
export function setAdv(s: WorldState, assetId: string, adv: number): WorldState {
  const i = s.config.assets.findIndex((a) => a.id === assetId);
  if (i < 0) return s;
  const assets = s.config.assets.slice();
  assets[i] = { ...assets[i]!, advNotional: adv };
  return { ...s, config: { ...s.config, assets } };
}

/** Whether a live buyback program of the company still has days ahead (the treasury keeps its reserve until then). */
export function buybackLive(s: WorldState, treasuryId: string, day: number): boolean {
  for (const p of Object.values(restrictionsOf(s).programs)) {
    if (p.kind === 'buyback' && p.playerId === treasuryId && !p.ended && p.days.some((d) => d >= day)) return true;
  }
  return false;
}

/**
 * The daily hook of a listed company (the day's first tick): the ADV decay, the roster and window sync, the founder's
 * warning five open days before the window shuts (F+17, the founder only), and the treasury sweep when no buyback is left.
 */
export function listedDay(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  if (!c.listed || !g.companies) return;
  g.market = setAdv(g.market, c.listed.assetId, advOn(c, day, c.listed.ipoDay));
  syncWindow(g, c);
  for (const [, b] of c.windowRanges) {
    if (day === b - (COMPANY.trading.windowClosingDays - 1)) {
      // the next window is the next filing's: a quarter after this filing, its window opens two days later
      const next = nextOpenDay(c, b + 1);
      notify(g, out, c.ownerId, { kind: 'system', tone: 'warn', text: `${c.name}: the trading window closes after day ${b}. It reopens on day ${next}.`, msg: { key: 'company.note.windowClosing', vars: { name: c.name, closesDay: b, reopensDay: next } } });
    }
  }
  const tid = c.treasuryId ? treasuryIdOf(c.id) : null;
  if (tid && !buybackLive(g.market, tid, day)) {
    const cash = g.market.accounts[tid]?.cash ?? 0;
    if (cash > 0) {
      moveTreasury(g, c, -cash);
    }
  }
}

/** Moves cash between the treasury account and the company's books (a transfer, not a faucet or a sink). */
export function moveTreasury(g: GameState, c: Company, delta: number): void {
  if (!c.treasuryId || !g.market.accounts[c.treasuryId]) return;
  const acct = g.market.accounts[c.treasuryId]!;
  g.market = { ...g.market, accounts: { ...g.market.accounts, [c.treasuryId]: { ...acct, cash: acct.cash + delta } } };
  c.cash -= delta;
}
