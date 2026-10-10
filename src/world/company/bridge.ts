/**
 * The bridge between the company core and the world (game.ts): the environment the core reads, the commands, the day step with
 * its founder notes, and the refusal copy keys. The core stays pure; this file touches GameState.
 *
 * The day's order (B1, G19): the company core runs first (its filing publishes and re-anchors, then the day's operations and
 * the quarter close and signals). Then the filings are read (covenants, the window), the prints go to the engine (a company
 * print on a listed stock), the due IPOs list, the listed companies sync their windows, the debt accrues, and the programs
 * place the day's plan and buyback orders. A plan order placed on F's open therefore fills after the re-anchor print.
 */

import { priceOf } from '../core';
import { bump, cashOf, notify, today } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import type { Fill, StepEvent } from '@/engine';
import { printCompanyValue, programsDay, restrictionsOf, sellCapOf, setSellCap } from '@/engine';
import { companyAction, companyTick, foundCompany, emptyCompanyWorld, type CompanyAction, type CompanyEnv, type CompanyEvent } from './company';
import type { CompanyReject } from './types';
import { COMPANY, type CompanySector } from '@/content/company';
import { addWindowRange, listedDay, nextOpenDay, recordFounderFills, syncWindow } from './insiders';
import { listIpo, orderIpo, requestIpo } from './ipo';
import { covenantAtFiling, debtDay, drawLoan, repayLoan } from './debt';
import { applyProgramEvents, cancelPlanFor, commitPlanFor, fileBuyback } from './programs';
import { declareDividend } from './payouts';
import { migrateCompany } from './migrate';

/**
 * Every company record gets the B1 fields if its save predates them (migrate.ts). Cheap: a loop over the companies. A listed
 * company from before the sell cap (set at listing in B1) gets its founder's cap here, once.
 */
function migrateAll(g: GameState): void {
  for (const c of Object.values(g.companies?.companies ?? {})) {
    migrateCompany(c);
    if (c.listed && sellCapOf(restrictionsOf(g.market), c.listed.assetId, c.ownerId) === undefined) {
      const perDay = Math.floor(COMPANY.insiders.sellCapPct * c.listed.sharesOut);
      g.market = { ...g.market, restrictions: setSellCap(restrictionsOf(g.market), c.listed.assetId, c.ownerId, perDay) };
    }
  }
}

/** The environment for the company core, read from the world at the current tick. */
export function companyEnvOf(g: GameState): CompanyEnv {
  const oil = g.market.config.assets.some((a) => a.id === 'OIL') ? Math.log(priceOf(g, 'OIL')) : 0;
  return {
    seed: g.seed,
    day: today(g),
    regime: g.market.regime,
    oilLog: Number.isFinite(oil) ? oil : 0,
    rankOf: (pid) => g.players[pid]?.rankId ?? 'R0',
    money: {
      cash: (pid) => cashOf(g, pid),
      // founding and rounds are transfers between real parties, booked like any other non-trading cash move
      take: (pid, amount) => bump(g, pid, -amount),
    },
  };
}

/** The refusal copy keys of a reject (three parts: what happened, why, what you can do). */
export function refusalKeys(reject: CompanyReject): { what: string; why: string; do: string; vars: Record<string, string | number> } {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(reject)) if (k !== 'code' && (typeof v === 'number' || typeof v === 'string')) vars[k] = v;
  const base = `company.refusal.${reject.code}`;
  return { what: `${base}.what`, why: `${base}.why`, do: `${base}.do`, vars };
}

/** The founder notes for the day's events (private to the owner; the public Wire is a later step). */
export function companyNotes(g: GameState, out: StepOutput | null, events: CompanyEvent[]): void {
  const w = g.companies!;
  for (const e of events) {
    const c = w.companies[e.companyId];
    if (!c) continue;
    if (e.kind === 'filed') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'info', text: `${c.name}: quarter ${e.quarter} filed.`, msg: { key: 'company.note.filed', vars: { name: c.name, quarter: e.quarter } } });
    } else if (e.kind === 'tier') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'brass', text: `${c.name} is now ${e.tier}.`, msg: { key: `company.note.tier.${e.tier}`, vars: { name: c.name } } });
    } else if (e.kind === 'goal') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'gain', text: `${c.name}: goal reached (${e.goal}).`, msg: { key: `company.goal.${e.goal}`, vars: { name: c.name } } });
    } else if (e.kind === 'distress') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'warn', text: `${c.name}: cash is below zero.`, msg: { key: 'company.note.distress', vars: { name: c.name } } });
    } else if (e.kind === 'backlogRepay') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'warn', text: `${c.name}: backlog repayment ${Math.round(e.repayment)}.`, msg: { key: 'company.note.repay', vars: { name: c.name, amount: Math.round(e.repayment) } } });
    }
  }
}

/** The day step: runs only when a company world exists, so worlds without companies are untouched. */
export function companyDay(g: GameState, out: StepOutput | null): void {
  if (!g.companies) return;
  migrateAll(g);
  const day = today(g);
  const events = companyTick(g.companies, companyEnvOf(g), day);
  companyNotes(g, out, events);
  const ids = Object.keys(g.companies.companies).sort();
  // 1. the filings (a new window, covenants) and the prints of the listed stocks (signals and the re-anchor, G21)
  for (const e of events) {
    const c = g.companies.companies[e.companyId];
    if (!c) continue;
    if (e.kind === 'filed') {
      addWindowRange(c, day);
      syncWindow(g, c);
      covenantAtFiling(g, c, day, out);
    } else if ((e.kind === 'signal' || e.kind === 'reanchor') && c.listed) {
      g.market = printCompanyValue(g.market, c.listed.assetId, e.dLnV);
    }
  }
  // 2. the IPOs due today list through the engine
  for (const id of ids) {
    const c = g.companies.companies[id]!;
    if (c.ipo && !c.listed && day === c.ipo.listDay) listIpo(g, c, out);
  }
  // 3. the listed companies: ADV, the window roster, the window warnings, the treasury sweep; every company: the debt
  for (const id of Object.keys(g.companies.companies).sort()) {
    const c = g.companies.companies[id]!;
    if (day >= c.foundedDay) debtDay(g, c, day, out);
    if (c.listed) listedDay(g, c, day, out);
  }
  // 4. the programs: the plans and buybacks due today are placed (they fill on the next tick)
  const pr = programsDay(g.market);
  g.market = pr.state;
  applyProgramEvents(g, pr.events);
}

/** Every tick: the founder's trades in the stock (filed the next day) and the programs' events (a plan's end or a skip). */
export function companyStep(g: GameState, fills: Fill[], events: StepEvent[]): void {
  if (!g.companies) return;
  migrateAll(g);
  recordFounderFills(g, fills);
  applyProgramEvents(g, events);
  windowCloseLines(g, events);
}

/**
 * The founder's Wire line when the window shuts on the open orders the founder still holds (§6.1, Ledger Q7): how many
 * were cancelled and when the window reopens. Only the founder sees it; nothing is public. One line per company per tick.
 */
function windowCloseLines(g: GameState, events: StepEvent[]): void {
  const w = g.companies!;
  const day = today(g);
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.type !== 'restricted' || ev.code !== 'closedWindow') continue;
    for (const c of Object.values(w.companies)) {
      if (c.listed && c.listed.assetId === ev.assetId && c.ownerId === ev.playerId) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
  }
  for (const [id, n] of counts) {
    const c = w.companies[id]!;
    const reopensDay = nextOpenDay(c, day);
    notify(g, null, c.ownerId, {
      kind: 'system', tone: 'warn', text: `${c.name}: trading window closed, ${n} orders cancelled.`,
      msg: { key: 'company.note.windowClosed', vars: { name: c.name, count: n, reopensDay } },
    });
  }
}

function fail(reject: CompanyReject): CommandResult {
  return { ok: false, error: reject.code, data: reject };
}

/**
 * The two commands: found a company and act on one. Refusals return the reject code and its copy keys in `data`. The
 * company world is created only by a successful found, so a refused command never changes a world without companies.
 */
export function companyCommand(g: GameState, pid: string, cmd: { type: 'company.found'; name: string; sector: CompanySector; cityId: string; capital: number } | { type: 'company.act'; companyId: string; action: CompanyAction }, out: StepOutput | null): CommandResult {
  if (cmd.type === 'company.found') {
    const w = g.companies ?? emptyCompanyWorld(g.seed);
    const r = foundCompany(w, companyEnvOf(g), pid, { name: cmd.name, sector: cmd.sector, cityId: cmd.cityId, capital: cmd.capital });
    if (!r.ok) return fail(r.reject);
    g.companies = w;
    notify(g, out, pid, { kind: 'system', tone: 'brass', text: `${cmd.name} is founded.`, msg: { key: 'company.note.founded', vars: { name: cmd.name } } });
    return { ok: true, data: r.value };
  }
  if (!g.companies) return fail({ code: 'unknownCompany' });
  const r = companyAction(g.companies, companyEnvOf(g), pid, cmd.companyId, cmd.action);
  return r.ok ? { ok: true, data: r.value } : fail(r.reject);
}

/** The B1 commands: the IPO, plans, buybacks, loans, repayments and dividends. Each refusal is the company's copy code. */
export type CompanyFinanceCommand = Extract<import('../types').Command, { type: 'company.ipo' | 'company.ipoOrder' | 'company.plan' | 'company.planCancel' | 'company.buyback' | 'company.loan' | 'company.repay' | 'company.dividend' }>;

export function companyFinanceCommand(g: GameState, pid: string, cmd: CompanyFinanceCommand, out: StepOutput | null): CommandResult {
  if (!g.companies) return fail({ code: 'unknownCompany' });
  migrateAll(g);
  const c = g.companies.companies[cmd.companyId];
  if (!c) return fail({ code: 'unknownCompany' });
  let r: { ok: true; value: Record<string, unknown> } | { ok: false; reject: CompanyReject };
  switch (cmd.type) {
    case 'company.ipo': r = requestIpo(g, pid, c, cmd.floatPct, out); break;
    case 'company.ipoOrder': r = orderIpo(g, pid, c, cmd.shares); break;
    case 'company.plan': r = commitPlanFor(g, pid, c, { qtyPerDay: cmd.qtyPerDay, days: cmd.days, minSellPrice: cmd.minSellPrice }, out); break;
    case 'company.planCancel': r = cancelPlanFor(g); break;
    case 'company.buyback': r = fileBuyback(g, pid, c, { size: cmd.size, fromDay: cmd.fromDay, toDay: cmd.toDay }, out); break;
    case 'company.loan': r = drawLoan(g, pid, c, { amount: cmd.amount, guarantee: !!cmd.guarantee, acknowledged: !!cmd.acknowledged }, out); break;
    case 'company.repay': r = repayLoan(g, pid, c, cmd.debtId, cmd.amount); break;
    case 'company.dividend': r = declareDividend(g, pid, c, cmd.perShare, out); break;
  }
  return r.ok ? { ok: true, data: r.value } : fail(r.reject);
}
