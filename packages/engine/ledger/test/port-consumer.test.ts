// E-81 (i): a consumer that imports @tycoon/engine-ledger gets the port types through the package entry (src/index.ts re-exports
// src/port.ts); a core-only consumer sees `unknown`. Each case is a real tsc program with one root file and the ledger's own compiler options.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

const LEDGER = fileURLToPath(new URL('..', import.meta.url));
const DIR = mkdtempSync(join(tmpdir(), 'ledger-port-'));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function diagnostics(name: string, source: string): string[] {
  const cfgPath = join(LEDGER, 'tsconfig.json');
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, LEDGER, undefined, cfgPath);
  const root = join(DIR, `${name}.ts`);
  writeFileSync(root, source);
  const program = ts.createProgram([root], cfg.options);
  return ts.getPreEmitDiagnostics(program).map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}
const USE = `export const f = (c: PhaseCtx) => [c.ledger.balance, c.holds.placeCash];\n`;

describe('E-81 (i): the port augmentation reaches consumers through the package entry', () => {
  it('importing @tycoon/engine-ledger types ctx.ledger / ctx.holds', () => {
    expect(diagnostics('with', `import type { PhaseCtx } from '@tycoon/engine-core';\nimport type {} from '@tycoon/engine-ledger';\n${USE}`)).toEqual([]);
  }, 60_000);
  it('control: without the ledger, ctx.ledger / ctx.holds are unknown', () => {
    const d = diagnostics('without', `import type { PhaseCtx } from '@tycoon/engine-core';\n${USE}`);
    expect(d.length).toBe(2);
    for (const m of d) expect(m).toMatch(/^TS18046: 'c\.(ledger|holds)' is of type 'unknown'\.$/);
  }, 60_000);
});
