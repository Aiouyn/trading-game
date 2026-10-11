/**
 * The bridge between the company core and the world (game.ts): the environment the core reads, the commands, the day step with
 * its founder notes, and the refusal copy keys. The core stays pure; this file touches GameState.
 *
 * The day's order (B1, G19): the company core runs first (its filing publishes and re-anchors, then the day's operations and
 * the quarter close and signals). Then the filings are read (covenants, the window), the prints go to the engine (a company
 * print on a listed stock), the due IPOs list, the listed companies sync their windows, the debt accrues, and the programs
 * place the day's plan and buyback orders. A plan order placed on F's open therefore fills after the re-anchor print.
 */

import { bizDef, priceOf } from '../core';
import { bump, notify, spendableCash, today } from '../core';
import { sellBusiness } from '../assets';
import type { CommandResult, GameState, StepOutput } from '../types';
import type { Fill, StepEvent } from '@/engine';
import { failCompanyStock, printCompanyValue, programsDay, restrictionsOf, sellCapOf, setFreeze, setSellCap } from '@/engine';
import { companyAction, companyTick, foundCompany, emptyCompanyWorld, type CompanyAction, type CompanyEnv, type CompanyEvent } from './company';
import { bid, marketShareOf, observeStakes, recordTape } from './takeover';
import { ownerSetOf, syncAllianceLinks } from './owners';
import { insiderBackstop, scorePlanAbuse } from './backstop';
import type { CompanyReject } from './types';
import { COMPANY, type CompanySector } from '@/content/company';
import { addWindowRange, listedDay, nextOpenDay, recordFounderFills, syncWindow } from './insiders';
import { listIpo, orderIpo, requestIpo } from './ipo';
import { covenantAtFiling, debtDay, drawLoan, repayLoan } from './debt';
import { applyProgramEvents, cancelPlanFor, commitPlanFor, fileBuyback } from './programs';
import { declareDividend, sweepPoolCash } from './payouts';
import { migrateCompany } from './migrate';

/** The owner links of the company world follow the alliances (V1, owners.ts): read before any owner-set rule runs. */
function syncLinks(g: GameState): void {
  if (!g.companies) return;
  const allianceOf: Record<string, string | null> = {};
  for (const [id, p] of Object.entries(g.players)) allianceOf[id] = p.allianceId;
  syncAllianceLinks(g.companies, allianceOf);
}

/**
 * Every company record gets the B1 fields if its save predates them (migrate.ts). Cheap: a loop over the companies. A listed
 * company from before the sell cap (set at listing in B1) gets its founder's cap here, once.
 */
function migrateAll(g: GameState): void {
  syncLinks(g);
  for (const c of Object.values(g.companies?.companies ?? {})) {
    migrateCompany(c);
    // a listed save from before the insider was named on the stock (O-14): the founder is its insider
    if (c.listed && g.market.config.assets.some((a) => a.id === c.listed!.assetId && a.insiderId === undefined)) {
      const assets = g.market.config.assets.map((a) => (a.id === c.listed!.assetId && a.insiderId === undefined ? { ...a, insiderId: c.ownerId } : a));
      g.market = { ...g.market, config: { ...g.market.config, assets } };
    }
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
    /** the share of a listed company's stock the player holds (insider test, spec 5.3); a private company has none */
    stakeOf: (pid, companyId) => {
      const c = g.companies?.companies[companyId];
      if (!c?.listed || c.shares <= 0) return 0;
      return Math.max(0, g.market.accounts[pid]?.positions[c.listed.assetId]?.qty ?? 0) / c.shares;
    },
    money: {
      cash: (pid) => spendableCash(g, pid),
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

/** The note copy suffix for a staged decision the close refused: the codes the start checks can give (company.ts applyStaged). */
const STAGED_DROP_CODES = ['insufficientFunds', 'projectBusy', 'noRdStaff', 'unknownProduct', 'negativeAmount'] as const;
export function stagedDropCopy(code: string | undefined): string {
  return (STAGED_DROP_CODES as readonly string[]).includes(code ?? '') ? code! : 'other';
}

const USD = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A sum as the screen writes money ($80,000.00), so a note reads "short $80,000.00", never a bare integer. */
function usdWhole(n: number): string {
  return `$${USD.format(Math.abs(n))}`;
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
    } else if (e.kind === 'staged') {
      // O-17: the founder hears that the decision confirmed on this day was applied at its close, or dropped at it, with the
      // refusal's reason and the next step (what, why, do): one note key per refusal code the close can give
      const applied = e.status === 'applied';
      const key = applied ? 'company.note.stagedApplied' : `company.note.stagedDropped.${stagedDropCopy(e.code)}`;
      const text = applied ? `${c.name}: the staged project started at the close of day ${e.day}.` : `${c.name}: the staged project did not start at the close of day ${e.day} (${e.code ?? 'refused'}).`;
      const vars = { name: c.name, day: e.day, amount: Math.round(e.spend), shortfall: usdWhole(e.shortfall ?? 0) };
      notify(g, out, c.ownerId, { kind: 'system', tone: applied ? 'info' : 'warn', text, msg: { key, vars } });
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
  // a company that went bankrupt this day leaves the market: its stock fails with it (B2, failure.ts)
  for (const e of events) {
    if (e.kind !== 'bankrupt' || !e.listed) continue;
    const c = g.companies.companies[e.companyId]!;
    if (c.listed) g.market = failCompanyStock(g.market, c.listed.assetId).state;
    c.listed = null;
  }
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
    // a bankrupt company is closed: it accrues no interest and runs no covenant (its debts were settled by the default)
    if (c.bankrupt) continue;
    if (day >= c.foundedDay) debtDay(g, c, day, out);
    if (c.listed) listedDay(g, c, day, out);
  }
  // 4. the programs: the plans and buybacks due today are placed (they fill on the next tick)
  const pr = programsDay(g.market);
  g.market = pr.state;
  applyProgramEvents(g, pr.events);
  // 5. the takeover watch (T0, spec 9.2) and the daily tape (the pre-attack floor): the engine's last bar is the day just closed
  for (const c of Object.values(g.companies.companies)) {
    if (!c.listed) continue;
    const qty: Record<string, number> = {};
    for (const [pid, acct] of Object.entries(g.market.accounts)) qty[pid] = acct.positions[c.listed.assetId]?.qty ?? 0;
    observeStakes(g.companies, c, qty, c.listed.floatShares, day);
    const bars = g.market.assets.find((a) => a.id === c.listed!.assetId)?.bars ?? [];
    const last = bars[bars.length - 1];
    if (last) recordTape(g.companies, c, day - 1, last.c, last.u);
  }
  // 6. the insider backstop (B2): the insider's forced sales and the squeeze settle at the close
  insiderBackstop(g, out);
}

/** Every tick: the founder's trades in the stock (filed the next day) and the programs' events (a plan's end or a skip). */
export function companyStep(g: GameState, fills: Fill[], events: StepEvent[]): void {
  if (!g.companies) return;
  migrateAll(g);
  recordFounderFills(g, fills);
  // a pool's sale proceeds (and any purchase) are its investors', pro rata (O-9)
  sweepPoolCash(g);
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
export function companyCommand(g: GameState, pid: string, cmd: { type: 'company.found'; name: string; sector: CompanySector; cityId: string; capital: number } | { type: 'company.act'; companyId: string; action: CompanyAction } | { type: 'company.bid'; companyId: string; price: number }, out: StepOutput | null): CommandResult {
  syncLinks(g);
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
    case 'company.planCancel':
      // only the founder runs the company's plans: another player's cancel is refused, and scores nothing (O-15 review)
      if (c.ownerId !== pid) {
        r = { ok: false, reject: { code: 'notFounder' } };
        break;
      }
      r = cancelPlanFor(g);
      // a committed plan cannot be cancelled: the founder's attempt is plan abuse (O-15), scored when the plan is refused
      if (!r.ok && r.reject.code === 'planImmutable' && c.listed) scorePlanAbuse(g, pid, c.listed.assetId);
      break;
    case 'company.buyback': r = fileBuyback(g, pid, c, { size: cmd.size, fromDay: cmd.fromDay, toDay: cmd.toDay }, out); break;
    case 'company.loan': r = drawLoan(g, pid, c, { amount: cmd.amount, guarantee: !!cmd.guarantee, acknowledged: !!cmd.acknowledged }, out); break;
    case 'company.repay': r = repayLoan(g, pid, c, cmd.debtId, cmd.amount); break;
    case 'company.dividend': r = declareDividend(g, pid, c, cmd.perShare, out); break;
  }
  return r.ok ? { ok: true, data: r.value } : fail(r.reject);
}
