#!/usr/bin/env python3
"""Tone lint (T12-12, E-61). Forbidden real-world terms over spec docs and UI string files.

Usage:
  tonelint.py [--spec] [--ui ROOT] [--timeout-file S] [--timeout-total S] [PATH|GLOB ...]
    PATH/GLOB   files to scan (markdown or text: every line; .ts/.tsx/.js: string literals only)
    --spec      scan /workspace/spec/export/vision-review/complete/*.md (the assemble --all baseline)
    --ui ROOT   scan ROOT/src/**/strings.ts and ROOT/src/**/about-data.ts (apps, shell, ...; all locales)
    --self-test plant 'Goldman Sachs' in a temp strings.ts and check exit 1 + reported hit
  No inputs -> error (exit 2). stdin is never read.
Exit: 0 clean, 1 hits, 2 any error (missing/unreadable file, malformed list, timeout, no inputs).
Previous behaviour (E-61 fix2): __main__ ignored argv and always rescanned all spec docs with
~400 separate regexes per line (40-60 s), which looked like a hang on file arguments.
"""
import json, re, sys, os, glob, fnmatch, time, unicodedata, collections, argparse, tempfile, subprocess
SRC = '/workspace/specs/data/forbidden-real-world-terms.json'
TS_SRC = '/workspace/specs/data/ts-technique-list.json'   # optional T&S list: missing = skipped, malformed = error
SPEC_GLOB = '/workspace/spec/export/vision-review/complete/*.md'

class LintError(Exception): pass

def _load():
    try: d = json.load(open(SRC, encoding='utf-8'))
    except Exception as e: raise LintError(f'term list {SRC}: {e}')
    cats = d.get('categories'); al = d.get('allowlist', {})
    if not isinstance(cats, dict) or not isinstance(al.get('terms'), list): raise LintError('term list malformed: categories/allowlist')
    for c, v in cats.items():
        for k in ('terms', 'case_sensitive_terms'):
            if not all(isinstance(t, str) and t for t in v.get(k, [])): raise LintError(f'term list malformed: {c}.{k}')
    if os.path.exists(TS_SRC):
        try:
            t = json.load(open(TS_SRC, encoding='utf-8')); cats.update({'ts_' + k: v for k, v in t['categories'].items()})
        except Exception as e: raise LintError(f'T&S list {TS_SRC}: {e}')
    return d

def fold(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
def _body(t): return r'\s+'.join(re.escape(p) for p in fold(t).split(' '))
def pat(t, ci):
    f = fold(t)
    pre = r'(?<!\w)' if re.match(r'\w', f[0]) else ''
    post = r'(?!\w)' if re.match(r'\w', f[-1]) else ''
    return re.compile(pre + _body(t) + post, re.I if ci else 0)

D = None; P = []; AL = []; ALP = []; EX = []; PRE = None
TOK = re.compile(r'[^\s|`()\[\],;:.*_"\x27]+')
def init():
    global D, P, AL, ALP, EX, PRE
    if D is not None: return
    D = _load()
    P = [(c, t, pat(t, True)) for c, v in D['categories'].items() for t in v['terms']] + \
        [(c, t, pat(t, False)) for c, v in D['categories'].items() for t in v.get('case_sensitive_terms', [])]
    AL = [pat(t, False) for t in D['allowlist']['terms']]
    ALP = [re.compile(x['regex'], 0 if x.get('case', 'sensitive') == 'sensitive' else re.I) for x in D['allowlist'].get('patterns', [])]
    EX = D.get('scope_exclusions', {}).get('rules', [])
    # one case-insensitive prefilter: a line with no candidate skips the per-term loop (the old 40-60 s cost)
    PRE = re.compile('|'.join(_body(t) for _, t, _ in P), re.I)

def _pat_allowed(f, a, b):
    for m in TOK.finditer(f):
        if m.start() <= a and b <= m.end(): return any(p.search(m.group()) for p in ALP)
    return False
def excluded(fname, heads, line, cat):
    for r in EX:
        if not fnmatch.fnmatch(fname, r['file']): continue
        if 'section' in r and not any(re.search(r['section'], h) for h in heads): continue
        if 'line' in r and not re.search(r['line'], line): continue
        if 'categories' in r and cat not in r['categories']: continue
        return r['id']
    return None
def lint(s, fname=None, heads=()):
    init(); f = fold(s)
    if not PRE.search(f): return []
    cov = [m.span() for a in AL for m in a.finditer(f)]; out = []
    for c, t, p in P:
        for m in p.finditer(f):
            if any(a <= m.start() and m.end() <= b for a, b in cov) or _pat_allowed(f, *m.span()): continue
            if fname and excluded(fname, heads, s, c): continue
            out.append((c, t, m.start()))
    return out

# ---- string-literal extraction for .ts/.tsx/.js (quotes, template literals incl. nested ${}) ----
def ts_strings(src):
    """Yield (line, text) for each string literal; template literal text parts (outside ${...}) included."""
    i, n, line = 0, len(src), 1
    while i < n:
        ch = src[i]
        if ch == '\n': line += 1; i += 1; continue
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); j = n if j < 0 else j + 2; line += src.count('\n', i, j); i = j; continue
        if ch in '"\'':
            j, buf, start = i + 1, [], line
            while j < n and src[j] != ch and src[j] != '\n':
                if src[j] == '\\' and j + 1 < n: buf.append(src[j + 1]); j += 2; continue
                buf.append(src[j]); j += 1
            yield start, ''.join(buf); i = j + 1; continue
        if ch == '`':
            j, buf, start, depth = i + 1, [], line, 0
            while j < n:
                c = src[j]
                if c == '\\' and j + 1 < n: buf.append(src[j + 1]); j += 2; continue
                if c == '`': break
                if src.startswith('${', j):
                    if buf: yield start, ''.join(buf); buf = []
                    k, d = j + 2, 1          # skip the expression; literals inside it are scanned by recursion
                    while k < n and d:
                        if src[k] == '{': d += 1
                        elif src[k] == '}': d -= 1
                        k += 1
                    for l2, t2 in ts_strings(src[j + 2:k - 1]): yield line + l2 - 1, t2
                    line += src.count('\n', j, k); j = k; start = line; continue
                if c == '\n': line += 1
                buf.append(c); j += 1
            if buf: yield start, ''.join(buf)
            i = j + 1; continue
        i += 1

def scan_file(path, deadline_total, timeout_file):
    t0 = time.monotonic()
    try: src = open(path, encoding='utf-8').read()
    except Exception as e: raise LintError(f'{path}: {e}')
    hits = []; name = os.path.basename(path)
    if path.endswith(('.ts', '.tsx', '.js', '.mjs')):
        units = list(ts_strings(src)); heads = ()
        for ln, text in units:
            _tick(path, t0, timeout_file, deadline_total)
            for c, t, _ in lint(text, name, heads): hits.append((ln, c, t, text.strip()[:90]))
    else:
        stack = {}
        for ln, l in enumerate(src.splitlines(), 1):
            _tick(path, t0, timeout_file, deadline_total)
            h = re.match(r'^(#{1,6}) (.*)', l)
            if h:
                lv = len(h.group(1)); stack = {k: v for k, v in stack.items() if k < lv}; stack[lv] = h.group(2)
            for c, t, _ in lint(l, name, tuple(stack.values())): hits.append((ln, c, t, l.strip()[:90]))
    return sorted(set(hits))
def _tick(path, t0, tf, deadline):
    now = time.monotonic()
    if now - t0 > tf: raise LintError(f'{path}: per-file timeout {tf}s')
    if now > deadline: raise LintError(f'total timeout reached while scanning {path}')

def expand(args):
    files = []
    for a in args:
        g = sorted(glob.glob(a, recursive=True)) if any(ch in a for ch in '*?[') else [a]
        if not g: raise LintError(f'{a}: glob matched no files')
        for f in g:
            if not os.path.isfile(f): raise LintError(f'{f}: not a file')
            files.append(f)
    return list(dict.fromkeys(files))
def ui_files(root):
    """E-65: every strings.ts and about-data.ts under ROOT/src (src/apps, src/shell, ...), all locales."""
    if not os.path.isdir(os.path.join(root, 'src')): raise LintError(f'{root}/src: not found')
    return sorted(set(glob.glob(os.path.join(root, 'src/**/strings.ts'), recursive=True) +
                      glob.glob(os.path.join(root, 'src/**/about-data.ts'), recursive=True)))

def run(files, timeout_file=20.0, timeout_total=300.0, verbose=200, quiet=False):
    """Returns exit code 0/1/2 and prints coverage + hits."""
    deadline = time.monotonic() + timeout_total
    cat = collections.Counter(); out = []; total = 0
    for f in files:
        try: hits = scan_file(f, deadline, timeout_file)
        except LintError as e: print(f'TONELINT ERROR\t{e}'); return 2
        out.append(f'  scanned {f}\t{len(hits)} hits')
        for ln, c, t, ctx in hits:
            cat[c] += 1; total += 1
            if total <= verbose: out.append(f'    {f}:{ln} [{c}] {t} :: {ctx}')
    print(f'TONELINT\t{len(files)} files\t{total} hits\t' + ', '.join(f'{k}={v}' for k, v in cat.most_common()))
    if not quiet or total: print('\n'.join(out))
    return 1 if total else 0
def run_all(verbose=50):   # used by assemble.py --all (report-only)
    try: init(); files = expand([SPEC_GLOB])
    except LintError as e: print(f'TONELINT ERROR\t{e}'); return -1
    return run(files, verbose=verbose, quiet=True)

def self_test():
    d = tempfile.mkdtemp(); p = os.path.join(d, 'src/apps/demo'); os.makedirs(p)
    f = os.path.join(p, 'strings.ts')
    open(f, 'w').write('export const en = {\n  ok: "Federal Dollar",\n  bad: `Advice from ${x} Goldman Sachs desk`,\n};\nexport const fr = { ok2: "Meridia Bourse" };\n')
    r = subprocess.run([sys.executable, __file__, '--ui', d], capture_output=True, text=True, timeout=60)
    ok = r.returncode == 1 and f'{f}:3 [real_companies_brands] Goldman Sachs' in r.stdout
    clean = os.path.join(p, 'about-data.ts'); open(f, 'w').write('export const en = { a: "Federal Dollar $500" };\n')
    r0 = subprocess.run([sys.executable, __file__, '--ui', d], capture_output=True, text=True, timeout=60)
    r2 = subprocess.run([sys.executable, __file__, os.path.join(d, 'missing.ts')], capture_output=True, text=True, timeout=60)
    r3 = subprocess.run([sys.executable, __file__], capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
    res = {'planted->1+hit': ok, 'clean->0': r0.returncode == 0, 'missing->2': r2.returncode == 2, 'no-input->2': r3.returncode == 2}
    print('SELFTEST', res); print(r.stdout)
    return 0 if all(res.values()) else 2

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='*'); ap.add_argument('--spec', action='store_true'); ap.add_argument('--ui')
    ap.add_argument('--timeout-file', type=float, default=20.0); ap.add_argument('--timeout-total', type=float, default=300.0)
    ap.add_argument('--self-test', action='store_true')
    a = ap.parse_args()
    if a.self_test: return self_test()
    try:
        init(); files = []
        if a.spec: files += expand([SPEC_GLOB])
        if a.ui: files += ui_files(a.ui)
        files += expand(a.paths)
        if not files: raise LintError('no input files (give paths/globs, --spec or --ui; stdin is never read)')
    except LintError as e: print(f'TONELINT ERROR\t{e}'); return 2
    return run(list(dict.fromkeys(files)), a.timeout_file, a.timeout_total)
if __name__ == '__main__': sys.exit(main())
