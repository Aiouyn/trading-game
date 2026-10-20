#!/usr/bin/env python3
"""Coverage check: acceptance tests, spec sections and invariants vs task cards.
Usage: python3 coverage.py [MODULE ...]   (no args = every module, plus global checks)
"""
import sys, os, re, collections
sys.path.insert(0, os.path.dirname(__file__))
import spec, assemble

INV_OWNER = {'LED': ['03'], 'MKT': ['05'], 'CCP': ['07'], 'BNK': ['07'], 'FND': ['08'], 'INS': ['08'],
             'CON': ['12'], 'LAW': ['13'], 'PRG': ['14'], 'SOC': ['15'], 'ENG': ['02', '19', '20'],
             'STR': ['19', '20', '21']}
BS_OWNER = {1: '03', 2: '03', 3: '06', 4: '03', 5: '09', 6: '07', 7: '07', 8: '03', 9: '10', 10: '15', 11: '03', 12: '03'}
CODE_MODULES = ['02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']

def inv_modules(iid):
    m = re.match(r'INV-([A-Z]+)-(\d+)', iid)
    if m.group(1) == 'BS': return [BS_OWNER.get(int(m.group(2)), '03')]
    return INV_OWNER.get(m.group(1), ['20'])

def required_sections(mod):
    """Leaf-ish sections from §2 to the end except screens/acceptance tests, at any depth."""
    out = []
    atn = spec.at_section(mod)
    for num, lvl, title, st, en, txt in spec.sections(mod):
        if lvl < 2: continue
        top = num.split('.')[0]
        if not top.isdigit() or (int(top) < 2 and mod != '22'): continue
        if num == atn: continue
        # only require sections that have no subsections (leaves)
        has_child = any(n2.startswith(num + '.') for n2, *_ in spec.sections(mod))
        if not has_child: out.append(num)
    return out

def main():
    mods = sys.argv[1:] or CODE_MODULES
    cards = assemble.all_cards()
    cited = collections.defaultdict(set)      # mod -> set of nums
    tests = collections.defaultdict(list)     # 'NN#k' -> [card ids]
    invs = collections.defaultdict(list)
    for cid, c in cards.items():
        for key in ['spec', 'context', 'catalog']:
            for a in c.get(key) or []:
                try: m, n = assemble.parse_addr(a); cited[m].add(n)
                except Exception: pass
        for t in c.get('tests') or []: tests[str(t)].append(cid)
        for i in c.get('invariants') or []: invs[i].append(cid)
    ok = True
    for mod in mods:
        if mod not in spec.files(): continue
        ats = spec.acceptance_tests(mod)
        missing_t = [f'{mod}#{k}' for k in sorted(ats) if f'{mod}#{k}' not in tests]
        dup_t = [f'{t}->{v}' for t, v in tests.items() if t.startswith(mod + '#') and len(v) > 1]
        req = required_sections(mod)
        unc = [n for n in req if not any(assemble.within(n, c) for c in cited[mod])]
        inv_mine = [i for i in assemble.invariants() if mod in inv_modules(i)]
        inv_missing = [i for i in inv_mine if i not in invs and not any(invs.get(i) for _ in [0])]
        # for shared owners, an invariant counts if any card has it
        inv_missing = [i for i in inv_missing if not invs.get(i)]
        ncards = sum(1 for c in cards.values() if str(c.get('unit', ''))[:2] == mod)
        line = f'{mod}: cards {ncards} | tests {len(ats)-len(missing_t)}/{len(ats)} | sections {len(req)-len(unc)}/{len(req)} | invariants {len(inv_mine)-len(inv_missing)}/{len(inv_mine)}'
        print(line)
        if missing_t: print('  missing tests:', ', '.join(missing_t)); ok = False
        if dup_t: print('  duplicated tests:', ', '.join(dup_t)); ok = False
        if unc and ncards: print('  uncited sections:', ', '.join('§' + n for n in unc)); ok = False
        if inv_missing and ncards: print('  invariants not owned by a card (shared owners may cover):', ', '.join(inv_missing))
    if not sys.argv[1:]:
        dupi = {i: v for i, v in invs.items() if len(v) > 1}
        if dupi: print('invariants in more than one card:', dupi); ok = False
        unknown = [t for t in tests if not re.match(r'^\d\d#\d+$', t)]
        if unknown: print('custom test ids (allowed for 22/24 etc.):', len(unknown))
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
