// Tape company checks at harness scale (owner: Tape). The seed-sweep rows of tape-company-building.md that run on the
// company world layer (src/world/company), each reported PASS or FAIL over many seeds. The unit form of every row is in
// src/world/company/tape/*.test.ts; this script repeats the statistical ones over more seeds.
// Not run here (recorded as not run, not as pass): the bot P&L bands (cap_carry_edge, signal_postprint_drift,
// alt_prefiling_edge, rho_*), the G15/G18/G20 modelled rows (overflow_not_booked, hiring_full_print, revenue_noise_quarterly),
// the engine gate company_print_full_npc_untouched and rho_engine. Those need the v1.7 harnesses and engine-staging.
// Usage: npx tsx scripts/balance/company-tape.ts [--seeds 20] [--draws 100000]

import { applyCommand } from '../../src/world/game';
import { advanceTo, companyOf, FOUNDER, founded, listedWorld, THREE_FILINGS_DAY } from '../../src/world/company/b1fixture';
import { biasCorrect } from '../../src/world/company/signals';
import { publicCompanyView } from '../../src/world/company/views';
import { windowAt } from '../../src/world/company/insiders';

const args = process.argv.slice(2);
const argOf = (flag: string, dflt: number) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const SEEDS = argOf('--seeds', 20);
const DRAWS = argOf('--draws', 100_000);

interface Row {
  id: string;
  run: (seed: string) => string | null; // null = pass, string = the failure detail
}

/** Seeded standard normal stream (mulberry32 plus Box-Muller), the same generator as the unit row. */
function normalStream(seed: number): () => number {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const r = Math.sqrt(-2 * Math.log(u()));
    const th = 2 * Math.PI * u();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

function seedNumber(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

function farBid(assetId: string) {
  return { assetId, side: 'buy' as const, type: 'limit' as const, limitPrice: 0.0001, qty: 1, tif: 'gtc' as const };
}

const rows: Row[] = [
  {
    id: 'co_determinism',
    run: (seed) => {
      const a = founded(seed);
      const b = founded(seed);
      advanceTo(a.g, 130);
      advanceTo(b.g, 130);
      return JSON.stringify(a.g.companies) === JSON.stringify(b.g.companies) ? null : 'state differs between identical runs';
    },
  },
  {
    id: 'co_ledger_balances',
    run: (seed) => {
      const { g } = founded(seed);
      const money = () => {
        let t = 0;
        for (const a of Object.values(g.market.accounts)) t += a.cash;
        for (const c of Object.values(g.companies!.companies)) t += c.cash;
        for (const p of Object.values(g.companies!.investors)) t += p.cash;
        return t;
      };
      const before = money() + g.companies!.flows.sink - g.companies!.flows.faucet;
      advanceTo(g, 130);
      const after = money() + g.companies!.flows.sink - g.companies!.flows.faucet;
      return Math.abs(after - before) < 1e-6 ? null : `drift ${(after - before).toExponential(3)}`;
    },
  },
  {
    id: 'private_no_signals',
    run: (seed) => {
      const { g } = founded(seed);
      advanceTo(g, 130);
      return publicCompanyView(companyOf(g), 130).signals.length === 0 ? null : 'a private company printed signals';
    },
  },
  {
    id: 'signal_cadence',
    run: (seed) => {
      const { g } = listedWorld(seed);
      advanceTo(g, 240);
      const days = publicCompanyView(companyOf(g), 240).signals.map((s) => s.day);
      if (days.length < 4) return `only ${days.length} signals`;
      for (let i = 1; i < days.length; i++) if (days[i]! - days[i - 1]! !== 5) return `gap ${days[i]! - days[i - 1]!} at ${days[i]}`;
      return null;
    },
  },
  {
    id: 'window_boundaries',
    run: (seed) => {
      const { g, c, assetId } = listedWorld(seed);
      const probe = (day: number, ok: boolean) => {
        advanceTo(g, day);
        const got = applyCommand(g, FOUNDER, { type: 'order.place', order: farBid(assetId) }).ok;
        return got === ok ? null : `day ${day} accepted=${got}`;
      };
      return (
        probe(67, false) ?? probe(68, true) ?? probe(87, true) ?? probe(88, false) ??
        (windowAt(c, 88).opensDay === 131 ? null : 'next opening is not F+2 of the second filing')
      );
    },
  },
  {
    id: 'plan_min_lead',
    run: (seed) => {
      const LOCKUP_END = 201 + 168;
      const commit = (g: ReturnType<typeof listedWorld>['g']) =>
        applyCommand(g, FOUNDER, { type: 'company.plan', companyId: companyOf(g).id, qtyPerDay: 1, days: [LOCKUP_END], minSellPrice: 0.01 }).ok;
      const at62 = listedWorld(`${seed}-62`).g;
      advanceTo(at62, LOCKUP_END - 62);
      if (commit(at62)) return 'lead 62 accepted';
      const at63 = listedWorld(`${seed}-63`).g;
      advanceTo(at63, LOCKUP_END - 63);
      return commit(at63) ? null : 'lead 63 refused';
    },
  },
  {
    id: 'ipo_float_bounds',
    run: (seed) => {
      const ask = (pct: number, tag: string) => {
        const { g } = founded(`${seed}-${tag}`);
        advanceTo(g, THREE_FILINGS_DAY);
        const c = companyOf(g);
        c.filedV = 100_000_000;
        g.players[FOUNDER]!.rankId = 'R3';
        return applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: pct }).ok;
      };
      if (ask(0.1499, 'lo')) return '14.99% accepted';
      if (!ask(0.15, 'at-lo')) return '15% refused';
      if (!ask(0.49, 'at-hi')) return '49% refused';
      return ask(0.4901, 'hi') ? '49.01% accepted' : null;
    },
  },
  {
    id: 'signal_bias_correct',
    run: (seed) => {
      const sigma = 0.04;
      const z = normalStream(seedNumber(seed));
      let sum = 0;
      for (let i = 0; i < DRAWS; i++) sum += (biasCorrect(1, sigma) * Math.exp(sigma * z())) - 1;
      const meanErr = sum / DRAWS;
      return Math.abs(meanErr) < 0.001 ? null : `mean error ${meanErr.toExponential(3)}`;
    },
  },
];

let failed = 0;
for (const row of rows) {
  const fails: string[] = [];
  const t0 = Date.now();
  for (let s = 0; s < SEEDS; s++) {
    const seed = `tape-${String(s + 1).padStart(2, '0')}`;
    const detail = row.run(seed);
    if (detail !== null) fails.push(`${seed}: ${detail}`);
  }
  const ms = Date.now() - t0;
  if (fails.length === 0) {
    console.log(`PASS ${row.id} seeds=${SEEDS} (${ms} ms)`);
  } else {
    failed++;
    console.log(`FAIL ${row.id} seeds=${SEEDS} failing=${fails.length} first: ${fails[0]}`);
  }
}
console.log(`NOT RUN here: cap_carry_edge, signal_postprint_drift, alt_prefiling_edge, rho_residual, rho_engine, overflow_not_booked, hiring_full_print, revenue_noise_quarterly, company_print_full_npc_untouched`);
console.log(failed === 0 ? 'ALL RUN CHECKS PASS' : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
