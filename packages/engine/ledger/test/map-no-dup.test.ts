// AC-03-MAP-NO-DUP (errata E-79) for the T03-01 symbols.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LEDGER = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(LEDGER, '../../..');
/** AC (a) grep scope: the engine packages (src/city and the legacy src/engine app define unrelated EntityKind/Account types). */
const SCAN = join(REPO, 'packages');
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir).sort()) {
    if (n === 'node_modules' || n === '.git' || n === 'dist') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (/\.(ts|tsx|mts)$/.test(n) && !n.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const FILES = tsFiles(SCAN).map((p) => ({ rel: relative(REPO, p), text: readFileSync(p, 'utf8') }));
const defs = (name: string): string[] =>
  FILES.filter((f) => new RegExp(`export (declare )?(type|interface|function|const|class|enum) ${name}\\b`).test(f.text)).map((f) => f.rel);

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
  LEDGER_EVENTS: 'events.ts', LedgerEventKind: 'events.ts', LEDGER_EVENT_VISIBILITY: 'events.ts',
};
/** Card names E-79 replaces with a V3 name, and symbols E-79 says are not built: zero definitions. */
const NOT_DEFINED = ['ENTITY_KIND_ORDER', 'CashFlowClass', 'ReasonCodeDef', 'getCatalog', 'catalogErrors', 'TBL', 'entityTable', 'accountTable',
  'entryTable', 'holdTable', 'factTable'];

describe('AC-03-MAP-NO-DUP', () => {
  it('scans the repo', () => expect(FILES.length).toBeGreaterThan(100));
  it('(a) every T03-01 symbol has exactly one exported definition, in its E-79 file', () => {
    for (const [name, file] of Object.entries(MAPPED)) expect(defs(name), name).toEqual([`packages/engine/ledger/src/${file}`]);
    // BlocCode already exists in core (T02-01 calendar); ledger types.ts re-exports it instead of a second definition.
    expect(defs('BlocCode')).toEqual(['packages/engine/core/calendar/holidays.ts']);
    expect(FILES.find((f) => f.rel === 'packages/engine/ledger/src/types.ts')?.text).toMatch(/export type \{ BlocCode \};/);
  });
  // OPEN (Systems): packages/engine/macro/ids.ts (T04-01, on main) also exports cbkId and govId.
  it('(a) cbkId and govId have one exported definition', () => {
    for (const name of ['cbkId', 'govId']) expect(defs(name), name).toEqual(['packages/engine/ledger/src/accounts.ts']);
  });
  it('(a)/(d) replaced card names, getCatalog and the deferred tables have no definition', () => {
    for (const name of NOT_DEFINED) expect(defs(name), name).toEqual([]);
  });
  it('(b) ledger code imports only ledger/src, core and allowed packages', () => {
    const ledger = FILES.filter((f) => f.rel.startsWith('packages/engine/ledger/'));
    expect(ledger.length).toBeGreaterThan(20);
    for (const f of ledger) {
      for (const m of f.text.matchAll(/\bfrom '([^']+)'/g)) {
        const spec = m[1];
        const ok = spec.startsWith('.') ? !/\/(state|rules|catalog|invariants)\/|schema$/.test(spec)
          : ['zod', '@tycoon/engine-core', 'vitest', 'vitest/config', 'fast-check', 'typescript-eslint', 'eslint'].includes(spec) || spec.startsWith('node:');
        expect(ok, `${f.rel}: ${spec}`).toBe(true);
      }
    }
  });
  it('(c) no ledger/{state,rules,catalog,invariants} dir and no ledger/schema.ts', () => {
    for (const d of ['state', 'rules', 'catalog', 'invariants', 'schema.ts']) expect(existsSync(join(LEDGER, d)), d).toBe(false);
  });
});
