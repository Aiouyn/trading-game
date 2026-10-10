// The import boundary of the founder view (DECISIONS C6, velvet-company-app 13.2): CompanyFounderView and the founder
// selectors are imported only by the world layer (which builds the view for its owner) and by the Company app. Any
// other screen that names them would be able to show private fields, so the check reads every source file with the
// TypeScript compiler API and fails on a named import (or re-export) of a forbidden name from anywhere else.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..', '..', '..');
/** Directories under src/ that may name the founder view: the world layer that builds it, and the Company app. */
const ALLOWED = ['world', path.join('components', 'apps', 'company')];
const FORBIDDEN = new Set(['CompanyFounderView', 'founderCompanyView', 'ownCompanyView']);

export interface Violation { file: string; name: string; line: number }

/** The forbidden names a source file imports or re-exports by name, with their line numbers. */
export function forbiddenNamesIn(file: string, text: string): Violation[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Violation[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
      const clause = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
      if (clause && (ts.isNamedImports(clause) || ts.isNamedExports(clause))) {
        for (const el of clause.elements) {
          const imported = el.propertyName?.text ?? el.name.text;
          if (FORBIDDEN.has(imported)) out.push({ file, name: imported, line: sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function isAllowed(file: string): boolean {
  const rel = path.relative(SRC, file);
  return ALLOWED.some((root) => rel === root || rel.startsWith(root + path.sep));
}

describe('founder view import boundary (C6)', () => {
  it('the checker flags a named import and a re-export of a forbidden name', () => {
    const text = [
      "import { CompanyFounderView } from '@/world/company/views';",
      "import { founderCompanyView as f, publicCompanyView } from '@/world/company';",
      "export { ownCompanyView } from '@/world/company/views';",
    ].join('\n');
    const hits = forbiddenNamesIn('sample.tsx', text).map((v) => `${v.name}@${v.line}`);
    expect(hits).toEqual(['CompanyFounderView@1', 'founderCompanyView@2', 'ownCompanyView@3']);
  });

  it('no screen outside the world layer and the Company app imports the founder view', () => {
    const violations: Violation[] = [];
    for (const file of sourceFiles(SRC)) {
      if (isAllowed(file) || file.endsWith('.d.ts')) continue;
      violations.push(...forbiddenNamesIn(path.relative(SRC, file), readFileSync(file, 'utf8')));
    }
    expect(violations.map((v) => `${v.file}:${v.line} ${v.name}`)).toEqual([]);
  });

  it('the Company app reads the market side only through marketOf', () => {
    const pub = readFileSync(path.join(__dirname, 'PublicPanel.tsx'), 'utf8');
    expect(pub).not.toMatch(/CompanyFounderView/);
    expect(pub).toMatch(/CompanyPublic/);
  });
});
