/**
 * The bridge between the company core and the world (game.ts): the environment the core reads, the two commands, the
 * day step with its founder notes, and the refusal copy keys. The core stays pure; this file touches GameState.
 */

import { bizDef, priceOf } from '../core';
import { bump, cashOf, notify, today } from '../core';
import { sellBusiness } from '../assets';
import type { CommandResult, GameState, StepOutput } from '../types';
import { companyAction, companyTick, foundCompany, emptyCompanyWorld, type CompanyEnv, type CompanyEvent } from './company';
import { bid, marketShareOf, observeStakes, recordTape } from './takeover';
import { ownerSetOf } from './owners';
import { insiderBackstop } from './backstop';
import { failCompanyStock, restrictionsOf, setFreeze } from '@/engine';
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
    /** the share of a listed company's stock the player holds (insider test, spec 5.3); a private company has none */
    stakeOf: (pid, companyId) => {
      const c = g.companies?.companies[companyId];
      if (!c?.listed || c.shares <= 0) return 0;
      return Math.max(0, g.market.accounts[pid]?.positions[c.listed.assetId]?.qty ?? 0) / c.shares;
    },
    money: {
      cash: (pid) => cashOf(g, pid),
      // founding and rounds are transfers between real parties, booked like any other non-trading cash move
      take: (pid, amount) => bump(g, pid, -amount),
      give: (pid, amount) => bump(g, pid, amount),
      // a clawback that is short sells one T1 business at its sale price (spec 5.3): the proceeds go to the player's cash
      sellT1: (pid) => {
        const biz = Object.values(g.businesses).filter((b) => b.ownerId === pid && bizDef(b).tier === 1).sort((a, b) => a.id.localeCompare(b.id))[0];
        if (!biz) return 0;
        const r = sellBusiness(g, pid, biz.id, null);
        return r.ok ? Number((r.data as { price?: number } | undefined)?.price ?? 0) : 0;
      },
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
    } else if (e.kind === 'bankrupt') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'loss', text: `${c.name} is bankrupt.`, msg: { key: 'company.note.bankrupt', vars: { name: c.name } } });
    } else if (e.kind === 'ceo') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'info', text: `${c.name}: the CEO change is in effect.`, msg: { key: 'company.note.ceo', vars: { name: c.name } } });
    } else if (e.kind === 'backlogRepay') {
      notify(g, out, c.ownerId, { kind: 'system', tone: 'warn', text: `${c.name}: backlog repayment ${Math.round(e.repayment)}.`, msg: { key: 'company.note.repay', vars: { name: c.name, amount: Math.round(e.repayment) } } });
    }
  }
}

/** The day step: runs only when a company world exists, so worlds without companies are untouched. */
export function companyDay(g: GameState, out: StepOutput | null): void {
  if (!g.companies) return;
  const env = companyEnvOf(g);
  const events = companyTick(g.companies, env, today(g));
  companyNotes(g, out, events);
  for (const e of events) {
    if (e.kind !== 'bankrupt' || !e.listed) continue;
    const c = g.companies.companies[e.companyId]!;
    if (c.listed) g.market = failCompanyStock(g.market, c.listed.assetId).state;
    c.listed = null;
  }
  // the takeover watch (T0, spec 9.2) and the daily tape (the pre-attack floor): the engine's last bar is the day just closed
  for (const c of Object.values(g.companies.companies)) {
    if (!c.listed) continue;
    const qty: Record<string, number> = {};
    for (const [pid, acct] of Object.entries(g.market.accounts)) qty[pid] = acct.positions[c.listed.assetId]?.qty ?? 0;
    observeStakes(g.companies, c, qty, c.listed.floatShares, today(g));
    const bars = g.market.assets.find((a) => a.id === c.listed!.assetId)?.bars ?? [];
    const last = bars[bars.length - 1];
    if (last) recordTape(g.companies, c, today(g) - 1, last.c, last.u);
  }
  insiderBackstop(g, out);
}

function fail(reject: CompanyReject): CommandResult {
  return { ok: false, error: reject.code, data: reject };
}

/**
 * The two commands: found a company and act on one. Refusals return the reject code and its copy keys in `data`. The
 * company world is created only by a successful found, so a refused command never changes a world without companies.
 */
export function companyCommand(g: GameState, pid: string, cmd: { type: 'company.found'; name: string; sector: CompanySector; cityId: string; capital: number } | { type: 'company.act'; companyId: string; action: CompanyAction } | { type: 'company.bid'; companyId: string; price: number }, out: StepOutput | null): CommandResult {
  if (cmd.type === 'company.bid') return companyBid(g, pid, cmd);
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
  if (!r.ok) return fail(r.reject);
  // a CEO change freezes the departing CEO's whole covered set (the owner set: alts and alliance mates, spec 6.1 and 9.1)
  if (cmd.action.kind === 'changeCEO') {
    const until = Number(r.value.freezeUntil);
    let restr = restrictionsOf(g.market);
    for (const acct of ownerSetOf(g.companies, pid)) restr = setFreeze(restr, acct, until);
    g.market = { ...g.market, restrictions: restr };
  }
  return { ok: true, data: r.value };
}

/**
 * A takeover bid on a listed company (spec 9.2): the bidder is the player's own account, and the antitrust share is the
 * bidder's company in the same sector, if it has one. The target's founder votes with the stance the founder set (never the
 * bidder's word), and the bidder's owner set is the self-dealing guard.
 */
function companyBid(g: GameState, pid: string, cmd: { companyId: string; price: number }): CommandResult {
  if (!g.companies) return fail({ code: 'unknownCompany' });
  const target = g.companies.companies[cmd.companyId];
  if (!target) return fail({ code: 'unknownCompany' });
  const own = Object.values(g.companies.companies).find((c) => c.ownerId === pid && !c.bankrupt);
  const r = bid(g.companies, g.market, today(g), {
    companyId: cmd.companyId, bidderId: pid,
    bidder: { kind: 'player', playerId: pid, sector: own?.sector ?? target.sector, share: own ? marketShareOf(own) : 0 },
    price: cmd.price, covered: ownerSetOf(g.companies, pid),
  });
  if (!r.ok) return fail(r.reject);
  g.market = r.engine;
  notify(g, null, pid, { kind: 'system', tone: 'brass', text: `Your bid for ${target.name} was accepted.`, msg: { key: 'company.note.bidAccepted', vars: { name: target.name } } });
  return { ok: true, data: { floor: r.floor, t0: r.t0 } };
}
