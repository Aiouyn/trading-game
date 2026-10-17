#!/usr/bin/env python3
"""v14.2 wrapper around plot_hd.py (unchanged): pairs use the sim coin closest to each real reference by peak multiple and lifetime
(log distance), instead of the first coin with the same label. Same args as plot_hd.py."""
import numpy as np, plot_hd as P
# call order inside plot_hd.main: corpus coins (file order), then SHOTS order. (peak multiple, lifetime h); screenshot values are eyeballed.
Q = [(1.91, .10), (2.63, .07), (1.66, .17), (1.49, .13),            # corpus 21DyGR, 3oS2Mo, 69Yygs, 6Cz3ND
     (20, 3), (50, 18), (1000, 18), (1000, 18), (30, 3), (300, 6), (4, 1)]  # motion, ftr, baton full, baton last, botcoin, trump1, rostr
def match(coins, label):
    px, lh = Q.pop(0); f = lambda c: (np.log(c['mc'].max() / c['mc'][0] / px)) ** 2 + (np.log((P.life_end(c['vol']) / 720 + .05) / (lh + .05))) ** 2
    best = min(coins, key=f); return best, f' (closest sim to ref: peak {px}x, life {lh} h)'
P.match = match
if __name__ == '__main__': P.main()
