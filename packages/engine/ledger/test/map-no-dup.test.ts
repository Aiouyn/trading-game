// AC-03-MAP-NO-DUP (errata E-79) for the T03-01 symbols.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LEDGER = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(LEDGER, '../../..');
/** AC (a) grep scope: the whole repo (every package, app, tool and export dir), .d.ts included; only node_modules and .git are skipped. */
const SCAN = REPO;
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir).sort()) {
    if (n.startsWith('node_modules') || n === '.git') continue;   // node_modules (and a parked node_modules.off copy)
    const p = join(dir, n);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(n)) out.push(p);
  }
  return out;
}
/** This file quotes the patterns it greps for, so it is not part of its own scan. */
const SELF = fileURLToPath(import.meta.url);
const FILES = tsFiles(SCAN).filter((p) => p !== SELF).map((p) => ({ rel: relative(REPO, p), text: readFileSync(p, 'utf8') }));
/** The text with import / export specifier lists (`import { type X }`, `export type { X }`, `export { X } from`) and `import type X` removed:
 *  naming a symbol there is not a definition. */
const declText = (t: string): string => t.replace(/\b(import|export)\s+(type\s+)?\{[^}]*\}/g, '').replace(/\bimport\s+type\s+[\w$]+/g, '');
/** Every module specifier in `text`, in either quote style: `from '…'`, `import('…')`, side-effect `import '…'`. */
const specs = (text: string): string[] =>
  [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"\s]+)\1/gm)].map((m) => m[2]);
/** A relative specifier resolved from file `rel` (repo-relative), or undefined for a package specifier. */
const target = (rel: string, spec: string): string | undefined => (spec.startsWith('.') ? resolve(dirname(join(REPO, rel)), spec) : undefined);
const DECL = FILES.map((f) => ({ rel: f.rel, text: declText(f.text) }));
/** Every definition of `name`: exported or not, ambient (`declare`) or not, anywhere on a line (`type A = 1; type B = 2;`), one entry per
 *  declaration (two in one file count twice). */
const defs = (name: string): string[] => DECL.flatMap((f) => [...f.text.matchAll(new RegExp(
  `(?<![\\w$.'"\`])(type|interface|function\\*?|const|let|var|class|enum|namespace)\\s+${name}(?![\\w$'"\`])`, 'g'))]
  .map(() => f.rel));
/** The only definitions outside the engine with a T03-01 name: the legacy app's own, unrelated types (src/city, src/engine). Each must still
 *  exist, so the list cannot go stale; nothing else is exempt. */
const LEGACY: Record<string, string[]> = {
  EntityKind: ['src/city/data/types.ts'], Ccy: ['src/city/data/types.ts'], Account: ['engine-staging/src/engine/types.ts', 'src/engine/types.ts'],
  // not exported: the shell's own navigation-stack entry (`type Entry = PhoneEntry | DeskEntry`), found once non-exported definitions count
  Entry: ['src/shell/back.ts'],
};
/** defs(name) less each legacy exemption, once: a second definition in an exempt file still counts. */
const engineDefs = (name: string): string[] => {
  const out = defs(name);
  for (const r of LEGACY[name] ?? []) { const i = out.indexOf(r); if (i >= 0) out.splice(i, 1); }
  return out;
};

/** T03-01 rows of the E-79 table, by their V3 name, and the file each must live in. */
const MAPPED: Record<string, string> = {
  EntityKind: 'types.ts', ENTITY_KINDS: 'types.ts', Perimeter: 'types.ts', PayAccountChoice: 'types.ts', LedgerEntity: 'types.ts',
  EntityStatus: 'types.ts', Jurisdiction: 'types.ts', CashFlow: 'catalog.ts', TaxTag: 'types.ts', TaxType: 'types.ts',
  ClaimRank: 'types.ts', MarkSource: 'types.ts', Mark: 'types.ts', LedgerFact: 'types.ts', LedgerFactKind: 'types.ts', AccountClass: 'accounts.ts',
  Account: 'types.ts', Posting: 'types.ts', Entry: 'types.ts', Hold: 'types.ts', FlowClass: 'catalog.ts', TemplateId: 'catalog.ts', CodeRow: 'catalog.ts',
  chartEntry: 'accounts.ts', CHART: 'accounts.ts', ChartEntry: 'accounts.ts', kindMayUse: 'accounts.ts', MARKETABLE_CODES: 'accounts.ts',
  classOfCode: 'accounts.ts', isMoneyCode: 'accounts.ts', accountKey: 'accounts.ts', entityOfKey: 'accounts.ts', parseAccountKey: 'accounts.ts',
  SYS_ID: 'accounts.ts', kindOfId: 'accounts.ts', frmId: 'accounts.ts', hhId: 'accounts.ts',
  ROW_ID: 'accounts.ts', CCP_ID: 'accounts.ts', SERENA_AUTHORITY_GOV: 'accounts.ts', suspenseSub: 'accounts.ts',
  LEDGER_EVENTS: 'events.ts', LedgerEventKind: 'events.ts', LEDGER_EVENT_VISIBILITY: 'events.ts', Levers: 'events.ts',
  MoneySupplyReport: 'events.ts', emitLedger: 'events.ts',
};
/** Card names E-79 replaces with a V3 name, and symbols E-79 says are not built: zero definitions. */
const NOT_DEFINED = ['ENTITY_KIND_ORDER', 'CashFlowClass', 'ReasonCodeDef', 'getCatalog', 'catalogErrors', 'TBL', 'entityTable', 'accountTable',
  'entryTable', 'holdTable', 'factTable'];

describe('AC-03-MAP-NO-DUP', () => {
  it('scans the whole repo: every top-level dir, .d.ts included, node_modules excluded', () => {
    expect(FILES.length).toBeGreaterThan(300);
    for (const top of ['packages/engine/', 'packages/content/', 'src/city/', 'src/engine/', 'src/shell/', 'engine-staging/', 'tools/'])
      expect(FILES.some((f) => f.rel.startsWith(top)), top).toBe(true);
    expect(FILES.some((f) => f.rel.split('/').some((s) => s.startsWith('node_modules')))).toBe(false);
  });
  it('the legacy exemptions still exist (the list cannot go stale) and are the only non-engine definitions it exempts', () => {
    for (const [name, rels] of Object.entries(LEGACY)) for (const r of rels) expect(defs(name), `${name} in ${r}`).toContain(r);
    expect(Object.values(LEGACY).flat().every((r) => !r.startsWith('packages/'))).toBe(true);
  });
  it('(a) every T03-01 symbol has exactly one definition in the repo (exported or not, .d.ts included), in its E-79 file', () => {
    for (const [name, file] of Object.entries(MAPPED)) expect(engineDefs(name), name).toEqual([`packages/engine/ledger/src/${file}`]);
    // BlocCode already exists in core (T02-01 calendar); ledger types.ts re-exports it instead of a second definition.
    expect(defs('BlocCode')).toEqual(['packages/engine/core/calendar/holidays.ts']);
    expect(FILES.find((f) => f.rel === 'packages/engine/ledger/src/types.ts')?.text).toMatch(/export type \{ BlocCode \};/);
    // E-81 (iv): Ccy and Id are core's; ledger money.ts re-exports them.
    for (const name of ['Ccy', 'Id']) expect(engineDefs(name), name).toEqual(['packages/engine/core/types.ts']);
    expect(FILES.find((f) => f.rel === 'packages/engine/ledger/src/money.ts')?.text).toMatch(/export type \{ Ccy, Id \};/);
  });
  it('(a) cbkId and govId have one definition in the repo', () => {
    for (const name of ['cbkId', 'govId']) expect(defs(name), name).toEqual(['packages/engine/ledger/src/accounts.ts']);
  });
  it('(a)/(d) replaced card names, getCatalog and the deferred tables have no definition', () => {
    for (const name of NOT_DEFINED) expect(defs(name), name).toEqual([]);
  });
  it('(b) ledger code imports only ledger/src, core and allowed packages', () => {
    const ledger = FILES.filter((f) => f.rel.startsWith('packages/engine/ledger/'));
    expect(ledger.length).toBeGreaterThan(20);
    for (const f of ledger) {
      for (const spec of specs(f.text)) {
        const to = target(f.rel, spec);   // a relative import must stay inside packages/engine/ledger
        const ok = to !== undefined ? (to + sep).startsWith(LEDGER) && !/\/(state|rules|catalog|invariants)\/|schema$/.test(spec)
          : ['zod', '@tycoon/engine-core', 'vitest', 'vitest/config', 'fast-check', 'typescript-eslint', 'eslint'].includes(spec) || spec.startsWith('node:');
        expect(ok, `${f.rel}: ${spec}`).toBe(true);
      }
    }
  });
  it('(c) no ledger/{state,rules,catalog,invariants} dir and no ledger/schema.ts', () => {
    for (const d of ['state', 'rules', 'catalog', 'invariants', 'schema.ts']) expect(existsSync(join(LEDGER, d)), d).toBe(false);
  });
});

describe('AC-04-01-IDS-FROM-LEDGER (E-81 (i))', () => {
  it('export const cbkId / govId: exactly one hit each, in ledger src/accounts.ts', () => {
    for (const name of ['cbkId', 'govId']) {
      const hits = FILES.filter((f) => new RegExp(`export const ${name}\\b`).test(f.text)).map((f) => f.rel);
      expect(hits, name).toEqual(['packages/engine/ledger/src/accounts.ts']);
    }
  });
  it('macro/ids.ts imports cbkId and govId from @tycoon/engine-ledger and does not re-export them', () => {
    const ids = FILES.find((f) => f.rel === 'packages/engine/macro/ids.ts')!.text;
    expect(ids).toMatch(/import \{ cbkId, govId \} from '@tycoon\/engine-ledger';/);
    expect(ids).not.toMatch(/export \{[^}]*\b(cbkId|govId)\b/);
  });
  it('no file under packages/engine/ledger imports @tycoon/engine-macro', () => {
    const ledger = FILES.filter((f) => f.rel.startsWith('packages/engine/ledger/'));
    expect(ledger.length).toBeGreaterThan(20);
    for (const f of ledger) {
      for (const spec of specs(f.text)) {
        const to = target(f.rel, spec);
        const macro = to !== undefined ? (to + sep).startsWith(join(REPO, 'packages/engine/macro') + sep) : /^@tycoon\/engine-macro(\/|$)/.test(spec);
        expect(macro, `${f.rel}: ${spec}`).toBe(false);
      }
    }
  });
  it('specs() sees both quote styles, import() and side-effect imports; target() resolves relative ones', () => {
    expect(specs(`import type {} from "../../macro/ids";\nexport const f = () => import('../../macro/ids');\nimport 'x';\nimport { a } from '@tycoon/engine-macro';`))
      .toEqual(['../../macro/ids', '../../macro/ids', 'x', '@tycoon/engine-macro']);
    expect(target('packages/engine/ledger/src/accounts.ts', '../../macro/ids')).toBe(join(REPO, 'packages/engine/macro/ids'));
    expect(target('packages/engine/ledger/src/accounts.ts', '@tycoon/engine-macro')).toBeUndefined();
  });
  it('the ledger package is @tycoon/engine-ledger', () => {
    expect(JSON.parse(readFileSync(join(LEDGER, 'package.json'), 'utf8')).name).toBe('@tycoon/engine-ledger');
  });
});

describe('AC-03-01-VIS-FIXED (b) (E-81 (iii))', () => {
  it('only src/events.ts calls ctx.emit(, and emitLedger has no visibility parameter', () => {
    const callers = FILES.filter((f) => f.rel.startsWith('packages/engine/ledger/') && !f.rel.includes('/test/') && /\bctx\.emit\(/.test(f.text)).map((f) => f.rel);
    expect(callers).toEqual(['packages/engine/ledger/src/events.ts']);
    const ev = FILES.find((f) => f.rel === 'packages/engine/ledger/src/events.ts')!.text;
    const sig = /export function emitLedger<[^>]*>\((.*)\): void \{/.exec(ev)?.[1] ?? '';
    expect(sig.split(',').map((p) => p.trim().split(':')[0])).toEqual(['ctx', 'kind', 'subjectIds', 'payload', 'partyIds?']);
    expect(sig).not.toMatch(/visibility|Visibility/);
  });
});
