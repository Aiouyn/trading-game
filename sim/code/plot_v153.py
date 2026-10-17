#!/usr/bin/env python3
"""v14.2 wrapper around plot_hd.py (unchanged): pairs use the sim coin closest to each real reference by peak multiple and lifetime
(log distance), instead of the first coin with the same label. Same args as plot_hd.py."""
import numpy as np, plot_hd as P
# call order inside plot_hd.main: corpus coins (file order), then SHOTS order. (peak multiple, lifetime h); screenshot values are eyeballed.
Q = [(2.81, .17), (2.65, .12), (1.77, .31), (1.83, .14),            # corpus-v3: 4BQSy3, 459748 (rugs), 2brRKB, 6eAnHQ (quick)
     (20, 3), (50, 18), (1000, 18), (1000, 18), (30, 3), (300, 6), (4, 1)]  # motion, ftr, baton full, baton last, botcoin, trump1, rostr
def match(coins, label):
    px, lh = Q.pop(0); f = lambda c: (np.log(c['mc'].max() / c['mc'][0] / px)) ** 2 + (np.log((P.life_end(c['vol']) / 720 + .05) / (lh + .05))) ** 2
    ok = [c for c in coins if np.count_nonzero(c['vol']) >= 20] or coins; best = min(ok, key=f)
    return best, f' (closest sim to ref: peak {px}x, life {lh} h)'
P.match = match
if __name__ == '__main__': P.main()
