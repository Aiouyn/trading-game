import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ParamsView } from '@tycoon/params';
import type { ContentView } from '@tycoon/content';
import type { Store } from '../store';
import {
  BUILD_UNITS, buildModuleSet, defineModule, INTENT_NAMESPACES, ModuleSetError, NON_MODULE_UNITS, NPC_INTENT_KIND,
  type IntentHandler, type LedgerProvider, type ModuleDef, type PhaseCtx, type ValidateCtx, type ViewHandler,
} from './index';

const provider: LedgerProvider = { createPartition: () => { throw new Error('unused'); }, globalCheck: () => ({ ok: true, failures: [] }) };
const handler = (kind: string): IntentHandler => ({ kind, schema: z.unknown(), applyPhase: 'P1', validate: () => null, apply: () => null });
const view = (id: string): ViewHandler => ({ id, schema: z.unknown(), run: () => null });
const mod = (id: string, o: Partial<ModuleDef> = {}): ModuleDef => ({
  id, module: id.slice(0, 2), dependsOn: [...(BUILD_UNITS[id] ?? [])], tables: [], streams: [], phases: {}, intents: [], events: {}, invariants: [], views: [], ...o });
const err = (f: () => unknown): { code: string; message: string } | undefined => { try { f(); } catch (e) { return e as ModuleSetError; } return undefined; };

describe('T02-11 module registry', () => {
  it('valid set: 05 without 04/14A/13A -> MOD_MISSING_DEP naming 04; adding them builds, sorted by (module number, unit id)', () => {
    const base = [mod('05', { streams: ['mkt.idio'] }), mod('03', { services: { ledger: provider }, streams: ['ledger.audit_sample'] }), mod('02', { streams: ['core.genesis'] })];
    const e = err(() => buildModuleSet(base));
    expect(e).toBeInstanceOf(ModuleSetError); expect(e!.code).toBe('MOD_MISSING_DEP'); expect(e!.message).toContain("needs '04'");
    const set = buildModuleSet([mod('14A'), ...base, mod('13A'), mod('04')]);
    expect(set.modules.map((m) => m.id)).toEqual(['02', '03', '04', '05', '13A', '14A']);
    expect(set.ledger).toBe(provider);
    expect(set.ownsStream('05', 'mkt.idio:ast_X')).toBe(true); expect(set.ownsStream('05', 'mkt.jump:ast_X')).toBe(false);   // jump not declared
    expect(set.ownsStream('04', 'mkt.idio:ast_X')).toBe(false); expect(set.ownsStream('05', 'nope:x')).toBe(false);
    expect(buildModuleSet([mod('02'), mod('03'), mod('04')]).ledger).toBeUndefined();
    // ownsStream checks the registry owner too, even for a set built from modules that skipped defineModule
    const raw = buildModuleSet([mod('02'), mod('03'), mod('04', { streams: ['mkt.idio'] })]);
    expect(raw.ownsStream('04', 'mkt.idio:ast_X')).toBe(false);
  });
  it('lookups: intent, eventSchema, view', () => {
    const h = handler('mkt.buy'), v = view('mkt.book'), ev = z.object({ a: z.number() });
    const s = buildModuleSet([mod('02'), mod('03'), mod('04'), mod('14A'), mod('13A'), mod('05', { intents: [h], views: [v], events: { 'mkt.filled': ev } })]);
    expect(s.intent('mkt.buy')!.h).toBe(h); expect(s.intent('mkt.buy')!.def.id).toBe('05'); expect(s.intent('mkt.sell')).toBeUndefined();
    expect(s.eventSchema('mkt.filled')).toBe(ev); expect(s.eventSchema('x')).toBeUndefined();
    expect(s.view('mkt.book')!.v).toBe(v); expect(s.view('toString')).toBeUndefined(); expect(s.intent('constructor')).toBeUndefined();
  });
  // one test per ModuleSetError code
  const t = { name: 'chr.entity', module: '04', idOf: (e: { id: string }) => e.id };
  const cases: [string, () => unknown][] = [
    ['MOD_UNKNOWN_UNIT', () => buildModuleSet([mod('99')])],
    ['MOD_MISSING_DEP', () => buildModuleSet([mod('04')])],
    ['MOD_DUP_UNIT', () => buildModuleSet([mod('02'), mod('03'), mod('03')])],
    ['MOD_TABLE_OWNER', () => defineModule(mod('03', { tables: [t] }))],
    ['MOD_DUP_TABLE', () => buildModuleSet([mod('02'), mod('03'), mod('04', { tables: [t] }), mod('16A', { module: '16', tables: [t] })])],
    ['MOD_STREAM_FOREIGN', () => defineModule(mod('04', { streams: ['mkt.idio'] }))],
    ['MOD_DUP_INTENT', () => buildModuleSet([mod('02'), mod('03'), mod('14A', { intents: [handler('acct.x')] }), mod('20A', { module: '20', intents: [handler('acct.x')] })])],
    ['MOD_INTENT_NS', () => defineModule(mod('05', { intents: [handler('bank.x')] }))],
    ['MOD_DUP_EVENT', () => buildModuleSet([mod('02'), mod('03'), mod('04', { events: { 'macro.x': z.unknown() } }), mod('16A', { events: { 'macro.x': z.unknown() } })])],
    ['MOD_EVENT_NS', () => defineModule(mod('04', { events: { 'mkt.x': z.unknown() } }))],
    ['MOD_DUP_VIEW', () => buildModuleSet([mod('02'), mod('03'), mod('04', { views: [view('v')] }), mod('16A', { views: [view('v')] })])],
    ['MOD_TWO_LEDGERS', () => buildModuleSet([mod('02'), mod('03', { services: { ledger: provider } }), mod('04', { services: { ledger: provider } })])],
  ];
  for (const [code, f] of cases) it(`ModuleSetError ${code}`, () => { expect(err(f)?.code).toBe(code); });
  it('MOD_TWO_LEDGERS when the only ledger provider is not module 03', () => {
    expect(err(() => buildModuleSet([mod('02'), mod('03'), mod('04', { services: { ledger: provider } })]))?.message).toContain("must come from module '03'");
  });
  it('MOD_TWO_LEDGERS also when two 03 units provide one', () => {
    expect(err(() => buildModuleSet([mod('03', { services: { ledger: provider } }), mod('03', { id: '03B', services: { ledger: provider } })]))?.code).toBe('MOD_UNKNOWN_UNIT');
    expect(err(() => buildModuleSet([mod('02'), mod('03', { services: { ledger: provider } }), mod('02', { id: '02', services: { ledger: provider } })]))?.code).toBe('MOD_DUP_UNIT');
  });
  it('defineModule: id must start with module; namespace and stream checks pass for valid input; freezes (mutation throws in strict mode)', () => {
    expect(err(() => defineModule(mod('05', { module: '04' })))?.code).toBe('MOD_UNKNOWN_UNIT');
    const m = defineModule(mod('04', { tables: [t], streams: ['macro.fx', 'macro.crisis', 'macro.regime'], events: { 'macro.rate': z.unknown() } }));
    expect(Object.isFrozen(m) && Object.isFrozen(m.tables) && Object.isFrozen(m.streams) && Object.isFrozen(m.events) && Object.isFrozen(m.phases)).toBe(true);
    expect(() => { (m as { id: string }).id = 'x'; }).toThrow(TypeError);
    expect(() => { m.tables.push(t); }).toThrow(TypeError);
    expect(defineModule(mod('14A', { intents: [handler('life.a'), handler('acct.b')] })).id).toBe('14A');
    expect(err(() => defineModule(mod('05', { intents: [handler('mkt.')] })))?.code).toBe('MOD_INTENT_NS');
    expect(err(() => defineModule(mod('04', { streams: ['macro.nope'] })))?.code).toBe('MOD_STREAM_FOREIGN');
    expect(err(() => defineModule(mod('04', { intents: [handler('macro.x')] })))?.code).toBe('MOD_INTENT_NS');   // 04 owns only mkt.sov. / bank.cb. / bank.primaryDealer. (T04-21)
  });
  it('BUILD_UNITS transcribes 19 §12.2 (spot rows), NON_MODULE_UNITS, INTENT_NAMESPACES and NPC_INTENT_KIND', () => {
    expect(BUILD_UNITS['05']).toEqual(['03', '04', '14A', '13A']); expect(BUILD_UNITS['02']).toEqual(['19A', '23', '22A', '20A']);
    expect(BUILD_UNITS['13B']).toEqual(['12', '05', '07B', '08', '13A', '15A']); expect(BUILD_UNITS['08']).toEqual(['06B', '07B', '09A', '10B']);
    expect(BUILD_UNITS['19A']).toEqual([]); expect('01' in BUILD_UNITS || '24' in BUILD_UNITS).toBe(false); expect(Object.keys(BUILD_UNITS)).toHaveLength(38);
    expect(BUILD_UNITS['20B']).toHaveLength(37); expect(Object.isFrozen(BUILD_UNITS)).toBe(true);
    for (const deps of Object.values(BUILD_UNITS)) for (const d of deps) expect(d in BUILD_UNITS).toBe(true);
    expect(NON_MODULE_UNITS).toContain('23'); expect(INTENT_NAMESPACES['14']).toEqual(['life.', 'acct.']); expect(NPC_INTENT_KIND).toBe('npc.intent');
  });
});

describe('T02-11 type-level contract (expectTypeOf)', () => {
  it('PhaseCtx has exactly the G6 members (+ partyIds on emit); ValidateCtx drops emit/send/delta', () => {
    type K = keyof PhaseCtx;
    expectTypeOf<K>().toEqualTypeOf<'tick'|'phase'|'cal'|'header'|'module'|'safeMode'|'store'|'rng'|'newId'|'params'|'content'|'ledger'|'holds'|'emit'|'send'|'inbox'|'delta'|'fail'>();
    expectTypeOf<keyof ValidateCtx>().toEqualTypeOf<Exclude<K, 'emit'|'send'|'delta'>>();
    expectTypeOf<PhaseCtx['params']>().toEqualTypeOf<ParamsView>();   // AC-02-11-PARAMS-PKG: typed by @tycoon/params
    expectTypeOf<PhaseCtx['content']>().toEqualTypeOf<ContentView>();
    expectTypeOf<PhaseCtx['store']>().toEqualTypeOf<Store>();
  });
});

describe('AC-02-11-PARAMS-PKG / E-70 (3)', () => {
  const coreDir = join(__dirname, '..');
  const files = (d: string, out: string[] = []): string[] => { for (const n of readdirSync(d)) { if (n === 'node_modules') continue; const p = join(d, n); if (statSync(p).isDirectory()) files(p, out); else if (n.endsWith('.ts')) out.push(p); } return out; };
  it('no ParamsView is declared in core; core re-exports the @tycoon/params type', () => {
    const decl = files(coreDir).filter((f) => /(interface\s+ParamsView\b|type\s+ParamsView\s*(<[^>]*>)?\s*=|class\s+ParamsView\b)/.test(readFileSync(f, 'utf8')));
    expect(decl).toEqual([]);
    expect(readFileSync(join(coreDir, 'params.ts'), 'utf8')).toContain("export type { ParamsView } from '@tycoon/params';");
  });
  it('zod is imported in core only by the handler-schema files (module/ctx.ts, module/views.ts, module/define.ts, module/registry.ts) and their test', () => {
    const users = files(coreDir).filter((f) => /from\s+['"]zod['"]/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(coreDir.length + 1)).sort();
    expect(users).toEqual(['module/ctx.ts', 'module/define.ts', 'module/registry.test.ts', 'module/registry.ts', 'module/views.ts']);
  });
});

describe('AC-03-MAP-NO-DUP (a) for T02-11 (E-79)', () => {
  const root = join(__dirname, '..', '..', '..', '..');   // the repo root: every package, app and tool, not only packages/engine
  const SKIP = ['node_modules', 'dist', '.git'];
  const files = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) { if (SKIP.includes(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx|mts|cts)$/.test(n)) out.push(p); }
    return out;
  };
  const all = files(root);
  it('the scan covers the whole repo (engine, content and the app sources)', () => {
    const rel = all.map((f) => f.slice(root.length + 1));
    for (const top of ['packages/engine/', 'packages/content/', 'src/']) expect(rel.some((f) => f.startsWith(top)), top).toBe(true);
    expect(rel.some((f) => f.split('/').includes('node_modules'))).toBe(false);
  });
  it.each(['HoldApi', 'Hold', 'Posting', 'PostOpts', 'LedgerApi'])('%s has exactly one definition in the repo (exported or not), in packages/engine/ledger/src; core defines none', (name) => {
    const re = new RegExp(`^[ \\t]*(export[ \\t]+)?(declare[ \\t]+)?(type|interface|function|const|let|class|enum)[ \\t]+${name}(?=[ \\t]*[<={(:]|[ \\t]+extends\\b)`, 'm');   // a declaration, exported or local (not an import specifier)
    const hits = all.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^packages\/engine\/ledger\/src\//);
  });
});

describe('E-81 (i): core never imports the ledger', () => {
  const coreDir = join(__dirname, '..');
  const SKIP = ['node_modules', 'dist'];
  const files = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) { if (SKIP.includes(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx|mts|cts|mjs|cjs|js|json)$/.test(n)) out.push(p); }
    return out;
  };
  // any import / export-from / import() / require / tsconfig path / vitest alias naming the ledger package or a path into packages/engine/ledger,
  // in either quote style (or a template literal)
  const LEDGER = /['"`](@tycoon\/engine-ledger|@avalon\/ledger)(\/[^'"`]*)?['"`]|['"`](\.{1,2}\/)+([^'"`]*\/)?ledger(\/[^'"`]*)?['"`]/;
  it('no file under packages/engine/core names the ledger package or a path into it', () => {
    const hits = files(coreDir).filter((f) => LEDGER.test(readFileSync(f, 'utf8'))).map((f) => f.slice(coreDir.length + 1));
    expect(hits).toEqual([]);
  });
  it('the check sees both quote styles, type-only imports, import() and a relative path', () => {
    const pkg = ['@tycoon', 'engine-' + 'ledger'].join('/');   // built, so this file does not itself name the package
    for (const src of [`import type { LedgerApi } from '${pkg}';`, `import type { Posting } from "${pkg}";`, `type L = import('${pkg}').LedgerApi;`,
      `export type { Hold } from '../../${'led' + 'ger'}/src/types';`, `"${pkg}": ["../${'led' + 'ger'}/src/index.ts"]`])
      expect(LEDGER.test(src), src).toBe(true);
    expect(LEDGER.test("import type { LedgerProvider } from './ledger-port';")).toBe(false);
  });
});
