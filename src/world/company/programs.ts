/**
 * Trading programs (quant-company-building v1.7 sections 5.2, 6.1; Phase 4 B1): sell-only trading plans and buyback programs
 * as world commands. The engine enforces the rules (escrow, the window, the immutability, the day's orders); this file files
 * the terms, maps the engine's refusals to the company's copy codes, and keeps the public rows (no minimum price, no size).
 *
 * A plan is sell-only and locks its shares at commit (no cash escrow). It is committed at least 63 gd before its first day,
 * at most two live per founder and company, and it is immutable: a cancel or an edit returns planImmutable. The founder's
 * sales in a plan or in the window are filed the next day (insiders.ts). Buybacks are filed only on F + 1, with a fixed
 * size and a fixed daily schedule inside the window, at most 1% of float a game day, paid from company cash.
 */

import { COMPANY } from '@/content/company';
import { addBuyback, cancelPlan, commitPlan } from '@/engine';
import { notify, priceOf, pushWire, today } from '../core';
import type { GameState, StepOutput } from '../types';
import { moveTreasury, syncWindow } from './insiders';
import { treasuryIdOf } from './ipo';
import { annualEbitdaOf } from './debt';
import type { Company, CompanyReject } from './types';

export interface PlanTerms {
  qtyPerDay: number;
  days: number[];
  minSellPrice: number;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; reject: CompanyReject };

const fail = (reject: CompanyReject): { ok: false; reject: CompanyReject } => ({ ok: false, reject });

/** The founder's plan: sell-only, locked at commit, with the engine's refusal codes (copied one to one). */
export function commitPlanFor(g: GameState, playerId: string, c: Company, terms: PlanTerms, out: StepOutput | null): Outcome<Record<string, unknown>> {
  if (c.ownerId !== playerId) return fail({ code: 'notFounder' });
  if (!c.listed) return fail({ code: 'planNotListed' });
  const days = terms.days;
  const cap = Math.floor(COMPANY.insiders.sellCapPct * c.listed.sharesOut);
  if (!(Number.isInteger(terms.qtyPerDay) && terms.qtyPerDay > 0) || terms.qtyPerDay > cap) {
    return fail({ code: 'planOverCap', maxPerDay: cap });
  }
  const id = `${c.id}:plan${c.planSeq++}`;
  const r = commitPlan(g.market, { id, playerId, assetId: c.listed.assetId, side: 'sell', qtyPerDay: terms.qtyPerDay, days, minPrice: terms.minSellPrice });
  if (r.reject) return fail(r.reject as CompanyReject);
  g.market = r.state;
  const fromDay = days[0]!;
  const toDay = days[days.length - 1]!;
  c.planRows.push({ id, fromDay, toDay });
  if (c.planRows.length > 64) c.planRows.splice(0, c.planRows.length - 64);
  pushWire(g, out, { kind: 'filing', tag: 'Filing', tone: 'info', text: `${c.name}: a trading plan exists, days ${fromDay} to ${toDay}.`, assetId: c.listed.assetId });
  return { ok: true, value: { planId: id, fromDay, toDay } };
}

/** A plan cannot be edited or cancelled after commit (the engine refuses both, and the refusal is the answer). */
export function cancelPlanFor(g: GameState): { ok: false; reject: CompanyReject } {
  const r = cancelPlan(g.market);
  return fail(r.reject as CompanyReject);
}

/** Reserve for a buyback: the shares at the current price with a margin, from company cash, moved to the treasury account. */
export function buybackReserve(size: number, price: number): number {
  return size * price * COMPANY.debt.buybackReserve;
}

/**
 * Net debt over annualized EBITDA on the filed numbers, with an extra cash outflow (the buyback reserve). Infinite when
 * EBITDA <= 0.
 */
export function leverageAfter(c: Company, extraOutflow: number): number {
  const last = c.filings[c.filings.length - 1];
  const netDebt = (last ? last.balance.debt - (last.balance.cash - (last.relatedCash ?? 0)) - (last.balance.loansOut ?? 0) : 0) + extraOutflow;
  if (netDebt <= 0) return 0;
  const ebitda = annualEbitdaOf(c);
  return ebitda > 0 ? netDebt / ebitda : Number.POSITIVE_INFINITY;
}

/** File a buyback: only on F + 1, inside the window, covenants clean, leverage within 2.5x after the reserve, cash on hand. */
export function fileBuyback(g: GameState, playerId: string, c: Company, spec: { size: number; fromDay: number; toDay: number }, out: StepOutput | null): Outcome<Record<string, unknown>> {
  if (c.ownerId !== playerId) return fail({ code: 'notFounder' });
  if (!c.listed || !c.treasuryId) return fail({ code: 'buybackBadSpec' });
  const day = today(g);
  const filingDay = c.lastFilingDay + COMPANY.programs.buybackFilingOffset;
  if (day !== filingDay) return fail({ code: 'buybackNotFilingDay', filingDay });
  if (c.covenant.status !== 'ok') return fail({ code: 'buybackCovenant', covenant: c.covenant.status });
  const { size, fromDay, toDay } = spec;
  if (!Number.isInteger(size) || size <= 0 || !Number.isInteger(fromDay) || !Number.isInteger(toDay) || toDay < fromDay) {
    return fail({ code: 'buybackBadSpec' });
  }
  const n = toDay - fromDay + 1;
  if (size % n !== 0) return fail({ code: 'buybackBadSpec' });
  const qtyPerDay = size / n;
  const days: number[] = [];
  for (let d = fromDay; d <= toDay; d++) days.push(d);
  const reserve = buybackReserve(size, priceOf(g, c.listed.assetId));
  const lev = leverageAfter(c, reserve);
  if (lev > COMPANY.debt.buybackMaxLeverage) return fail({ code: 'buybackLeverage', maxLeverage: COMPANY.debt.buybackMaxLeverage });
  if (c.cash < reserve) return fail({ code: 'buybackCash', shortfall: reserve - c.cash });
  const id = `${c.id}:bb${c.buybackSeq++}`;
  const r = addBuyback(g.market, { id, playerId: treasuryIdOf(c.id), assetId: c.listed.assetId, qtyPerDay, days, floatShares: c.listed.floatShares });
  if (r.reject) {
    const j = r.reject;
    if (j.code === 'buybackTooLarge') return fail({ code: 'buybackTooLarge', maxPerDay: j.maxPerDay });
    if (j.code === 'closedWindow') return fail({ code: 'buybackClosedWindow', ...(j.untilDay !== undefined ? { untilDay: j.untilDay } : {}) });
    return fail({ code: 'buybackBadSpec' });
  }
  g.market = r.state;
  moveTreasury(g, c, reserve);
  c.buybacks.push({ id, size, fromDay, toDay });
  if (c.buybacks.length > 32) c.buybacks.splice(0, c.buybacks.length - 32);
  syncWindow(g, c);
  pushWire(g, out, { kind: 'filing', tag: 'Filing', tone: 'brass', text: `${c.name}: buyback of ${size} shares, days ${fromDay} to ${toDay}.`, assetId: c.listed.assetId });
  notify(g, out, playerId, { kind: 'system', tone: 'info', text: `${c.name}: buyback filed for ${size} shares.`, msg: { key: 'company.note.buyback', vars: { name: c.name, size } } });
  return { ok: true, value: { programId: id, qtyPerDay, reserve } };
}

/**
 * The engine's program events of a tick or of the day's session open, mapped to the public rows: a plan's end (its reason) and
 * a skip (the day and the reason; the size never leaves the engine). Events for an asset that is not a company stock are ignored.
 */
export function applyProgramEvents(g: GameState, events: { type: string; [k: string]: unknown }[]): void {
  if (!g.companies) return;
  const day = today(g);
  const byAsset = new Map<string, Company>();
  for (const c of Object.values(g.companies.companies)) if (c.listed) byAsset.set(c.listed.assetId, c);
  for (const ev of events) {
    if (ev.type === 'planSkipped') {
      const c = byAsset.get(ev.assetId as string);
      if (!c) continue;
      c.planSkips.push({ day, reason: ev.reason as string });
      if (c.planSkips.length > 128) c.planSkips.splice(0, c.planSkips.length - 128);
    } else if (ev.type === 'planEnded') {
      const c = byAsset.get(ev.assetId as string);
      if (!c) continue;
      const row = c.planRows.find((r) => r.id === ev.programId);
      if (row) row.ended = { day, reason: ev.reason as string };
    }
  }
}
