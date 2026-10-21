import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const SRC = join(__dirname, '../../../src/city');

/** Static (non type-only) import specifiers of a module. Dynamic import() is not followed. */
function staticImports(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  for (const st of sf.statements) {
    if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(st) ? st.importClause?.isTypeOnly ?? false : st.isTypeOnly;
      if (!typeOnly) out.push(st.moduleSpecifier.text);
    }
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}

describe('C-04 seam', () => {
  it('src/city/index.ts has no static import of three, directly or transitively', () => {
    const seen = new Set<string>();
    const bare: string[] = [];
    const walk = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const s of staticImports(f)) {
        const local = resolveLocal(f, s);
        if (local) walk(local);
        else bare.push(s);
      }
    };
    walk(join(SRC, 'index.ts'));
    expect(bare.filter((s) => s === 'three' || s.startsWith('three/'))).toEqual([]);
    expect([...seen].map((f) => f.slice(SRC.length))).toEqual(['/index.ts']);
  });
  it('index.ts loads the implementation with a dynamic import, and three is only imported dynamically anywhere', () => {
    expect(readFileSync(join(SRC, 'index.ts'), 'utf8')).toMatch(/await import\('\.\/renderer\/create'\)/);
    const create = readFileSync(join(SRC, 'renderer/create.ts'), 'utf8');
    expect(create).toMatch(/await import\('three'\)/);
    for (const f of ['renderer/create.ts', 'renderer/scene.ts']) {
      expect(staticImports(join(SRC, f)).filter((s) => s === 'three')).toEqual([]);
    }
  });
});
