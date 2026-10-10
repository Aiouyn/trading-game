// The import boundary of the founder view (DECISIONS C6, velvet-company-app 13.2). CompanyFounderView, founderCompanyView
// and ownCompanyView may be named only by the Company app and by the few world files that build the view or carry it to
// its owner. Anything else that names them could show private fields. The check reads every source file with the
// TypeScript compiler API and fails on: a named import or re-export of a forbidden name, any identifier with a forbidden
// name (namespace access `ns.founderCompanyView`, a type query `typeof x`), a namespace or star import or re-export of a
// module that defines the view, and a dynamic import() or require() that names such a module or cannot be resolved.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..', '..', '..');
const FORBIDDEN = new Set(['CompanyFounderView', 'founderCompanyView', 'ownCompanyView']);

/** The files (relative to src/) that define, barrel or carry the founder view. Nothing else in the world layer may name it. */
export const VIEW_BUILDERS = [
  'world/company/views.ts', // defines the views
  'world/company/index.ts', // the world barrel for the company layer
  'world/view.ts', // the transport: PlayerView.company, the owner's own view only (ruling pending, see the report)
];
/** The directory of the Company app: the only screens that may name the founder view. */
const APP_DIR = path.join('components', 'apps', 'company');
/** Test files of the world layer build the views to test them and never ship to a client. */
const WORLD_TEST = /^world[\\/]company[\\/].*\.test\.tsx?$/;
/** The modules that define the founder view (a namespace of one of them exposes it). */
const VIEW_MODULES = new Set(['world/company/views', 'world/company/index', 'world/company']);

export interface Violation { file: string; name: string; line: number }

function relOf(file: string): string {
  return path.relative(SRC, file).split(path.sep).join('/');
}

function isAllowedFile(file: string): boolean {
  const rel = path.relative(SRC, file);
  if (rel.startsWith(APP_DIR + path.sep)) return true;
  if (WORLD_TEST.test(rel)) return true;
  return VIEW_BUILDERS.includes(relOf(file));
}

/** Whether a module specifier, written in `file`, resolves to a module that defines the founder view. */
function namesViewModule(file: string, spec: string): boolean {
  let target: string;
  if (spec.startsWith('@/')) target = spec.slice(2);
  else if (spec.startsWith('.')) target = path.relative(SRC, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
  else return false;
  return VIEW_MODULES.has(target.replace(/\.(ts|tsx)$/, ''));
}

/** The forbidden uses in one source file, with their line numbers. */
export function forbiddenUsesIn(file: string, text: string): Violation[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Violation[] = [];
  const at = (node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const flag = (node: ts.Node, name: string): void => { out.push({ file, name, line: at(node) }); };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings) && namesViewModule(file, node.moduleSpecifier.text)) flag(node, `* as ${bindings.name.text}`);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) && namesViewModule(file, node.moduleSpecifier.text)) {
      if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) flag(node, 'export * from a view module');
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const clause = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
      if (clause && (ts.isNamedImports(clause) || ts.isNamedExports(clause))) {
        for (const el of clause.elements) {
          const imported = el.propertyName?.text ?? el.name.text;
          if (FORBIDDEN.has(imported)) flag(el, imported);
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isImport || isRequire) {
        const arg = node.arguments[0];
        if (!arg || !ts.isStringLiteralLike(arg)) flag(node, `${isImport ? 'import' : 'require'}(<unresolvable>)`);
        else if (namesViewModule(file, arg.text)) flag(node, `${isImport ? 'import' : 'require'}(${arg.text})`);
      }
    }
    if (ts.isIdentifier(node) && FORBIDDEN.has(node.text)) {
      const parent = node.parent;
      // the names inside an import or export clause are counted once, above
      if (!(ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent))) flag(node, node.text);
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
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

describe('founder view import boundary (C6)', () => {
  it('the checker flags a named import, a re-export, namespace access, a type query and a dynamic import', () => {
    const text = [
      "import { CompanyFounderView } from '@/world/company/views';", // 1
      "import { founderCompanyView as f, publicCompanyView } from '@/world/company';", // 2
      "export { ownCompanyView } from '@/world/company/views';", // 3
      "import * as W from '@/world/company';", // 4
      'const g = W.founderCompanyView;', // 5
      'type T = typeof ownCompanyView;', // 6
      "const m = await import('@/world/company/views');", // 7
      'const spec = "x"; const n = import(spec);', // 8
    ].join('\n');
    const hits = forbiddenUsesIn('sample.tsx', text).map((v) => `${v.name}@${v.line}`);
    expect(hits).toEqual([
      'CompanyFounderView@1',
      'founderCompanyView@2',
      'ownCompanyView@3',
      '* as W@4',
      'founderCompanyView@5',
      'ownCompanyView@6',
      'import(@/world/company/views)@7',
      'import(<unresolvable>)@8',
    ]);
  });

  it('a public name from the same module is not a use of the founder view', () => {
    const text = "import { publicCompanyView, type CompanyPublic } from '@/world/company';\nexport const x = publicCompanyView;";
    expect(forbiddenUsesIn('sample.ts', text)).toEqual([]);
  });

  it('no file outside the Company app and the named view builders names the founder view', () => {
    const violations: Violation[] = [];
    for (const file of sourceFiles(SRC)) {
      if (isAllowedFile(file)) continue;
      violations.push(...forbiddenUsesIn(path.relative(SRC, file), readFileSync(file, 'utf8')));
    }
    expect(violations.map((v) => `${v.file}:${v.line} ${v.name}`)).toEqual([]);
  });

  it('the Company app reads the market side only through the public view', () => {
    const pub = readFileSync(path.join(__dirname, 'PublicPanel.tsx'), 'utf8');
    expect(pub).not.toMatch(/CompanyFounderView/);
    expect(pub).toMatch(/CompanyPublic/);
  });
});
