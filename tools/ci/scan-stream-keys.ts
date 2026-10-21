// T02-06: 02#42 CI scan. Every stream key used by engine code must be in the 02 §3.10.4 registry (packages/engine/core/rng/registry.ts).
// Collects the first argument of `ctx.rng(...)` calls (string literal, or the static head of a template literal such as
// `mkt.idio:${id}` -> 'mkt.idio:') and every `streams: [...]` array of string literals (ModuleDef.streams prefixes).
// AC-02-06-REGISTRY-HELPERS (E-63): stream keys come only from registered template helpers, never concatenated at call sites.
// A helper is a property of an object literal exported as a const from a file named `streams.ts` whose value is an arrow
// function returning a string or template literal; its template (each ${…} replaced by a sample segment) must match a registry
// row. Every ctx.rng(...) argument must be a direct call `<HelperObject>.<helper>(...)` of such a helper. CLI: `pnpm ci:streams`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { STREAM_REGISTRY, matchStream, streamPrefix } from '../../packages/engine/core/rng/registry';

export interface ScanResult {
  unknown: { file: string; line: number; key: string }[];
  unregisteredPrefixes: { module: string; prefix: string }[];
  /** AC-02-06-REGISTRY-HELPERS (E-63): ctx.rng(...) arguments that are not a call to a registered template helper. */
  callSiteKeys: { file: string; line: number; text: string }[];
  /** Helpers (in a `streams.ts`) whose key template does not match a registry row. */
  unregisteredHelpers: { file: string; line: number; helper: string; key: string }[];
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === '__lint_fixtures__' || name === 'test') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
}

/** Static head of a pattern ('mkt.idio:' for 'mkt.idio:<assetId>'; the whole pattern when it has no placeholder). */
const patternHead = (p: string): string => { const i = p.indexOf('<'); return i < 0 ? p : p.slice(0, i); };
/** A template head is known when it is exactly some pattern's static head, or a full static key plus ':'-bounded prefix of one. */
function headKnown(head: string): boolean {
  return STREAM_REGISTRY.some((s) => s.root !== 'HARNESS' && head.length > 0 && patternHead(s.pattern).startsWith(head) && (head.endsWith(':') || head === patternHead(s.pattern)));
}
const PREFIXES = new Set(STREAM_REGISTRY.filter((s) => s.root !== 'HARNESS').map(streamPrefix));

/** Module id for a `streams:` array: a sibling `id`/`module` string property of the same object literal, else the file path. */
function moduleOf(obj: ts.Node, file: string): string {
  if (ts.isObjectLiteralExpression(obj)) {
    for (const p of obj.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && (p.name.text === 'id' || p.name.text === 'module') && ts.isStringLiteralLike(p.initializer)) return p.initializer.text;
    }
  }
  return file;
}

const SAMPLE = 'x0';
/** The key a helper's returned literal produces with every substitution replaced by a sample segment. */
function sampleKey(e: ts.Expression): string | null {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isTemplateExpression(e)) return e.head.text + e.templateSpans.map((sp) => SAMPLE + sp.literal.text).join('');
  return null;
}

/** Registered helper objects: exported const <Name> = Object.freeze({...}) or {...} in any streams.ts. */
function collectHelpers(repoRoot: string, files: string[], res: ScanResult): Record<string, Record<string, true>> {
  const out: Record<string, Record<string, true>> = {};
  for (const f of files) {
    if (!f.endsWith('/streams.ts')) continue;
    const rel = relative(repoRoot, f), src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true);
    for (const st of src.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        let init: ts.Expression = d.initializer;
        if (ts.isCallExpression(init) && init.arguments.length === 1) init = init.arguments[0]!;   // Object.freeze({...})
        if (!ts.isObjectLiteralExpression(init)) continue;
        const names: Record<string, true> = {};
        for (const p of init.properties) {
          if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) || !ts.isArrowFunction(p.initializer)) continue;
          const body = p.initializer.body, key = ts.isExpression(body) ? sampleKey(body) : null;
          if (key === null) continue;
          names[p.name.text] = true;
          const spec = matchStream(key);
          if (!spec || spec.root === 'HARNESS') res.unregisteredHelpers.push({ file: rel, line: src.getLineAndCharacterOfPosition(p.getStart(src)).line + 1, helper: `${d.name.text}.${p.name.text}`, key });
        }
        if (Object.keys(names).length > 0) out[d.name.text] = { ...(out[d.name.text] ?? {}), ...names };
      }
    }
  }
  return out;
}

export function scanStreamKeys(repoRoot: string): ScanResult {
  const files: string[] = [];
  walk(join(repoRoot, 'packages/engine'), files);
  const res: ScanResult = { unknown: [], unregisteredPrefixes: [], callSiteKeys: [], unregisteredHelpers: [] };
  const helpers = collectHelpers(repoRoot, files, res);
  const isHelperCall = (a: ts.Expression): boolean => ts.isCallExpression(a) && ts.isPropertyAccessExpression(a.expression)
    && ts.isIdentifier(a.expression.expression) && helpers[a.expression.expression.text]?.[a.expression.name.text] === true;
  for (const f of files) {
    const rel = relative(repoRoot, f), src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true);
    const line = (n: ts.Node): number => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'rng'
        && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'ctx' && n.arguments.length > 0) {
        const a = n.arguments[0]!;
        if (!isHelperCall(a)) res.callSiteKeys.push({ file: rel, line: line(a), text: a.getText(src) });
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
          const spec = matchStream(a.text);
          if (!spec || spec.root === 'HARNESS') res.unknown.push({ file: rel, line: line(a), key: a.text });
        } else if (ts.isTemplateExpression(a)) {
          if (!headKnown(a.head.text)) res.unknown.push({ file: rel, line: line(a), key: `${a.head.text}\${…}` });
        }
      }
      if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'streams' && ts.isArrayLiteralExpression(n.initializer)) {
        for (const e of n.initializer.elements) {
          if (ts.isStringLiteralLike(e) && !PREFIXES.has(e.text)) res.unregisteredPrefixes.push({ module: moduleOf(n.parent, rel), prefix: e.text });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
  const r = scanStreamKeys(root);
  console.log(JSON.stringify(r, null, 2));
  if (r.unknown.length + r.unregisteredPrefixes.length + r.callSiteKeys.length + r.unregisteredHelpers.length > 0) process.exit(1);
}
