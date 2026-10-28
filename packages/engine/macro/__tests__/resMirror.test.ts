// E-106 (2) AC-04-20-RESMIRROR: cb.reserves.fdl mirrors cbk_<b> FDL ledger cash at every close (forced SRL CURRENCY_CRISIS + a forced swap draw).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Ccy } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';

vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { defaultMacroPorts } from '../ports';
import { macroTables, type BlocMacroState, type CentralBank } from '../schema';
import { macroGenesis } from '../core/genesis';
import { postOpeningBalanceSheets } from '../institutions';
import { fxReservesFdl } from '../rules/fxReserves';
import { forceEvent } from '../rules/scheduler';
import { handleSwapDraws, SWAP_DRAW_MSG, SWAP_REPAY_MSG } from '../rules/swapLines';
import { macroWorld } from '../testkit/macroWorld';
import { runDays } from '../testkit/macroLoop';
import { cashShadow } from '../testkit/cashShadow';

const NON_FDL = ['EUN', 'PYN', 'NKR', 'SRL'] as const;
const DRAW_DAY = 60, REPAY_DAY = 200, DRAW = 50_000_000_000n;   // 50 000 FDL; repay half

describe('AC-04-20-RESMIRROR', () => {
  it('seed 1, 364 closes, forced SRL CURRENCY_CRISIS and swap draw/repay: cb.reserves.fdl === ledger cash(cbk_<b>, FDL), reservesFdl = step 4 value', () => {
    const w = macroWorld('resmirror:1', 0), ports = defaultMacroPorts(), sh = cashShadow(w.ctx), p = w.ctx.params;
    postOpeningBalanceSheets(w.ctx, p, p.num('macro_scale_min'));
    macroGenesis(w.ctx, ports);
    const cbOf = (b: Ccy): CentralBank => w.store.get<CentralBank>(macroTables.cb.name, cbkId(b))!;
    const bad: string[] = [];
    let lateInt: Record<string, bigint> = {};
    const check = (at: string, view = true): void => {
      for (const b of NON_FDL) {
        const r = cbOf(b).reserves.fdl, c = sh.cash(cbkId(b), 'FDL');
        if (r !== c) bad.push(`${at} ${b} reserves.fdl ${r} cash ${c}`);
        const st = w.store.get<BlocMacroState>(macroTables.bloc.name, b)!;
        // stepFxDay (3.8) values reserves before swapLineStep (3.8, last) posts that close's swap interest: add it back (PR Decisions)
        const v = fxReservesFdl(w.store, b, ports) + (lateInt[b] ?? 0n);
        if (view && st.fx.reservesFdl !== v) bad.push(`${at} ${b} fx.reservesFdl ${st.fx.reservesFdl} step4 ${v}`);
      }
    };
    check('genesis');
    const srl0 = cbOf('SRL').reserves.fdl;
    runDays(w, ports, 0, 1); check('close 1');
    forceEvent(w.ctx, 'CURRENCY_CRISIS', { severity: 1, blocs: ['SRL'] });
    let armed = false, broke = false, drew = 0, repaid = 0, interest = 0;
    for (let d = 1; d < 364; d++) {
      if (d === DRAW_DAY || d === REPAY_DAY) {   // handleSwapDraws is not in macroPhases yet: deliver and handle between closes
        const f = cbOf('FDL'), lines = f.swapLinesOut.filter((l) => l.counterpartyCbk !== cbkId('SRL'));
        const old = f.swapLinesOut.find((l) => l.counterpartyCbk === cbkId('SRL'));
        w.store.put(macroTables.cb.name, { ...f, swapLinesOut: [...lines, { counterpartyCbk: cbkId('SRL'), limit: 10n * DRAW, spread: 0.0025, active: true, drawn: old?.drawn ?? 0n, calmDays: 0 }] });
        w.ctx.send(cbkId('SRL'), d === DRAW_DAY ? SWAP_DRAW_MSG : SWAP_REPAY_MSG, { bloc: 'SRL', amount: String(d === DRAW_DAY ? DRAW : DRAW / 2n) }, 'NEXT');
        w.cb.deliver(); handleSwapDraws(w.ctx, ports); w.cb.deliver();
        for (const x of w.cb.posts) { if (x.code === 'CBK_SWAP_LINE_DRAW' && x.ccy === 'FDL') drew++; if (x.code === 'CBK_SWAP_LINE_REPAY' && x.ccy === 'FDL') repaid++; }
        check(`swap day ${d}`, false);
      }
      runDays(w, ports, d, d + 1);
      lateInt = {};
      for (const x of w.cb.posts) {
        if (x.code === 'CBK_SWAP_LINE_INTEREST' && x.ccy === 'FDL') { const b = x.from!.slice(4); lateInt[b] = (lateInt[b] ?? 0n) + x.amt; }
        if (x.code === 'CBK_SWAP_LINE_INTEREST' && x.from === cbkId('SRL')) interest++;
      }
      w.cb.posts.length = 0; w.cb.events.length = 0; w.cb.sent.length = 0; w.events.length = 0; w.reads.length = 0;
      const fx = w.store.get<BlocMacroState>(macroTables.bloc.name, 'SRL')!.fx;
      armed ||= !!fx.breakArmed; broke ||= fx.breakTick !== undefined;
      check(`close ${d + 1}`);
      if (bad.length > 20) break;
    }
    expect(bad).toEqual([]);
    expect([armed, broke]).toEqual([true, true]);
    expect([drew, repaid]).toEqual([1, 1]);
    expect(interest).toBeGreaterThan(0);
    expect(cbOf('SRL').reserves.fdl).not.toBe(srl0);
    expect(cbOf('FDL').swapLinesOut.find((l) => l.counterpartyCbk === cbkId('SRL'))!.drawn).toBe(DRAW / 2n);
  }, 300_000);

  it('static: every posting with cbkId( and \'FDL\' in packages/engine/macro is followed by bookCbkFdl', () => {
    const root = join(__dirname, '..'), hits: string[] = [], miss: string[] = [];
    const walk = (d: string): void => {
      for (const n of readdirSync(d).sort()) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) { if (!['node_modules', 'testkit', 'harness', '__tests__', 'dist'].includes(n)) walk(f); continue; }
        if (!n.endsWith('.ts') || n.endsWith('.test.ts')) continue;
        const ls = readFileSync(f, 'utf8').split('\n');
        ls.forEach((l, i) => {
          if (!/ctx\.ledger\.\w+\(/.test(l) || !l.includes('cbkId(') || !l.includes("'FDL'")) return;
          hits.push(`${n}:${i + 1}`);
          const rest = l.slice(l.search(/ctx\.ledger\.\w+\(/)) + '\n' + (ls[i + 1] ?? '');
          if (!rest.includes('bookCbkFdl(')) miss.push(`${n}:${i + 1}`);
        });
      }
    };
    walk(root);
    expect(hits.length).toBe(7);
    expect(miss).toEqual([]);
  });
});
