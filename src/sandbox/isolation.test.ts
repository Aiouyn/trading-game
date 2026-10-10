import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { createGame, stepGame } from '@/world/game';
import { universeConfig } from '@/engine';
import { useGame } from '@/game/store';
import { Sandbox } from './sandbox';
import { exportRun, importRun, serializeRun } from './runfile';

/**
 * Isolation (the sandbox may not reach the server, net worth, rank, boards, the Wire or the live store).
 * Checked by parsing the source with the TypeScript compiler, not by string search.
 */

const SANDBOX_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(SANDBOX_DIR, '..', '..');

/** the only modules the sandbox may import: the bundled engine, and its own files */
const ALLOWED_PACKAGE_IMPORTS = ['@/engine'];

/** browser and network globals the sandbox must never touch */
const FORBIDDEN_IDENTIFIERS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB',
  'caches', 'navigator',
];

/** live modules that must not import the sandbox (the server, the net layer, the live world, the live store) */
const LIVE_DIRS = ['src/net', 'src/world', 'src/game', 'server'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** every module specifier a file names, read from the syntax tree (static imports, re-exports, import(), require()) */
function specifiersOf(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      out.push((node.moduleReference.expression as ts.StringLiteral).text);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamic = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      const arg = node.arguments[0];
      if ((isDynamic || isRequire) && arg && ts.isStringLiteralLike(arg)) out.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

/** every identifier name in a file, including property names (so `window.fetch` is caught) */
function identifiersOf(file: string): Set<string> {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(src);
  return names;
}

function isTest(file: string): boolean {
  return /\.test\.tsx?$/.test(file);
}

/** does a specifier, written in `from`, resolve into the sandbox directory? */
function entersSandbox(from: string, spec: string): boolean {
  if (spec === '@/sandbox' || spec.startsWith('@/sandbox/')) return true;
  if (spec.startsWith('.')) {
    const target = resolve(dirname(from), spec);
    return target === SANDBOX_DIR || target.startsWith(SANDBOX_DIR + sep);
  }
  return false;
}

describe('isolation: the sandbox imports only the engine and itself', () => {
  const files = walk(SANDBOX_DIR).filter((f) => !isTest(f));

  it('scans the sandbox source', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${relative(ROOT, file)} imports only allowed modules`, () => {
      for (const spec of specifiersOf(file)) {
        if (spec.startsWith('.')) {
          const target = resolve(dirname(file), spec);
          expect(target === SANDBOX_DIR || target.startsWith(SANDBOX_DIR + sep), `${spec} leaves the sandbox`).toBe(true);
        } else {
          expect(ALLOWED_PACKAGE_IMPORTS.some((ok) => spec === ok || spec.startsWith(`${ok}/`)), `import of ${spec}`).toBe(true);
        }
      }
    });

    it(`${relative(ROOT, file)} touches no network or browser storage`, () => {
      const ids = identifiersOf(file);
      for (const bad of FORBIDDEN_IDENTIFIERS) expect(ids.has(bad), bad).toBe(false);
    });
  }
});

describe('isolation: live modules never import the sandbox', () => {
  const liveFiles = LIVE_DIRS.flatMap((d) => walk(resolve(ROOT, d))).filter((f) => !isTest(f));

  it('scans the live modules', () => {
    expect(liveFiles.length).toBeGreaterThan(10);
  });

  it('no net, world, game store or server file enters src/sandbox', () => {
    const offenders = liveFiles.filter((f) => specifiersOf(f).some((s) => entersSandbox(f, s)));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe('isolation: a sandbox run leaves the live world and the live store untouched', () => {
  it('the live server world, the live store and the engine config are byte-identical after a sandbox session', () => {
    const live = createGame('isolation-live-seed', { warmupDays: 0 });
    for (let i = 0; i < 30; i++) stepGame(live);
    const liveBefore = JSON.stringify(live);
    const storeBefore = JSON.stringify(useGame.getState());
    const configBefore = JSON.stringify(universeConfig());

    const sb = Sandbox.create({ kind: 'practice', id: 'iso' });
    sb.step(720);
    sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } });
    sb.step(720);
    const text = serializeRun(exportRun(sb));
    importRun(text).step(10);
    const scen = Sandbox.create({ kind: 'scenario', scenarioId: 'flash' });
    scen.step(720);

    expect(JSON.stringify(live)).toBe(liveBefore);
    expect(JSON.stringify(useGame.getState())).toBe(storeBefore);
    expect(JSON.stringify(universeConfig())).toBe(configBefore);
  }, 120_000);

  it('a sandbox never sees a live account: its only account is the practice account', () => {
    const sb = Sandbox.create({ kind: 'practice', id: 'alone' });
    sb.step(10);
    const ids = new Set(sb.listAssets().map((a) => a.id));
    expect(ids.has('GOLD')).toBe(true);
    expect(Object.keys(sb.view().portfolio)).toContain('playerId');
    expect(sb.view().portfolio.playerId).toBe('practice');
  });
});
