#!/usr/bin/env python3
"""
Tape's independent harness for Quant spec v1.6.1 backlog rules (MODELLED: no company engine exists).
Written from the spec text (§2 npcCancelRate, §5 CB term, §6.2 reversal/repayment), not from Quant's script.
  N  faker vs honest same-schedule seller after repayment (c_s x L x sold), break-even $ per $1 fake backlog
  P  production cost per $1 of fake backlog by mechanism, 200 seeds per sector, net faker - honest
  O  honest repayment examples + honest capacity-bound charge risk under random sector demand (200 seeds x 8 q)
  R  floor() rounding slack in npc_cancel_deterministic by order size
  B  escape channels outside S_k: non-covered short / derivative hedge, net of RT at $5B
"""
import math, numpy as np
pct = lambda x: f"{100*x:.4f}%"
CS = {'software': (0.02, 0.80), 'pharma': (0.04, 0.70), 'food': (0.03, 0.35), 'consumer': (0.05, 0.45), 'industrial': (0.06, 0.25), 'security': (0.03, 0.40)}
WB, N_ = 0.5, 0.15
print("=== N. Faker keeps c_s x L x sold after repayment (fake never ships; same-schedule honest twin) ===")
for L in (0.025, 0.05, 0.10):
    print(f"  L={L*100:.1f}%: 40% sold {pct(0.02*L*0.4)}-{pct(0.06*L*0.4)} | 23% sold {pct(0.02*L*0.23)}-{pct(0.06*L*0.23)}   (c_s 2-6%)")
print("  break-even production cost per $1 fake backlog = c_s * sold * w_b * cm * EVS / n:")
for evs in (1, 2, 4):
    cells = []
    for cm in (0.2, 0.4):
        lo = 0.02 * 0.23 * WB * cm * evs / N_; hi = 0.06 * 0.40 * WB * cm * evs / N_
        cells.append(f"cm {cm:.0%}: ${lo:.4f}-${hi:.4f}")
    print(f"    EV/S {evs}: " + " | ".join(cells))
print("  rule (a) alone (no repayment, c_s -> 1): " + f"${0.23*WB*0.2*1/N_:.3f}-${0.40*WB*0.4*4/N_:.3f}")
# honest example (Quant §O)
print("  honest example $5B, consumer c_s 5%, gross reported lift 33.33%, $100M sold after the signals:")
for nc in (0.05, 0.055, 0.06, 0.07):
    X = max(0.0, nc - 0.05) * 0.3333
    print(f"    non-conversion {nc*100:.1f}%: excess lift {pct(X)}, repayment ${1e8*(1-math.exp(-X))/1e3:,.1f}k")

print("\n=== P. Production cost per $1 of fake backlog vs break-even, by mechanism (per sector, EV/S 1-4 U, sold 23-40% U, 200 seeds) ===")
print("  mechanisms: refuse-to-ship real list orders (lose cm, keep ~4% Ops wage); price push -30% (rule a: lift by cm at 0.7p); lapse overflow demand that the honest twin serves (lose cm - 4% capacity cost); free overflow (honest twin can't serve either: cost ~0)")
rng = np.random.default_rng(16)
for s, (cs, m) in CS.items():
    res = {'refuse': [], 'push30': [], 'overflow': [], 'free': []}
    for _ in range(200):
        evs = rng.uniform(1, 4); sold = rng.uniform(0.23, 0.40)
        gain_per_cm = cs * sold * WB * evs / N_            # gain per $1 of contribution backlog, as $ of mcap per $
        # refuse-to-ship at list: cm = m; cost = m - 0.04 (Ops wages saved)
        res['refuse'].append(gain_per_cm * m - (m - 0.04))
        # push -30%: cm = 0.7 - (1 - m) per $ list = per 0.7$ booked; cost = discount on the base book is not needed if fake
        cm30 = (0.7 - (1 - m)) / 0.7                         # contribution per $ booked
        res['push30'].append(gain_per_cm * max(cm30, 0) * 1.0 - 0.0 if cm30 > 0 else gain_per_cm * cm30)  # booked never ships: no revenue lost; lift may be <0
        res['overflow'].append(gain_per_cm * m - (m - 0.04))
        res['free'].append(gain_per_cm * m)
    line = []
    for k, v in res.items():
        v = np.array(v); line.append(f"{k} net {v.mean():+.4f} $/$ (faker>honest {np.mean(v>0):.2f})")
    print(f"  {s:10s} c_s {cs:.0%} m {m:.0%}: " + "; ".join(line))
print("  note: push30 'never ships' booked orders cost nothing extra only if NPC demand at -30% appears without cutting the price of shipped units (separate order book); if the list price itself is cut, every shipped unit loses 30% of price: cost >> break-even.")
print("  free-overflow keeps c_s x lift: best sector by $ of mcap per $ of fake backlog = c_s x cm: " + ", ".join(f"{s} {cs*m*100:.2f}%" for s, (cs, m) in sorted(CS.items(), key=lambda x: -x[1][0]*x[1][1])))
print("  best sector at a fixed lift L: highest c_s = industrial 6% -> 0.240% of mcap per quarter at L=10%, 40% sold; L is not capped (backed backlog uncapped): L=30% -> " + pct(0.06*0.30*0.40))

print("\n=== O. Honest capacity-bound charge risk (sector demand factor, regimes; founder adds Ops when U>0.95 for 5 gd: 3 gd fill + 5 gd ramp; FIFO ship, ship-by 63 gd) ===")
def honest(seed, U0, overflow_books, cs, react=True):
    r = np.random.default_rng(seed)
    cap = 1.0 / U0; queue = []  # [age, qty]
    charges = []; dem_lvl = 0.0
    hire_pipe = []
    for q in range(8):
        booked = 0.0; nonconv = 0.0
        for d in range(63):
            dem_lvl += r.normal(0, 0.25 / math.sqrt(252)) * 0.5 * 2  # kappa_D 0.5 on a sector factor with ~50%/yr vol incl. regimes (conservative)
            if r.random() < 1 / 126: dem_lvl += r.choice([-0.10, 0.04, -0.03])  # regime multipliers
            D = math.exp(dem_lvl)
            if overflow_books: queue.append([0, D]); booked += D
            else:
                take = min(D, cap * 1.15); queue.append([0, take]); booked += take
            ship = cap * 1.15
            for o in queue:
                x = min(ship, o[1]); o[1] -= x; ship -= x
                if ship <= 0: break
            for o in queue: o[0] += 1
            nonconv += sum(o[1] for o in queue if o[0] > 63)
            queue = [o for o in queue if o[1] > 1e-12 and o[0] <= 63]
            # founder reaction
            if react and D / cap > 0.95:
                hire_pipe.append(d + 8)
            if hire_pipe and hire_pipe[0] <= d:
                cap *= 1.05; hire_pipe = [h for h in hire_pipe if h > d][:1]
        rate = nonconv / booked if booked else 0
        charges.append(rate)
    return charges
for U0 in (0.85, 0.95, 1.05):
    for ob in (False, True):
        rates = np.array([honest(s, U0, ob, 0.05) for s in range(200)])
        print(f"  start utilization {U0:.2f}, overflow {'booked as orders' if ob else 'lost (orders only up to 1.15 cap)'}: company non-conversion > 0 in {np.mean(rates>1e-9):.3f} of quarters; mean {pct(rates.mean())}, p99 {pct(np.percentile(rates,99))}")

print("\n=== R. floor(c_s * qty) rounding: actual NPC share vs the c_s allowance (slack = free company non-conversion) ===")
for s, (cs, m) in CS.items():
    row = []
    for q in (10, 30, 60, 260, 1000):
        actual = math.floor(cs * q) / q
        row.append(f"qty {q}: NPC {actual*100:.2f}% slack {(cs-actual)*100:.2f}pt")
    print(f"  {s:10s} c_s {cs:.0%}: " + "; ".join(row))

print("\n=== B. Channels outside S_k ($5B listing, RT from §6.2 formula; gain = L x notional, never repaid) ===")
def rt(fc, N, sigma, advf, vs=1.0): return vs * min(max(25 + 2000 / math.sqrt(fc / 1e6), 25), 200) / 1e4 + 0.002 + 2 * 0.8 * sigma / math.sqrt(252) * math.sqrt(N / (advf * fc))
for L in (0.025, 0.05, 0.10):
    row = []
    for Nn in (1e4, 2.5e5, 1e6, 2.5e7):
        lo = L - max(rt(5e9, Nn, s, a, v) for s in (0.16, 0.35) for a in (0.004, 0.008) for v in (0.9, 1.0))
        hi = L - min(rt(5e9, Nn, s, a, v) for s in (0.16, 0.35) for a in (0.004, 0.008) for v in (0.9, 1.0))
        row.append(f"${Nn/1e3:,.0f}k net {pct(lo)}..{pct(hi)} (${lo*Nn/1e3:,.1f}k..${hi*Nn/1e3:,.1f}k)")
    print(f"  L={L*100:.1f}% short-at-lift / cover-after-reanchor by a non-covered friend: " + "; ".join(row))
print("  0.5%-of-ADV backstop threshold at $5B (ADV 0.4-0.8% of float cap = $20-40M): $100k-$200k per account; a $1M short split over 10 friends stays under it.")
