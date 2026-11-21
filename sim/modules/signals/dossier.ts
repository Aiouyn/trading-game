// An as-of dossier for one listed firm: the accounts that reconcile, the unit economics behind them, who it deals with,
// what it owes, who owns it, how it compares with the others in its trade, what it is exposed to, what is coming, and
// where each fact came from and how sure to be of it. Everything here is public or derivable from the public filings.
// Private readings (signals) are never copied in: they stay on the seat that holds them.
import { type World } from '../../kernel/index.ts';
import { GOODS } from '../economy/content.ts';
import { BANK, CAPITAL, DEP, type EconState, type Firm } from '../economy/index.ts';
import { recentReports } from '../earnings/index.ts';
import { futuresPrice } from '../commodities/index.ts';
import { rateBeta } from '../markets/index.ts';
import { revisionsFor, type Revision } from '../media/exposure.ts';
import { consensusFor } from './index.ts';

const LISTED_FUTURES = new Set(['CRUDE_OIL', 'NATURAL_GAS', 'COAL', 'IRON_ORE', 'COPPER', 'LITHIUM', 'GRAIN', 'LIVESTOCK']);
const econ = (w: World): EconState => w.state.economy as EconState;

interface Stk { instr: string; issuer: string; last: number; prev: number; profitEma: number; opTilt?: number; opRead?: string; barSrc?: string; mark?: number; markRule?: string; hist: { c: number }[]; printUntil?: number }
const stocks = (w: World): Stk[] => (w.state.markets as { stocks?: Stk[] } | undefined)?.stocks ?? [];

export interface Line { label: string; cents: number; note?: string }
export interface SourceRow { fact: string; source: string; day: number; confidence: string; how: string }

function firmOf(w: World, key: string): Firm | undefined {
  const k = key.toLowerCase().replace(/^eq:/, '');
  for (const f of econ(w).firms) {
    const bare = f.id.startsWith('frm_') ? f.id.slice(4) : f.id;
    if (f.id.toLowerCase() === k || bare === k || f.name.toLowerCase() === k) return f;
  }
  return undefined;
}

function nextPrint(w: World, f: Firm): number {
  for (let d = w.day; d < w.day + 120; d++) if ((d + 1) % 30 === 0 && Math.floor(d / 30) % 3 === f.idx % 3) return d;
  return w.day + 90;
}

function peers(w: World, f: Firm): unknown[] {
  const s = econ(w);
  const rows: unknown[] = [];
  const same = s.firms.filter((o) => !o.closed && o.listed && o.sector === f.sector);
  for (const o of same) {
    const st = stocks(w).find((x) => x.issuer === o.id);
    if (!st) continue;
    const sh = Math.max(1, Math.round(w.ledger.issued.get('eq:' + o.id) ?? 0));
    const cap = st.last * sh;
    const annual = Math.max(0, st.profitEma) * 12;
    const sales = Math.max(1, o.soldEma * o.price * 360);
    const one = st.prev > 0 ? st.last / st.prev - 1 : 0;
    const back = st.hist.length > 20 ? st.hist[st.hist.length - 21].c : 0;
    rows.push({
      id: o.id, name: o.name, self: o.id === f.id, good: GOODS[o.good]?.name ?? o.good,
      px: st.last, day: one, month: back > 0 ? st.last / back - 1 : null,
      pe: annual > 0 ? cap / annual : null, priceToSales: cap / sales,
      margin: o.markup > 1 ? 1 - 1 / o.markup : 0,
      staff: o.workers,
    });
  }
  return rows.slice(0, 10);
}

export function dossierOf(w: World, key: string, nameOf: (id: string) => string): Record<string, unknown> | undefined {
  if (key.toLowerCase().replace(/^eq:/, '') === BANK) return undefined;
  const f = firmOf(w, key);
  if (!f) return undefined;
  const s = econ(w), L = w.ledger, P = s.P;
  const st = stocks(w).find((x) => x.issuer === f.id);
  const g = GOODS[f.good];
  const shares = Math.max(0, Math.round(L.issued.get('eq:' + f.id) ?? 0));
  const loan = Math.round(L.issued.get('loan:' + f.id) ?? 0), cf = Math.round(L.issued.get('cf:' + f.id) ?? 0);
  const debt = loan + cf;
  const rate = s.policyRate + 0.03;
  const interestMonth = Math.round(debt * rate / 12);
  const reports = recentReports(w, f.id, 4);
  const last = reports[reports.length - 1];
  const cash = Math.floor(L.balance(f.id, DEP));
  const invUnits = Math.max(0, Math.round(L.balS(f.slot, 'good:' + f.good) || 0));

  // Income statement: the last filed quarter when there is one, otherwise the month so far, and say which.
  let income: Record<string, unknown>;
  if (last) {
    // The filing counts costs as revenue less profit, so interest sits inside them. Interest is the debt at that report at the loan rate for a quarter.
    const interest = Math.max(0, Math.min(Math.round(last.revenue - last.profit), Math.round(last.debt * rate / 4)));
    const operating = Math.round(last.revenue - last.profit) - interest;
    const tax = Math.round(Math.max(0, last.profit) * (s.profitTax ?? 0.2));
    income = {
      basis: 'quarter', label: 'Last filed quarter', day: last.day, audited: true,
      lines: [
        { label: 'Revenue', cents: Math.round(last.revenue) },
        { label: 'Operating costs', cents: -operating, note: 'wages, inputs and other running costs' },
        { label: 'Interest', cents: -interest, note: 'debt at the report times the loan rate' },
        { label: 'Profit before tax', cents: Math.round(last.profit) },
        { label: 'Tax at the rate in force', cents: -tax },
        { label: 'Profit after tax', cents: Math.round(last.profit) - tax },
      ] as Line[],
      eps: last.eps, check: 'Revenue less costs less interest equals profit before tax.',
    };
  } else {
    const interest = Math.round(interestMonth * ((w.day % 30) + 1) / 30);
    const profit = Math.round(f.mRev - f.mCost - interest);
    income = {
      basis: 'month', label: 'Month so far (no quarter has been filed yet)', day: w.day, audited: false,
      lines: [
        { label: 'Revenue', cents: Math.round(f.mRev) },
        { label: 'Operating costs', cents: -Math.round(f.mCost) },
        { label: 'Interest', cents: -interest, note: `debt at ${(rate * 100).toFixed(2)}%` },
        { label: 'Profit before tax', cents: profit },
      ] as Line[],
      eps: shares > 0 ? profit / shares : 0, check: "Estimate from the firm's own month so far; it is not a filing.",
    };
  }

  const invValue = Math.round(invUnits * Math.max(0, f.unitCost));
  // Machinery is not in the ledger's face-value net worth, so it is counted here at what a year of the wage bill per unit
  // of daily capacity costs to install (the rule the firm itself uses when it buys plant).
  const cpu = 360 * s.wage / Math.max(0.01, g?.prod ?? 1);
  const plant = Math.round(L.balance(f.id, CAPITAL) * cpu);
  const faceNet = Math.round(L.netWorth(f.id));
  const other = faceNet + debt - cash;
  const assets = cash + other + invValue + plant;
  const equity = assets - debt;
  const balance: Line[] = [
    { label: 'Cash', cents: cash },
    { label: 'Inventory at cost', cents: invValue, note: `${invUnits.toLocaleString('en-US')} units` },
    { label: 'Machinery at replacement cost', cents: plant, note: `${Math.round(L.balance(f.id, CAPITAL)).toLocaleString('en-US')} units of daily capacity` },
    { label: 'Receivables and other claims', cents: other },
    { label: 'Total assets', cents: assets },
    { label: 'Debt to the bank', cents: debt },
    { label: 'Equity', cents: equity, note: 'assets less debt; listed stakes the firm holds are not counted' },
  ];

  const cashFlow: Line[] = [];
  if (last) {
    cashFlow.push({ label: `Cash at the last report (day ${last.day})`, cents: Math.round(last.cash) });
    cashFlow.push({ label: 'Cash now', cents: cash });
    cashFlow.push({ label: 'Change since', cents: cash - Math.round(last.cash) });
    cashFlow.push({ label: 'Debt at the last report', cents: Math.round(last.debt) });
    cashFlow.push({ label: 'Debt now', cents: debt });
  }
  cashFlow.push({ label: 'Last month: profit before tax', cents: Math.round(f.lastProfit) });
  cashFlow.push({ label: 'Last month: dividends and cash returned', cents: -Math.round(f.lastDividend), note: 'cash above a month of payroll goes to holders, then repays the loan' });
  cashFlow.push({ label: "Interest each month at today's debt", cents: -interestMonth });

  const inputs = Object.entries(g?.inputs ?? {}).map(([good, per]) => {
    const makers = s.firms.filter((o) => !o.closed && o.good === good);
    const px = makers.length ? makers.reduce((a, o) => a + o.price, 0) / makers.length : 0;
    return {
      good, name: GOODS[good]?.name ?? good, shareOfPrice: f.price > 0 ? Math.min(1, per * px / f.price) : 0,
      suppliers: makers.slice(0, 3).map((o) => ({ id: o.id, name: o.name })),
      future: LISTED_FUTURES.has(good) ? futuresPrice(w, good, 0) : 0,
    };
  });
  const buyers = s.firms.filter((o) => !o.closed && g && GOODS[o.good]?.inputs[f.good]).slice(0, 8)
    .map((o) => ({ id: o.id, name: o.name, good: GOODS[o.good].name }));

  const holders = [...L.holders('eq:' + f.id).entries()].filter(([, q]) => q > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([id, q]) => ({ id, name: nameOf(id), shares: Math.round(q), pct: shares > 0 ? q / shares : 0 }));
  const splitId = w.events.last('firm.split');
  const splitEv = splitId !== undefined ? w.events.get(splitId) : undefined;
  const split = splitEv && splitEv.actor === f.id ? splitEv : undefined;

  const printDay = nextPrint(w, f);
  const cons = consensusFor(w, f.id);
  const live = s.shocks.filter((x) => x.until > w.day).map((x) => ({ text: x.def.text, daysLeft: x.until - w.day, event: x.ev }));
  const revs: Revision[] = revisionsFor(w, f.id, 5);

  const sources: SourceRow[] = [];
  if (last) sources.push({ fact: 'Quarterly accounts', source: "the firm's filing", day: last.day, confidence: 'high: filed and counted by the desk', how: 'press and Wire carry the same event' });
  sources.push({ fact: 'Month so far and unit economics', source: "the firm's own books, shown as estimates", day: w.day, confidence: 'medium: not yet audited', how: "read from the firm's sales, costs and payroll" });
  if (st) sources.push({ fact: 'Price', source: st.barSrc === 'traded' ? 'the exchange: an execution' : 'the exchange: an indicative mark, no execution', day: w.day, confidence: st.barSrc === 'traded' ? 'high' : 'medium: a rule, not a trade', how: st.markRule ?? "earnings value inside the day's band" });
  if (cons) sources.push({ fact: 'Street forecast range', source: `${cons.analysts} analysts working from books ${cons.lagDays} days old`, day: cons.day, confidence: cons.analysts >= 3 ? 'medium' : 'low: few analysts', how: 'published a few days before the print' });
  for (const r of revs) sources.push({ fact: r.headline, source: r.source, day: r.publicDay, confidence: r.confidence, how: `the firm's people could know it from day ${r.insideDay}; it was public on day ${r.publicDay}` });

  return {
    asOf: w.day,
    id: f.id, name: f.name, sector: f.sector, good: f.good, goodName: g?.name ?? f.good, listed: f.listed && !!st,
    ceo: f.ceo >= 0 && f.ceo < P.n ? P.name(f.ceo) : null, staff: f.workers,
    price: st ? { instr: st.instr, px: st.last, prev: st.prev, shares, cap: st.last * shares, executable: st.barSrc === 'traded', rule: st.markRule ?? null } : null,
    income, balance, cashFlow,
    units: {
      price: Math.round(f.price), unitCost: Math.round(f.unitCost), perUnit: Math.round(f.price - f.unitCost),
      markup: f.markup, soldPerDay: Math.round(f.soldEma), madePerDay: Math.round(f.madeEma), workers: f.workers,
      outputPerWorker: f.eff > 0 ? f.madeEma / f.eff : 0, recipeOutput: g?.prod ?? 0, productivity: f.tfp ?? 1,
      priceSinceMonthStart: f.mPrice0 > 0 ? f.price / f.mPrice0 - 1 : 0,
      costSinceMonthStart: f.mUnitCost0 > 0 ? f.unitCost / f.mUnitCost0 - 1 : 0,
      volumeVsNorm: f.soldEma > 0 ? f.sold / f.soldEma - 1 : 0,
      machinery: Math.round(L.balance(f.id, CAPITAL)),
      operations: st?.opRead ?? null, tilt: st?.opTilt ?? 0,
    },
    inventory: { units: invUnits, daysOfSales: f.soldEma > 0 ? invUnits / f.soldEma : null },
    counterparties: { suppliers: inputs, buyers, households: g?.share ?? 0, government: g?.gov ?? 0 },
    debt: {
      loan, charter: cf, rate, interestMonth,
      maturity: debt > 0 ? 'No fixed maturity. The loan is revolving: each month the firm pays interest, then dividends, then repays the loan from any cash above a month of payroll.' : 'No debt.',
      cover: interestMonth > 0 ? f.lastProfit / interestMonth + 1 : null,
    },
    ownership: {
      shares, holders, listedOn: f.listOn, ipoPx: f.ipoPx,
      dilution: split ? { day: split.day, note: split.msg } : null,
    },
    comparables: peers(w, f),
    exposures: {
      commodities: inputs.filter((x) => x.future > 0).map((x) => ({ good: x.good, name: x.name, shareOfPrice: x.shareOfPrice, future: x.future })),
      sells: LISTED_FUTURES.has(f.good) ? { good: f.good, name: g?.name ?? f.good, future: futuresPrice(w, f.good, 0) } : null,
      rates: { beta: rateBeta(w, f.id), debt, oneHundredBp: Math.round(debt * 0.01), note: 'extra interest a year for each percentage point on the policy rate' },
      fx: 'No foreign currency sales or costs are modelled for this firm.',
    },
    upcoming: {
      nextPrint: printDay, daysAway: printDay - w.day,
      forecast: cons ? { profit: cons.profit, low: cons.low, high: cons.high, analysts: cons.analysts, lagDays: cons.lagDays, tilt: cons.tilt } : null,
      bankMeeting: s.cbNext ? s.cbNext.day : null, shocks: live,
    },
    revisions: revs.map((r) => ({ ...r })),
    sources,
    privacy: 'Anything you learn privately about this firm is on your readings, not here. This page holds only what has been filed, printed or traded.',
  };
}
