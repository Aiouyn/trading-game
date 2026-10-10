import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Module purity (P2-002, DECISIONS "Module purity", T wm_no_store_import). The import graph
 * reached from the pure modules must not touch React, DOM globals, Next, zustand, or any engine,
 * world, game, content or component code. Only ctx.ts may read rank content (C-09).
 * Checked with the TypeScript compiler API, so dynamic and re-export forms are caught too.
 */

const SHELL_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(SHELL_DIR, '..');
const PURE_ENTRY = ['apps', 'geometry', 'wm', 'layouts', 'route', 'keys', 'launcher', 'toasts'];
/**
 * Which shell modules each pure module may import, type-only imports included (DECISIONS "Module
 * purity": wm.ts imports only apps.ts and geometry.ts; built-in layout plans reach wm through
 * ctx.ts, never by import).
 */
const IMPORT_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  apps: [],
  geometry: ['apps'],
  wm: ['apps', 'geometry'],
  layouts: ['apps', 'geometry'],
  route: ['apps'],
  keys: ['apps', 'wm'],
  launcher: ['apps'],
  toasts: ['apps', 'geometry'],
};
const FORBIDDEN_PACKAGES = ['react', 'react-dom', 'next', 'zustand'];
const FORBIDDEN_SEGMENTS = ['engine', 'world', 'game', 'content', 'components', 'app', 'net', 'server'];
const FORBIDDEN_GLOBALS = ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'performance', 'Date'];

interface Imp {
  /** null for a dynamic import or require whose argument is not a string literal */
  spec: string | null;
  typeOnly: boolean;
}

/** Every import form the TypeScript parser reports for a source text. */
export function importsFromText(file: string, text: string): { imports: Imp[]; globals: string[] } {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
  const imports: Imp[] = [];
  const globals: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        !!clause?.isTypeOnly ||
        (!clause?.name && !!named && ts.isNamedImports(named) && named.elements.every((e) => e.isTypeOnly));
      imports.push({ spec: (node.moduleSpecifier as ts.StringLiteral).text, typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expr = node.moduleReference.expression;
      imports.push({ spec: ts.isStringLiteral(expr) ? expr.text : null, typeOnly: node.isTypeOnly });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const arg = node.arguments[0];
      imports.push({ spec: arg && ts.isStringLiteralLike(arg) ? arg.text : null, typeOnly: false });
    } else if (ts.isIdentifier(node) && FORBIDDEN_GLOBALS.includes(node.text)) {
      globals.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { imports, globals };
}

/** Violations for one file's imports, given the file it lives in. Relative paths must stay in src/shell. */
export function violationsFor(file: string, text: string): string[] {
  const { imports, globals } = importsFromText(file, text);
  const out: string[] = [];
  const name = relative(SRC_DIR, file).split(sep).join('/');
  for (const imp of imports) {
    if (imp.typeOnly) continue;
    if (imp.spec === null) {
      out.push(`${name}: dynamic import with a non-literal path`);
      continue;
    }
    if (imp.spec.startsWith('.')) {
      const target = resolve(dirname(file), imp.spec);
      if (!target.startsWith(SHELL_DIR + sep) && target !== SHELL_DIR) out.push(`${name}: ${imp.spec} leaves src/shell`);
      continue;
    }
    if (FORBIDDEN_PACKAGES.some((p) => imp.spec === p || imp.spec!.startsWith(`${p}/`))) {
      out.push(`${name}: imports ${imp.spec}`);
      continue;
    }
    if (imp.spec.startsWith('@/')) {
      const segs = imp.spec.slice(2).split('/');
      if (segs.some((s) => FORBIDDEN_SEGMENTS.includes(s))) out.push(`${name}: imports ${imp.spec}`);
      continue;
    }
    out.push(`${name}: bare import ${imp.spec}`);
  }
  for (const g of globals) out.push(`${name}: uses the global ${g}`);
  return out;
}

/** Resolves a relative import from a shell module to its file, or null. */
function resolveRel(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(c)) return c;
  return null;
}

/** Walks every module reached from the pure entry points and collects violations. */
function graphViolations(): { violations: string[]; reached: string[] } {
  const seen = new Set<string>();
  const queue = PURE_ENTRY.map((n) => join(SHELL_DIR, `${n}.ts`));
  const violations: string[] = [];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    violations.push(...violationsFor(file, text));
    const { imports } = importsFromText(file, text);
    for (const imp of imports) {
      if (imp.typeOnly || imp.spec === null || !imp.spec.startsWith('.')) continue;
      const target = resolveRel(file, imp.spec);
      if (target !== null && target.startsWith(SHELL_DIR)) queue.push(target);
    }
  }
  return { violations, reached: [...seen].map((f) => relative(SHELL_DIR, f).split(sep).join('/')).sort() };
}

describe('shell module isolation', () => {
  it('the pure modules reach no React, DOM, Next, zustand, engine, world, game or content code', () => {
    const { violations } = graphViolations();
    expect(violations).toEqual([]);
  });

  it('the walk really covers the pure modules and what they import', () => {
    const { reached } = graphViolations();
    expect(reached).toEqual(expect.arrayContaining(['apps.ts', 'geometry.ts', 'layouts.ts', 'route.ts', 'wm.ts', 'keys.ts']));
    expect(reached).not.toContain('ctx.ts');
    expect(reached).not.toContain('prefs.ts');
    expect(reached).not.toContain('store.ts');
  });

  it('every pure module imports only its allowed shell modules, type-only imports included', () => {
    const offenders: string[] = [];
    for (const mod of Object.keys(IMPORT_ALLOWLIST)) {
      const file = join(SHELL_DIR, `${mod}.ts`);
      const { imports } = importsFromText(file, readFileSync(file, 'utf8'));
      for (const imp of imports) {
        if (imp.spec === null) {
          offenders.push(`${mod}: non-literal import`);
          continue;
        }
        const target = imp.spec.startsWith('./') ? imp.spec.slice(2) : null;
        if (target === null || !IMPORT_ALLOWLIST[mod]!.includes(target)) offenders.push(`${mod}: ${imp.spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the allowlist check catches wm importing layouts, even as a type', () => {
    const src = "import type { Placement } from './layouts';\nimport { x } from './ctx';";
    const { imports } = importsFromText('wm.ts', src);
    const bad = imports.map((i) => i.spec).filter((spec) => spec !== null && !IMPORT_ALLOWLIST.wm!.includes(spec.slice(2)));
    expect(bad).toEqual(['./layouts', './ctx']);
  });

  it('the detector flags every import form it is meant to catch', () => {
    const file = join(SHELL_DIR, 'probe.ts');
    expect(violationsFor(file, "import React from 'react';")).not.toEqual([]);
    expect(violationsFor(file, "import { x } from '@/engine/trading';")).not.toEqual([]);
    expect(violationsFor(file, "export * from '../world/players';")).not.toEqual([]);
    expect(violationsFor(file, "export { a } from '@/game/store';")).not.toEqual([]);
    expect(violationsFor(file, "const m = await import('@/engine/' + name);")).not.toEqual([]);
    expect(violationsFor(file, "const m = require('@/engine/x');")).not.toEqual([]);
    expect(violationsFor(file, "import fs = require('../game/store');")).not.toEqual([]);
    expect(violationsFor(file, "const d = new Date();")).not.toEqual([]);
    expect(violationsFor(file, "import type { X } from '@/engine/types';")).toEqual([]);
    expect(violationsFor(file, "import { type X } from '@/world/x';")).toEqual([]);
    expect(violationsFor(file, "import { type X, helper } from './apps';")).toEqual([]);
  });
});
