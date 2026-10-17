#!/usr/bin/env python3
"""v15.4 wrapper around plot_hd.py: pairs use the sim coin closest to each real reference (peak multiple, lifetime), restricted to
the same label (prefixes like 'revival'/'mayhem' stripped); rugs must have a dev dump; each sim coin is used at most once."""
import json, sys, numpy as np, plot_hd as P
Q = [(1.91, .10), (2.63, .07), (1.66, .17), (1.49, .13),
     (20, 3), (50, 18), (1000, 18), (1000, 18), (30, 3), (300, 6), (4, 1)]
TPK = [2.0, 0.3]  # 21DyGR, 6Cz3ND (corpus 0..; rostr screenshot ~0.5)
LABS = {'rug', 'quick', 'trender', 'grinder', 'runner'}
_sc = P.sim_coins; DEV = {}
def sim_coins(d):
    cs = _sc(d)
    for c, raw in zip(cs, d['charts']):
        c['lab2'] = raw['lab']; DEV[id(c)] = raw.get('clues', {}).get('devSoldAt', -1)
    return cs
P.sim_coins = sim_coins; used = set()
def match(coins, label):
    px, lh = Q.pop(0); f = lambda c: (np.log(c['mc'].max() / c['mc'][0] / px)) ** 2 + (np.log((P.life_end(c['vol']) / 720 + .05) / (lh + .05))) ** 2
    ok = [c for c in coins if c['lab2'] == label and np.count_nonzero(c['vol']) >= 20 and id(c) not in used and (label != 'rug' or DEV[id(c)] >= 0)]
    if not ok: ok = [c for c in coins if c['lab2'] == label and id(c) not in used] or coins
    if label == 'quick' and TPK:  # quick refs: prefer similar time-to-peak (minutes)
        tp = TPK.pop(0); g = lambda c: f(c) + (np.log((np.argmax(c['mc']) / 12 + 0.5) / (tp + 0.5))) ** 2
        best = min(ok, key=g)
    else: best = min(ok, key=f)
    used.add(id(best))
    extra = f', dev dump at {DEV[id(best)] * 5 / 60:.1f} min' if label == 'rug' else ''
    return best, f' (closest sim {label} to ref: peak {px}x, life {lh} h{extra})'
P.match = match
if __name__ == '__main__': P.main()
