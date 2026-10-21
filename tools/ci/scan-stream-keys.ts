// T02-06: 02#42 CI scan. Every stream key used by engine code must be in the 02 §3.10.4 registry (packages/engine/core/rng/registry.ts).
// Collects the first argument of `ctx.rng(...)` calls (string literal, or the static head of a template literal such as
// `mkt.idio:${id}` -> 'mkt.idio:') and every `streams: [...]` array of string literals (ModuleDef.streams prefixes).
// AC-02-06-REGISTRY-HELPERS (E-63): stream keys come only from registered template helpers, never concatenated at call sites.
// A helper is a property of an object literal exported as a const from a file named `streams.ts` whose value is an arrow
// function returning a string or template literal; its template (each ${…} replaced by a sample segment) must match a registry
// row. Every ctx.rng(...) argument must be a direct call `<HelperObject>.<helper>(...)` of such a helper. CLI: `npm run ci:streams` (scan-stream-keys-cli.ts).
// QA #36 / E-68: beyond ctx.rng, ANY call argument that is a string literal, template or '+' concatenation building a registered
// key (a literal whose text is a registered key or starts with a registered '<prefix>:'), and any such template / concatenation
// anywhere outside a streams.ts helper body, is reported, e.g. m.stream('04', ['macro.fx'], 'macro.fx:' + b). Literal registered
// keys are rejected too (E-68); each finding carries a hint naming the helper to use. Excluded by path, never by inline
// suppression. E-69 (AC-02-06-REGISTRY-SCOPE): roots packages/engine/ and src/, extensions .ts .tsx .mts .js, and the exclusions
// are an explicit list of exact paths plus *.test.{ts,tsx,mts,js}, all in scan-allowlist.json (printed on every run).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { STREAM_REGISTRY, matchStream, streamPrefix } from '../../packages/engine/core/rng/registry';
import type { StreamSpec } from '../../packages/engine/core/rng/registry';

export interface ScanResult {
  unknown: { file: string; line: number; key: string }[];
  unregisteredPrefixes: { module: string; prefix: string }[];
  /** AC-02-06-REGISTRY-HELPERS (E-63): ctx.rng(...) arguments that are not a call to a registered template helper. */
  callSiteKeys: { file: string; line: number; text: string; hint: string }[];
  /** Helpers (in a `streams.ts`) whose key template does not match a registry row. */
  unregisteredHelpers: { file: string; line: number; helper: string; key: string }[];
}

/** E-69: scan roots, extensions and the exclusion allowlist live in one file (scan-allowlist.json) and are printed on every run. */
export interface ScanAllowlist { roots: string[]; extensions: string[]; paths: string[]; testFileSuffixes: string[] }
export const ALLOWLIST_FILE = join(dirname(fileURLToPath(import.meta.url)), 'scan-allowlist.json');
export function loadAllowlist(file = ALLOWLIST_FILE): ScanAllowlist {
  const { roots, extensions, paths, testFileSuffixes } = JSON.parse(readFileSync(file, 'utf8')) as ScanAllowlist;
  return { roots, extensions, paths, testFileSuffixes };
}
/** The allowlist as printed by the CLI (one line per entry). */
export function formatAllowlist(a: ScanAllowlist): string {
  return [...a.roots.map((r) => `scan root: ${r}`), `scan extensions: ${a.extensions.join(' ')}`,
    ...a.paths.map((p) => `excluded path: ${p}`), ...a.testFileSuffixes.map((x) => `excluded test files: *${x}`)].join('\n');
}
/** Exact-path exclusion: rel equals an entry, or lies under an entry ending in '/'; or ends with a test-file suffix. */
function excluded(rel: string, a: ScanAllowlist): boolean {
  return a.paths.some((p) => (p.endsWith('/') ? `${rel}/`.startsWith(p) : rel === p)) || a.testFileSuffixes.some((x) => rel.endsWith(x));
}

function walk(repoRoot: string, dir: string, a: ScanAllowlist, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name), rel = relative(repoRoot, p).split(sep).join('/');
    if (excluded(rel, a)) continue;
    if (statSync(p).isDirectory()) walk(repoRoot, p, a, out);
    else if (a.extensions.some((x) => name.endsWith(x))) out.push(p);
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
interface Helpers { names: Record<string, Record<string, true>>; hintFor: Record<string, string>; bodies: Set<string> }
function collectHelpers(repoRoot: string, files: string[], res: ScanResult): Helpers {
  const out: Record<string, Record<string, true>> = {}, hintFor: Record<string, string> = {}, bodies = new Set<string>();
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
          names[p.name.text] = true; bodies.add(`${rel}@${body.getStart(src)}`);
          const spec = matchStream(key);
          if (spec && spec.root !== 'HARNESS') hintFor[spec.pattern] ??= `use ${d.name.text}.${p.name.text}(${p.initializer.parameters.map((q) => q.name.getText(src)).join(', ')})`;
          if (!spec || spec.root === 'HARNESS') res.unregisteredHelpers.push({ file: rel, line: src.getLineAndCharacterOfPosition(p.getStart(src)).line + 1, helper: `${d.name.text}.${p.name.text}`, key });
        }
        if (Object.keys(names).length > 0) out[d.name.text] = { ...(out[d.name.text] ?? {}), ...names };
      }
    }
  }
  return { names: out, hintFor, bodies };
}

const LIVE_PREFIXES = [...PREFIXES].sort();
/** The registry row a literal names: a full registered key, or a text starting with a registered '<prefix>:'. */
function rowOfLiteral(text: string): StreamSpec | undefined {
  const full = matchStream(text);
  if (full) return full.root === 'HARNESS' ? undefined : full;
  const pre = LIVE_PREFIXES.find((p) => text.startsWith(`${p}:`));
  return pre === undefined ? undefined : STREAM_REGISTRY.find((r) => r.root !== 'HARNESS' && streamPrefix(r) === pre);
}
/** Registry row built by a literal / template / '+' concatenation expression, if any of its literal parts names one. */
function keyBuiltBy(e: ts.Expression): StreamSpec | undefined {
  if (ts.isParenthesizedExpression(e)) return keyBuiltBy(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return rowOfLiteral(e.text);
  if (ts.isTemplateExpression(e)) return rowOfLiteral(e.head.text);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) return keyBuiltBy(e.left) ?? keyBuiltBy(e.right);
  return undefined;
}
/** The nearest non-parenthesis ancestor. */
const outer = (n: ts.Node): ts.Node => { let p = n.parent; while (ts.isParenthesizedExpression(p)) p = p.parent; return p; };
const isBuilt = (e: ts.Node): boolean => ts.isTemplateExpression(e) || (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken);

export function scanStreamKeys(repoRoot: string, allow: ScanAllowlist = loadAllowlist()): ScanResult {
  const files: string[] = [];
  for (const r of allow.roots) { const d = join(repoRoot, r); if (existsSync(d)) walk(repoRoot, d, allow, files); }
  const res: ScanResult = { unknown: [], unregisteredPrefixes: [], callSiteKeys: [], unregisteredHelpers: [] };
  const { names: helpers, hintFor, bodies } = collectHelpers(repoRoot, files, res);
  const isHelperCall = (a: ts.Expression): boolean => ts.isCallExpression(a) && ts.isPropertyAccessExpression(a.expression)
    && ts.isIdentifier(a.expression.expression) && helpers[a.expression.expression.text]?.[a.expression.name.text] === true;
  const hint = (spec: StreamSpec | undefined): string => (spec === undefined ? 'build the key with a registered streams.ts template helper'
    : hintFor[spec.pattern] ?? `no registered helper builds ${spec.pattern}: add one to a streams.ts`);
  for (const f of files) {
    const rel = relative(repoRoot, f), src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true);
    const line = (n: ts.Node): number => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
    const reported = new Set<ts.Node>();
    const report = (a: ts.Expression, spec: StreamSpec | undefined): void => {
      if (reported.has(a)) return;
      reported.add(a); res.callSiteKeys.push({ file: rel, line: line(a), text: a.getText(src), hint: hint(spec) });
    };
    const visit = (n: ts.Node): void => {
      if (bodies.has(`${rel}@${n.getStart(src)}`) && ts.isExpression(n)) return;   // a registered helper's own template
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'rng'
        && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'ctx' && n.arguments.length > 0) {
        const a = n.arguments[0]!;
        if (!isHelperCall(a)) report(a, keyBuiltBy(a));
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
          const spec = matchStream(a.text);
          if (!spec || spec.root === 'HARNESS') res.unknown.push({ file: rel, line: line(a), key: a.text });
        } else if (ts.isTemplateExpression(a)) {
          if (!headKnown(a.head.text)) res.unknown.push({ file: rel, line: line(a), key: `${a.head.text}\${…}` });
        }
      }
      if (ts.isCallExpression(n)) for (const a of n.arguments) { const spec = keyBuiltBy(a); if (spec) report(a, spec); }   // any stream-taking call
      if (isBuilt(n) && !isBuilt(outer(n))) { const spec = keyBuiltBy(n as ts.Expression); if (spec) report(n as ts.Expression, spec); }
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

/** CLI body: prints the allowlist, the result and one line per finding; returns the exit code (1 on any finding). */
export function runCli(root: string, log: (s: string) => void = console.log, err: (s: string) => void = console.error): number {
  const allow = loadAllowlist();
  err(`ci:streams allowlist (${relative(root, ALLOWLIST_FILE).split(sep).join('/')}):\n${formatAllowlist(allow)}`);
  const r = scanStreamKeys(root, allow);
  log(JSON.stringify(r, null, 2));
  for (const c of r.callSiteKeys) err(`${c.file}:${c.line}: stream key ${c.text} not built by a registered helper (E-68): ${c.hint}`);
  return r.unknown.length + r.unregisteredPrefixes.length + r.callSiteKeys.length + r.unregisteredHelpers.length > 0 ? 1 : 0;
}
