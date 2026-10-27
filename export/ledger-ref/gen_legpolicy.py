#!/usr/bin/env python3
"""Generate legpolicy.csv (E-11 legPolicy, Producer sign-off 2026-10-21) from catalog.csv v2 + card call sites.
Inputs: catalog.csv (this dir), cards/T03-03,07,14,15.md (copies of PR #1 export/build-plan/cards/03, 'pr1' ref).
Rules (E-11):
  '-'                -> NONE (no value leg in this template; any override rejected)
  QTY_ONLY codes     -> NONE on both legs (EQ_SPLIT, LED_DISSOLUTION; T03-07:93)
  '@ASSET'           -> REQUIRED, allowed ASSET_ACCT (holder 15xx-18xx or issuer 2300|2310|2600|3100|3150, assetId sub)
  '@'                -> REQUIRED, allowed NONMONEY_SAME_ENTITY (not BMA 1001-1003/1010, not 1009, not cbk 1910/2001-2003, not sys)
  concrete account   -> FIXED, unless a card declares other accounts for that code/leg -> CLASS (catalog default + card set)
ACCRUE / ACCRUE_PAIR: the check applies to the (dr, cr) the caller passes, before the negative-amount swap (T03-07:76).
"""
import csv, re, os, collections
D = os.path.dirname(os.path.abspath(__file__))
cat = list(csv.DictReader(open(os.path.join(D, 'catalog.csv'))))
cards = {n: open(os.path.join(D, 'cards', f'T03-{n}.md')).read().splitlines() for n in ('03', '07', '14', '15')}
ASSET = 'ASSET_ACCT(15xx-18xx|2300|2310|2600|3100|3150;+assetId sub)'
NONM = 'NONMONEY_SAME_ENTITY'
QTY_ONLY = {'EQ_SPLIT', 'LED_DISSOLUTION'}

cat_leg = {(r['code'], l): r['leg' + l] for r in cat for l in ('A', 'B')}
# card-declared extra accounts: code -> {'A': {acct: src}, 'B': {...}}
extra = collections.defaultdict(lambda: {'A': {}, 'B': {}})
amb = collections.defaultdict(list)
def add(code, leg, acct, src): extra[code][leg].setdefault(str(acct), src)

# 1. accrue(E, amt, ccy, 'CODE', dr, cr ...) and reclass(E, amt, ccy, 'CODE', from, to) call sites
call = re.compile(r"(accrue|reclass)\(\s*\w+,\s*[^,]+,\s*\w+,\s*'([A-Z_0-9]+)',\s*([\w.]+),\s*([\w.]+)")
for n, lines in cards.items():
    for i, l in enumerate(lines, 1):
        for m in call.finditer(l):
            fn, code, a, b = m.groups()
            src = f'cards/03/T03-{n}.md:{i}'
            if fn == 'reclass': a, b = b, a     # RECLASS posting is Dr toAcct / Cr fromAcct; legA=debit
            for leg, v in (('A', a), ('B', b)):
                if v.isdigit(): add(code, leg, v, src)
                elif cat_leg.get((code, leg)) == '@ASSET': add(code, leg, '@ASSET', src)
                else: amb[code].append(f'{src}: leg{leg} passed as variable `{v}`; resolved by rule, not by the call site')
# 2. ACCRUE_PAIR LED_ACCRUAL overrides (T03-07:92, T03-15 DEFAULT_LEGS :77)
for a in ('1110', '1100', '4190'): add('LED_ACCRUAL', 'A', a, 'cards/03/T03-07.md:92;T03-15.md:77')
for b in ('2520', '2540', '2510'): add('LED_ACCRUAL', 'B', b, 'cards/03/T03-07.md:92;T03-15.md:77')
# 3. settleAccrual: pay(b, a, ..., {valueLegA: row.valueLegB, valueLegB: row.valueLegA}) for named codes (T03-15:117)
for code in ('BNK_LOAN_INTEREST', 'CMP_INTERCOMPANY_INTEREST', 'SOC_LOAN_P2P_INTEREST'):
    for a in ('2520', '2540', '2510'): add(code, 'A', a, 'cards/03/T03-15.md:117')
    for b in ('1110', '1100'): add(code, 'B', b, 'cards/03/T03-15.md:117')
# 3a. MTM loss posts Dr 5170 / Cr <asset> (T03-14:125): the asset is legB there
add('LED_MTM_DAILY', 'B', '@ASSET', 'cards/03/T03-14.md:125')
# 3b. period close (T03-15:31): P&L -> 3200, or 3900 for characters/alliances; sys 5900/4900 -> 3990
for b in ('3900', '3990'): add('LED_PERIOD_CLOSE', 'B', b, 'cards/03/T03-15.md:31')
# 4. appraisal OCI route: valueLegB 3400 (T03-14:164); TAX_* treasury leg 1130 vs 4190 (T03-03:37)
add('LED_APPRAISAL', 'B', '3400', 'cards/03/T03-14.md:164')
for r in cat:
    if r['code'].startswith('TAX_') and r['legB'] == '1130': add(r['code'], 'B', '4190', 'cards/03/T03-03.md:37')

# ambiguities found while deriving
amb['LED_APPRAISAL'].append("pnl part 'as above' (T03-14:165) may use 5170 on losses like LED_MTM_DAILY (T03-14:125); not added")
amb['LED_RECLASS'].append("'@'/'@' plus card use 3400->4070 (T03-14:170) and the INV-LED-006 restricted release 1001:RESTRICTED->1001; REQUIRED, no closed set")
amb['LED_PERIOD_CLOSE'].append("legA '@' covers every P&L account; sys 4900/5900 must be allowed here (normally sys is barred for '@'); 3200 vs 3900 depends on entity kind (chr/ali -> 3900), sys -> 3990")
for r in cat:
    if 'derived' in r and r['derived']: amb[r['code']].append('catalog legs PROVISIONAL (E-10)')

rows = []; st = collections.Counter()
for r in cat:
    code = r['code']; tpl = r['allowedTemplates'].split(' (')[0]
    out = {'code': code, 'class': r['class'], 'templates': tpl}
    for leg in ('A', 'B'):
        dflt = r['leg' + leg]; ex = extra[code][leg] if code in extra else {}
        src = r['cols_source'] or 'derived'
        if code in QTY_ONLY or dflt in ('-', ''):
            pol, allowed = 'NONE', '-'
            if ex: amb[code].append(f'card passes leg{leg} {sorted(ex)} but catalog has none')
        elif dflt == '@ASSET':
            pol, allowed = 'REQUIRED', ASSET
            others = sorted(k for k in ex if k != '@ASSET')
            if others: pol, allowed = 'CLASS', '|'.join([ASSET] + others); src += ';' + ';'.join(sorted(set(ex[k] for k in others)))
        elif dflt == '@':
            pol, allowed = 'REQUIRED', NONM
            if code == 'LED_PERIOD_CLOSE': allowed = 'P&L 4xxx|5xxx|6xxx incl. sys 4900|5900 (T03-15:31)'
        else:
            others = sorted(k for k in ex if k != dflt)
            if others:
                pol, allowed = 'CLASS', '|'.join([dflt] + others)
                src += ';' + ';'.join(sorted(set(ex[k] for k in others)))
            else:
                pol, allowed = 'FIXED', dflt
        if code in ('CONFLICT_RANSOM', 'CONFLICT_CASH_LOOT') or (r.get('derived') and pol != 'NONE'):
            src = 'derived (E-10)'
        if code == 'LED_PERIOD_CLOSE':   # T03-15:157-158 posts both orientations (credit- and debit-balance P&L)
            pol, allowed, src = 'CLASS', 'P&L 4xxx|5xxx|6xxx (incl. sys 4900|5900)|3200|3900|3990', 'cards/03/T03-05.md:166;cards/03/T03-15.md:31,157-158'
        out.update({f'leg{leg}_default': dflt, f'leg{leg}_policy': pol, f'leg{leg}_allowed': allowed, f'leg{leg}_source': src})
        st[(leg, pol)] += 1
    out['negative_swap'] = 'Y' if any(t in ('ACCRUE', 'ACCRUE_PAIR') for t in tpl.split()) else 'N'
    out['ambiguous'] = ' | '.join(amb.get(code, []))
    rows.append(out)
with open(os.path.join(D, 'legpolicy.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print('rows', len(rows))
for k in sorted(st): print('leg%s %-8s %d' % (k[0], k[1], st[k]))
foc = collections.Counter()
for r in rows:
    for t in r['templates'].split():
        if t in ('SWAP_ASSET', 'ACCRUE', 'ACCRUE_PAIR', 'RECLASS'): foc[(t, r['legA_policy'], r['legB_policy'])] += 1
for k in sorted(foc): print('focus', k, foc[k])
print('CLASS codes:', [r['code'] for r in rows if 'CLASS' in (r['legA_policy'], r['legB_policy'])])
print('card calls not in catalog:', sorted(c for c in extra if c not in {r["code"] for r in cat}))
print('ambiguous:', len([r for r in rows if r['ambiguous']]))
for r in rows:
    if r['ambiguous']: print('  ', r['code'], '::', r['ambiguous'])
