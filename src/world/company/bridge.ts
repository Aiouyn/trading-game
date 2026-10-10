/**
 * The bridge between the company core and the world (game.ts): the environment the core reads, the two commands, the
 * day step with its founder notes, and the refusal copy keys. The core stays pure; this file touches GameState.
 */

import { priceOf } from '../core';
import { bump, cashOf, notify, today } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { companyAction, companyTick, foundCompany, emptyCompanyWorld, type CompanyEnv, type CompanyEvent } from './company';
import type { CompanyReject } from './types';
import type { CompanyAction } from './company';
import type { CompanySector } from '@/content/company';

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
  const events = companyTick(g.companies, companyEnvOf(g), today(g));
  companyNotes(g, out, events);
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
