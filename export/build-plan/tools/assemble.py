#!/usr/bin/env python3
"""Assemble self-contained task packs from task cards + the spec.

Usage:
  python3 assemble.py --check T05-03        # validate one card and print its pack size
  python3 assemble.py --unit 05             # build packs for one unit
  python3 assemble.py --all                 # build every pack, write packs/ and reports/
Cards live in build-plan/cards/<unit>/<id>.md (YAML front matter + markdown body).
"""
import os, re, sys, glob, json, argparse
import yaml
sys.path.insert(0, os.path.dirname(__file__))
import spec

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, 'cards')
PACKS = os.path.join(ROOT, 'packs')
GLOBAL = os.path.join(ROOT, 'GLOBAL-CONTEXT.md')
PACK_TARGET = 45000   # tokens (chars/4)
PACK_HARD = 60000

# ---------------- cards ----------------
def load_card(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', raw, re.S)
    if not m: raise ValueError(f'{path}: missing front matter')
    front = re.sub(r'(?<![\'"\w])(T\d\d[A-D]?-\?\?)', r'"\1"', m.group(1))
    fm = yaml.safe_load(front) or {}
    fm['_body'] = m.group(2)
    fm['_path'] = path
    return fm

def all_cards():
    out = {}
    for p in sorted(glob.glob(os.path.join(CARDS, '*', '*.md'))):
        if os.path.basename(p).startswith('_'): continue
        c = load_card(p)
        out[c['id']] = c
    return out

def body_section(body, name):
    m = re.search(r'^## ' + re.escape(name) + r'\s*\n(.*?)(?=^## |\Z)', body, re.S | re.M)
    return m.group(1).strip() if m else ''

# ---------------- spec addressing ----------------
ADDR = re.compile(r'^(\d\d)§([\d.]+)$')
def parse_addr(a):
    m = ADDR.match(a.strip())
    if not m: raise ValueError(f'bad spec address {a!r} (use like "05§3.5.2")')
    return m.group(1), m.group(2)

def within(num, parent):
    return num == parent or num.startswith(parent + '.')

# ---------------- 23 params ----------------
_params = None
def params_table():
    global _params
    if _params is not None: return _params
    _params = {}
    t = spec.text('23', '4')
    for line in t.split('\n'):
        m = re.match(r'^\|\s*`([^`]+)`\s*\|', line)
        if m: _params.setdefault(m.group(1), line)
    return _params

def param_header():
    return '| key | default | range | unit | owner § | what it affects | live |\n|---|---|---|---|---|---|---|'

PKEY = re.compile(r'PARAM\.([a-z0-9_]+(?:P[0-9]+)?(?:<[a-z_]+>[a-z0-9_]*)*)')
def find_params(text):
    keys = set(PKEY.findall(text))
    keys |= set(re.findall(r'`([a-z][a-z0-9]*_[a-z0-9_]+)`', text)) & set(params_table())
    return keys

def param_rows(keys):
    tab = params_table(); rows = []; missing = []
    fams = [k for k in tab if '<' in k or '*' in k]
    for k in sorted(keys):
        if k in tab: rows.append(tab[k]); continue
        if k + '*' in tab: rows.append(tab[k + '*']); continue   # PKEY drops a trailing '*' of a family key
        up = [t for t in tab if k.endswith('_') and t.startswith(k) and t[len(k):].isupper()]
        if len(up) == 1: rows.append(tab[up[0]]); continue   # PKEY drops an uppercase suffix (e.g. _GD)
        hit = None
        for f in fams:
            pat = '^' + re.escape(f).replace(r'\*', '.*') + '$'
            pat = re.sub(r'<[a-z_]+>', '[a-z0-9_]+', pat.replace('\\<', '<').replace('\\>', '>'))
            if re.match(pat, k): hit = f; break
        if hit: rows.append(tab[hit])
        else: missing.append(k)
    return sorted(set(rows)), missing

# ---------------- 24 decisions ----------------
_dec = None
def decisions():
    global _dec
    if _dec is not None: return _dec
    _dec = []
    for num in ['3', '5', '6']:
        t = spec.text('24', num)
        for line in t.split('\n'):
            m = re.match(r'^\|\s*\**([DRY]\d+)\**\s*\|', line)
            if m: _dec.append((m.group(1), line))
    return _dec

CITE = re.compile(r'\b(\d\d) (?:§|Rule |AT )?§?([\d.]+\d)')
def decisions_for(addrs, extra_ids):
    out = []
    for did, line in decisions():
        if did in extra_ids: out.append(line); continue
        for mod, num in CITE.findall(line):
            if any(mod == am and (within(num, an)) for am, an in addrs):
                out.append(line); break
    return out

# ---------------- 20 invariants ----------------
_inv = None
def invariants():
    global _inv
    if _inv is not None: return _inv
    _inv = {}
    for mod in spec.files():
        try: t = open(spec.files()[mod], encoding='utf-8').read()
        except Exception: continue
        for line in t.split('\n'):
            m = re.match(r'^\|\s*\**(INV-[A-Z0-9]+-\d+)\**\s*\|', line)
            if m and (mod == '20' or m.group(1) not in _inv): _inv[m.group(1)] = line
    return _inv

# ---------------- pack ----------------
def tests_text(ids):
    out, missing = [], []
    cache = {}
    for tid in ids:
        mod, _, n = str(tid).partition('#')
        if mod not in cache: cache[mod] = spec.acceptance_tests(mod)
        try: txt = cache[mod][int(n)]
        except (KeyError, ValueError):
            missing.append(tid); continue
        out.append(f'- **{tid}** ' + re.sub(r'^\s*\d+\.\s*', '', txt))
    return out, missing

def build_pack(card, cards):
    errs, warns = [], []
    parts = []
    parts.append(open(GLOBAL, encoding='utf-8').read())
    parts.append(f"\n\n---\n\n# TASK {card['id']}: {card.get('title','')}\n\nUnit {card.get('unit')} · stage {card.get('stage','?')} · depends on: {', '.join(card.get('depends_on') or []) or 'nothing'}\n\nFiles to create:\n" + '\n'.join(f'- `{f}`' for f in card.get('files') or []) + '\n')
    parts.append(card['_body'])
    # upstream exports
    ups = []
    for d in card.get('depends_on') or []:
        if d not in cards:
            (warns if '??' in d else errs).append(f'depends_on {d} has no card'); continue
        ex = body_section(cards[d]['_body'], 'Exports')
        if not ex: warns.append(f'{d} has no Exports section')
        ups.append(f"### From {d} ({cards[d].get('title','')})\n\n{ex}\n")
    if ups: parts.append('\n\n---\n\n# UPSTREAM EXPORTS (the only APIs you may import besides GLOBAL CONTEXT)\n\n' + '\n'.join(ups))
    # spec excerpts (module purpose first)
    addrs = []
    ex_parts = []
    umod = str(card.get('unit', ''))[:2]
    if umod in spec.files():
        try: ex_parts.append(f'\n**[{umod} §1 Purpose]** (context)\n\n' + spec.text(umod, '1'))
        except KeyError: pass
    for key in ['spec', 'context', 'catalog']:
        for a in card.get(key) or []:
            try:
                mod, num = parse_addr(a); s = spec.get(mod, num)
            except Exception as e:
                errs.append(f'{key}: {e}'); continue
            addrs.append((mod, num))
            ex_parts.append(f'\n<!-- excerpt {mod}§{num} -->\n**[{mod} §{num}]** (from spec file {os.path.basename(spec.files()[mod])})\n\n' + s[5])
    parts.append('\n\n---\n\n# SPEC EXCERPTS (verbatim; binding game rules)\n' + '\n'.join(ex_parts))
    # acceptance tests
    tt, miss = tests_text(card.get('tests') or [])
    for m in miss: errs.append(f'test {m} not found in spec')
    if tt: parts.append('\n\n---\n\n# ACCEPTANCE TESTS YOU MUST MAKE PASS (verbatim from the spec)\n\n' + '\n'.join(tt))
    inv = invariants(); il = []
    for i in card.get('invariants') or []:
        if i in inv: il.append(inv[i])
        else: errs.append(f'invariant {i} not found')
    if il: parts.append('\n\n# INVARIANTS YOU MUST REGISTER (20 §3.1)\n\n| Id | Scope | Severity | Invariant |\n|---|---|---|---|\n' + '\n'.join(il))
    # params
    joined = '\n'.join(parts[1:])
    keys = find_params(joined) | set(card.get('params') or [])
    rows, pmiss = param_rows(keys)
    if rows: parts.append('\n\n---\n\n# PARAMETERS (23 registry rows; read via ctx.params)\n\n' + param_header() + '\n' + '\n'.join(rows))
    if pmiss: warns.append('params not in registry: ' + ', '.join(pmiss[:20]))
    # decisions
    dl = decisions_for(addrs, set(card.get('decisions') or []))
    if dl: parts.append('\n\n---\n\n# DECISIONS AND RULINGS THAT APPLY (24; they override the excerpts where they differ)\n\n' + '\n'.join(dl))
    pack = ''.join(parts)
    size = spec.tok(pack)
    if size > PACK_HARD: errs.append(f'pack {size} tokens > hard cap {PACK_HARD}')
    elif size > PACK_TARGET: warns.append(f'pack {size} tokens > target {PACK_TARGET}')
    # card checks
    for f in ['id', 'unit', 'title', 'files', 'stage']:
        if not card.get(f): errs.append(f'missing field {f}')
    for sec in ['Goal', 'Exports', 'Implementation steps', 'Test plan', 'Done when']:
        if not body_section(card['_body'], sec): errs.append(f'missing body section "## {sec}"')
    return pack, size, errs, warns

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check'); ap.add_argument('--unit'); ap.add_argument('--all', action='store_true')
    ap.add_argument('--write', action='store_true', help='with --check/--unit also write the pack file')
    a = ap.parse_args()
    cards = all_cards()
    sel = []
    if a.check: sel = [a.check]
    elif a.unit: sel = [k for k, c in cards.items() if str(c.get('unit')) == a.unit]
    elif a.all: sel = list(cards)
    bad = 0
    for cid in sel:
        if cid not in cards: print(f'{cid}: no card'); bad += 1; continue
        pack, size, errs, warns = build_pack(cards[cid], cards)
        status = 'ERROR' if errs else ('WARN' if warns else 'OK')
        print(f'{cid}\t{size} tok\t{status}\t' + '; '.join(errs + warns))
        if errs: bad += 1
        if a.write or a.all:
            d = os.path.join(PACKS, str(cards[cid]['unit'])); os.makedirs(d, exist_ok=True)
            open(os.path.join(d, cid + '.md'), 'w', encoding='utf-8').write(pack)
    if a.all:
        import tonelint; tonelint.run_all()   # E-61: report-only; malformed list raises
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
