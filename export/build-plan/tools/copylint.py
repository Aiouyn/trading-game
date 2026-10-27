#!/usr/bin/env python3
"""copylint (E-66): flag hard-coded player-visible literals in .tsx so copy goes through strings.ts.

Usage:
  copylint.py [--ui ROOT] [--allow FILE] [--ts PATH] [--timeout-file S] [--timeout-total S] [PATH|GLOB ...]
  copylint.py --self-test
Flags: JSX text children containing a letter; string/template literals (incl. conditional branches)
in player-visible props (title, aria-label, placeholder, alt, label, tooltip, children, ... and any
prop ending in Label/Text/Title/Message/Hint/Placeholder/Tooltip/Caption/Description/Heading).
Skips: dev-only routes (allowlist exclude_globs, e.g. /__ds), whitespace, numbers/symbols/punctuation (no letter), className/style/data-*/id/key/testid/href/
type/role/... props, imports, strings.ts, *.test.tsx/*.spec.tsx/*.stories.tsx, __tests__/, e2e/,
allowlisted brand tokens, and lines carrying (or preceded by a line carrying)
`// copylint-ignore: <reason>` (a reason is required).
Contract (same as tonelint): stdin never read; per-file and total timeouts; exit 0 clean, 1 hits,
2 error (missing file, empty glob, no inputs, bad allowlist, parser missing, timeout); coverage printed.
Parser: the TypeScript compiler API via node (default: first typescript found under ROOT/node_modules,
/workspace/trading-game/node_modules, /workspace/avalon/front-dev/node_modules).
"""
import argparse, glob, json, os, subprocess, sys, tempfile, time, re

HERE = os.path.dirname(os.path.realpath(__file__))
ALLOW_DEFAULT = os.path.join(HERE, 'copylint-allow.json')
TS_CANDIDATES = ['/workspace/trading-game/node_modules/typescript', '/workspace/avalon/front-dev/node_modules/typescript']
SKIP_RE = re.compile(r'(\.(test|spec|stories)\.tsx$)|(/__tests__/)|(/e2e/)|(/strings\.tsx?$)')

JS = r'''
const ts = require(process.argv[2]); const fs = require('fs');
const files = JSON.parse(fs.readFileSync(0 === 1 ? '' : process.argv[3], 'utf8'));
const VIS = new Set(['title','aria-label','aria-description','aria-placeholder','aria-roledescription','aria-valuetext',
  'placeholder','alt','label','tooltip','children','caption','summary','heading','subtitle','description','message',
  'hint','helperText','emptyText','confirmText','cancelText','text','legend','prompt','badge']);
const NOT = new Set(['className','style','id','key','href','src','type','role','rel','target','method','action','htmlFor',
  'name','value','testid','data-testid','lang','dir','tabIndex','autoComplete','inputMode','as','variant','tone','size',
  'icon','kind','mode','align','side','slot','form','pattern','accept','d','viewBox','fill','stroke','xmlns']);
const SUFFIX = /(Label|Text|Title|Message|Hint|Placeholder|Tooltip|Caption|Description|Heading)$/;
const visible = (n) => !n.startsWith('data-') && !NOT.has(n) && (VIS.has(n) || SUFFIX.test(n));
const out = [];
for (const f of files) {
  let src; try { src = fs.readFileSync(f, 'utf8'); } catch (e) { out.push({file: f, error: String(e)}); continue; }
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const add = (node, kind, text, prop) => { const lc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({file: f, line: lc.line + 1, kind, prop: prop || null, text}); };
  const lits = (e, acc) => { if (!e) return acc;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) acc.push([e, e.text]);
    else if (ts.isTemplateExpression(e)) { acc.push([e, [e.head.text, ...e.templateSpans.map(s => s.literal.text)].join(' ')]); }
    else if (ts.isConditionalExpression(e)) { lits(e.whenTrue, acc); lits(e.whenFalse, acc); }
    else if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) { if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) lits(e.left, acc); lits(e.right, acc); }
    else if (ts.isParenthesizedExpression(e)) lits(e.expression, acc);
    return acc; };
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxText(n)) { const t = n.getText(sf).replace(/\s+/g, ' ').trim(); if (t) add(n, 'jsx-text', t); }
    else if (ts.isJsxExpression(n) && n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      for (const [e, t] of lits(n.expression, [])) add(e, 'jsx-expr', t); }
    else if (ts.isJsxAttribute(n)) { const name = n.name.getText(sf);
      if (visible(name) && n.initializer) {
        const init = n.initializer;
        if (ts.isStringLiteral(init)) add(init, 'prop', init.text, name);
        else if (ts.isJsxExpression(init)) for (const [e, t] of lits(init.expression, [])) add(e, 'prop', t, name);
      }
      return; }
    ts.forEachChild(n, visit); };
  visit(sf);
  out.push({file: f, done: true});
}
process.stdout.write(JSON.stringify(out));
'''

class CopyError(Exception): pass

def find_ts(root, explicit):
    cands = ([explicit] if explicit else []) + ([os.path.join(root, 'node_modules/typescript')] if root else []) + TS_CANDIDATES
    for c in cands:
        if c and os.path.isfile(os.path.join(c, 'package.json')): return c
    raise CopyError('typescript not found (pass --ts PATH)')

def load_allow(path):
    try:
        d = json.load(open(path, encoding='utf-8')); toks = d['tokens']
        assert isinstance(toks, list) and all(isinstance(t, str) for t in toks)
        ex = d.get('exclude_globs', []); assert isinstance(ex, list) and all(isinstance(t, str) for t in ex)
        return set(toks), ex
    except Exception as e: raise CopyError(f'allowlist {path}: {e}')

def expand(args):
    files = []
    for a in args:
        g = sorted(glob.glob(a, recursive=True)) if any(c in a for c in '*?[') else [a]
        if not g: raise CopyError(f'{a}: glob matched no files')
        for f in g:
            if not os.path.isfile(f): raise CopyError(f'{f}: not a file')
            files.append(f)
    return files

def ui_files(root):
    if not os.path.isdir(os.path.join(root, 'src')): raise CopyError(f'{root}/src: not found')
    return sorted(glob.glob(os.path.join(root, 'src/**/*.tsx'), recursive=True))

LETTER = re.compile(r'[^\W\d_]')   # any Unicode letter
IGN = re.compile(r'copylint-ignore:\s*\S')

import fnmatch
SEP = re.compile(r'^[\s\W_]+|[\s\W_]+$')
def _excluded(f, root, ex):
    rel = os.path.relpath(f, root).replace(os.sep, '/') if root else f.replace(os.sep, '/')
    return any(fnmatch.fnmatch(rel, g) for g in ex)
def scan(files, ts_path, allow, tf, tt, root=None, ex=()):
    files = [f for f in dict.fromkeys(files)]
    scanned = [f for f in files if not SKIP_RE.search(f.replace(os.sep, '/')) and not _excluded(f, root, ex)]
    skipped = len(files) - len(scanned)
    deadline = time.monotonic() + tt; results = {}
    with tempfile.TemporaryDirectory() as d:
        js = os.path.join(d, 'x.js'); open(js, 'w').write(JS)
        for f in scanned:   # one node process per file: per-file timeout is exact
            left = deadline - time.monotonic()
            if left <= 0: raise CopyError(f'total timeout reached before {f}')
            lst = os.path.join(d, 'f.json'); json.dump([f], open(lst, 'w'))
            try:
                r = subprocess.run(['node', js, ts_path, lst], capture_output=True, text=True,
                                   timeout=min(tf, left), stdin=subprocess.DEVNULL)
            except subprocess.TimeoutExpired: raise CopyError(f'{f}: timeout')
            if r.returncode != 0: raise CopyError(f'{f}: parser failed: {r.stderr.strip()[:200]}')
            rows = json.loads(r.stdout)
            for row in rows:
                if 'error' in row: raise CopyError(f"{row['file']}: {row['error']}")
            lines = open(f, encoding='utf-8').read().split('\n'); hits = []
            for row in rows:
                if 'text' not in row: continue
                t = row['text'].strip()
                if not LETTER.search(t) or t in allow or SEP.sub('', t) in allow: continue
                ln = row['line']; cur = lines[ln - 1] if ln - 1 < len(lines) else ''; prev = lines[ln - 2] if ln >= 2 else ''
                if IGN.search(cur) or IGN.search(prev): continue
                hits.append((ln, row['kind'], row['prop'], t))
            results[f] = sorted(set(hits))
    return results, skipped

def report(results, skipped, verbose=10_000):
    total = sum(len(v) for v in results.values())
    print(f'COPYLINT\t{len(results)} files scanned\t{skipped} skipped (tests/stories/strings/dev routes)\t{total} hits')
    n = 0
    for f, hs in results.items():
        print(f'  scanned {f}\t{len(hs)} hits')
        for ln, k, p, t in hs:
            n += 1
            if n <= verbose: print(f'    {f}:{ln} [{k}{"="+p if p else ""}] {t[:80]!r}')
    return 1 if total else 0

def self_test():
    d = tempfile.mkdtemp(); s = os.path.join(d, 'src', 'apps', 'demo'); os.makedirs(s)
    def put(name, body): p = os.path.join(s, name); open(p, 'w').write(body); return p
    bad = put('Bad.tsx', 'export const B = () => (<div>\n  <button>Buy now</button>\n  <a title="Sell" href="/x">→</a>\n</div>);\n')
    clean = put('Clean.tsx', 'import { S } from "./strings";\nexport const C = () => <button aria-label={S.buy}>{S.buy}</button>;\n')
    cls = put('Cls.tsx', 'export const K = () => <div className="row gap-2" data-testid="k" id="k" style={{color:"red"}}>{" · "}{42}</div>;\n')
    ign = put('Ign.tsx', 'export const I = () => (<div>\n  {/* copylint-ignore: brand mark */}\n  <b>Quay</b> <i>XYZ</i> {/* copylint-ignore: test glyph */}\n</div>);\n')
    put('strings.ts', 'export const S = { buy: "Buy" };\n'); put('Bad.test.tsx', 'export const T = () => <b>Hello</b>;\n')
    me = [sys.executable, os.path.realpath(__file__)]
    run = lambda *a: subprocess.run(me + list(a), capture_output=True, text=True, timeout=120, stdin=subprocess.DEVNULL)
    rb, rc, rk, ri = run(bad), run(clean), run(cls), run(ign)
    rui, rmiss, rnone = run('--ui', d), run(os.path.join(d, 'nope.tsx')), run()
    res = {
        'planted->1': rb.returncode == 1 and ":2 [jsx-text] 'Buy now'" in rb.stdout and ":3 [prop=title] 'Sell'" in rb.stdout,
        'clean S.buy->0': rc.returncode == 0, 'className-only->0': rk.returncode == 0, 'ignore+allow->0': ri.returncode == 0,
        'ui skips test+strings, finds Bad': rui.returncode == 1 and 'Bad.test.tsx' not in rui.stdout and '4 files scanned' in rui.stdout,
        'missing->2': rmiss.returncode == 2, 'no-input->2': rnone.returncode == 2}
    print('SELFTEST', res); print(rb.stdout)
    return 0 if all(res.values()) else 2

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='*'); ap.add_argument('--ui'); ap.add_argument('--allow', default=ALLOW_DEFAULT)
    ap.add_argument('--ts'); ap.add_argument('--timeout-file', type=float, default=30.0)
    ap.add_argument('--timeout-total', type=float, default=600.0); ap.add_argument('--self-test', action='store_true')
    ap.add_argument('--max-print', type=int, default=10_000)
    a = ap.parse_args()
    if a.self_test: return self_test()
    try:
        allow, ex = load_allow(a.allow); files = []
        if a.ui: files += ui_files(a.ui)
        files += expand(a.paths)
        if not files: raise CopyError('no input files (give paths/globs or --ui; stdin is never read)')
        ts_path = find_ts(a.ui, a.ts)
        results, skipped = scan(files, ts_path, allow, a.timeout_file, a.timeout_total, a.ui, ex)
    except CopyError as e: print(f'COPYLINT ERROR\t{e}'); return 2
    return report(results, skipped, a.max_print)

if __name__ == '__main__': sys.exit(main())
