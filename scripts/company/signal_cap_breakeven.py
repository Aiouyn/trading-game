#!/usr/bin/env python3
"""Quant, company spec v1.4 (2026-10-09), extended for v1.5 (same day): sections F-I (literal reading) and K-L (G13 cap scope, G14 comparator) added.
v1.6 (same day): sections M-O (backlog lifts by contribution margin; excess non-converted lift repaid at the re-anchor).
v1.7 (same day): sections P-R (G15/G17 allowance on actual NPC cancellations, G16 derivative deltas in S_k, G23 consensus margin from filed unit cost).
Modes: --v14 = A-E (signal_cap_breakeven.out.txt), --v15 = A-L (signal_cap_breakeven.v15.out.txt), --v16 = A-O (signal_cap_breakeven.v16.out.txt), default = A-R (signal_cap_breakeven.v17.out.txt).
Usage: signal_cap_breakeven.py [OUT] [--v14]. --v14 prints only sections A-E, byte-identical to
signal_cap_breakeven.out.txt (the v1.4 log). Without it, A-E are printed unchanged and F-J follow
(v1.5 rules: weekly cap 1.5%, backlog alpha = 1, quarterly carry released at the next weekly signal).
v1.4 docstring follows.
Quant, company spec v1.4 (2026-10-09). Closed-form rerun of v1.3 §6.2 'why faking doesn't pay'
plus the cap_carry_edge carry vs round trip. No engine code is touched; constants mirror
engine-staging/src/engine/{config,trading}.ts: impactY 0.8, stock fee 0.10%/side, 252 d/yr,
halfSpread = spreadBps/2 * volScale, impact = Y * sigma_d * sqrt(notional/ADV)."""
import math, itertools, sys
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
V14_ONLY = '--v14' in sys.argv
V15_ONLY = '--v15' in sys.argv   # prints A-L only, byte-identical to signal_cap_breakeven.v15.out.txt
V16_ONLY = '--v16' in sys.argv   # prints A-O only, byte-identical to signal_cap_breakeven.v16.out.txt

Y, FEE, DPY = 0.8, 0.001, 252
GRID = [i / 10000 * 0.02 for i in range(1, 10001)]   # sell rate x in (0, 2%] of shares out per gd, 1e4 steps

def unit_cost(x, adv, sig, hs, fee):
    return Y * (sig / math.sqrt(DPY)) * math.sqrt(x / adv) + hs + fee

def lift_path(L, W, days=20, every=5):
    """lnV lift on each window day (F+2..F+21). Best case for the faker: a signal on the window's first day,
    each in-window signal adds <= W, cumulative <= L (quarterly cap). W=None: full L from day 1 (v1.3 bound)."""
    if W is None: return [L] * days
    return [min(L, W * (d // every + 1)) for d in range(days)]

def best_profit(path, stake, adv, sig, hs, fee, acct):
    """acct 'v13': v1.3 model, gain L*sold, cost = unit cost*sold + L_end*(stake - sold) (unsold stake takes the reversal).
       acct 'incr': incremental vs not faking and not selling: sum x_d*(L_d - c(x_d)); the unsold stake's lift and reversal net to 0."""
    Lend = path[-1]; tot = 0.0; sold = 0.0
    for Ld in path:
        best, bx = 0.0, 0.0
        for x in GRID:
            if sold + x > stake: break
            v = x * (Ld + (Lend if acct == 'v13' else 0.0) - unit_cost(x, adv, sig, hs, fee))
            if v > best: best, bx = v, x
        tot += best; sold += bx
    if acct == 'v13': tot -= Lend * stake
    return tot, sold

def breakeven(W, stake, adv, sig, hs, fee, acct):
    lo, hi = 0.0, 0.5
    for _ in range(50):
        mid = (lo + hi) / 2
        p, _ = best_profit(lift_path(mid, W), stake, adv, sig, hs, fee, acct)
        (lo, hi) = (mid, hi) if p <= 0 else (lo, mid)
    return hi

def case(sig, flt, turn, hs=0.00125, fee=0.0):
    stake = 1 - flt; adv = turn * flt
    return dict(sig=sig, flt=flt, turn=turn, stake=stake, adv=adv, hs=hs, fee=fee)

out = []
def P(*a):
    s = " ".join(str(v) for v in a); print(s); out.append(s)

P("=== A. Faking break-even (v1.3 model), worst case staples sigma 16%, float 49%, founder 51%, turnover 0.8%, half spread 12.5 bps, no fee ===")
c = case(0.16, 0.49, 0.008)
for W, lab in [(None, 'v1.3 bound: full L all 20 window days (weekly cap irrelevant)'), (0.010, 'ramp, weekly cap 1.0%'), (0.015, 'ramp, weekly cap 1.5%')]:
    be = breakeven(W, c['stake'], c['adv'], c['sig'], c['hs'], c['fee'], 'v13')
    p, sold = best_profit(lift_path(0.025, W), c['stake'], c['adv'], c['sig'], c['hs'], c['fee'], 'v13')
    P(f"  {lab}: break-even L = {be*100:.3f}%  | at L=2.5%: best P&L = {p*100:.4f}% of shares out (x price), sold {sold*100:.2f}%")
cf = case(0.16, 0.49, 0.008, fee=FEE)
for W, lab in [(None, 'v1.3 bound + 0.10% fee'), (0.015, 'ramp 1.5% + 0.10% fee')]:
    be = breakeven(W, cf['stake'], cf['adv'], cf['sig'], cf['hs'], cf['fee'], 'v13')
    P(f"  {lab}: break-even L = {be*100:.3f}%")

P("\n=== B. Sweep (sigma 16-35%, float 15-49%, turnover 0.4-0.8%), v1.3 model, best P&L at L = 2.5% (must be < 0) ===")
worst = {}
for W, lab in [(None, 'v1.3 bound'), (0.015, 'ramp 1.5%')]:
    mx = (-1, None); mn_be = (1, None)
    for sig, flt, turn in itertools.product([0.16, 0.20, 0.25, 0.30, 0.35], [0.15, 0.25, 0.35, 0.49], [0.004, 0.006, 0.008]):
        c = case(sig, flt, turn)
        p, _ = best_profit(lift_path(0.025, W), c['stake'], c['adv'], sig, c['hs'], 0.0, 'v13')
        if p > mx[0]: mx = (p, (sig, flt, turn))
    c = case(*mx[1])
    be = breakeven(W, c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'v13')
    P(f"  {lab}: 60 listings, max P&L at L=2.5% = {mx[0]*100:.4f}% of shares out at sigma/float/turnover {mx[1]}; that listing's break-even L = {be*100:.3f}%")

P("\n=== C. Same price leg, incremental accounting (no reversal charged on the unsold stake), worst case, no fee ===")
for W, lab in [(None, 'v1.3 bound'), (0.010, 'ramp 1.0%'), (0.015, 'ramp 1.5%')]:
    c = case(0.16, 0.49, 0.008)
    p, sold = best_profit(lift_path(0.025, W), c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'incr')
    P(f"  {lab}: best price-leg P&L at L=2.5% = +{p*100:.4f}% of shares out (sold {sold*100:.2f}%) = {p/0.025*100:.1f}% of a 2.5% lift on the whole company")

P("\n=== D. cap_carry_edge: launch doubles backlog -> uncapped forward move J (v1.3: 3.3%), EWMA alpha 0.5, quarterly cap 2.5% ===")
def carry(J, W, Q=0.025, n=8):
    R = 0.0; rows = []
    for k in range(1, n + 1):
        U = J * (1 - 0.5 ** k)
        Rn = min(R + W, U, Q) if W else min(U, Q)
        rows.append((k, U, Rn - R, U - Rn)); R = Rn
    return rows
for J in [0.033, 0.05]:
    for W in [0.010, 0.015]:
        rows = carry(J, W)
        P(f"  J={J*100:.1f}%, weekly cap {W*100:.1f}%: " + "; ".join(f"wk{k}: release {d*100:.3f}% carry {e*100:.3f}%" for k, U, d, e in rows[:5]) + f"; carry held to the close signal = {rows[-1][3]*100:.3f}% (-> {J*100-2.5:.2f}% as weeks pass)")
    P(f"  J={J*100:.1f}%, EWMA lag alone (no cap) predictable next step after wk1 = {0.5*0.5*J*100:.3f}%")

P("\n=== E. Round trip of a small account at a $5B float-cap listing (spread = clamp(25+2000/sqrt(5000),25,200)) ===")
sb = min(200, max(25, 25 + 2000 / math.sqrt(5000)))
P(f"  spreadBps = {sb:.2f}")
for vs, sig in [(1.0, 0.16), (0.9, 0.16), (1.0, 0.35), (0.9, 0.35)]:
    for turn in [0.008, 0.004]:
        adv = turn * 5e9
        row = []
        for N in [1e4, 2.5e5, 1e6]:
            imp = Y * sig * vs / math.sqrt(DPY) * math.sqrt(N / adv)
            rt = sb / 1e4 * vs + 2 * FEE + 2 * imp
            row.append(f"${N/1e3:g}k RT {rt*100:.3f}%")
        P(f"  volScale {vs}, sigma {sig*100:.0f}%, ADV {turn*100:.1f}% of float cap: " + ", ".join(row))

# ---------------------------------------------------------------- v1.5 (sections F-J) ----------------------------------------------------------------
W15, Q15 = 0.015, 0.025

def release15(Us, W=W15, Q=Q15):
    """v1.5 forward release rule, one call per weekly signal since the last filing. Us[k] = uncapped forward lnV move
    (alpha = 1: the latest bias-corrected report, cumulative from the last filing). Ceiling at signal k = max(Q, U_{k-1}),
    floor = min(-Q, U_{k-1}): new forward news beyond +-2.5% is held one signal; what was already public at the previous
    signal may be released, paced by the weekly cap W. Returns rows (U, release, R cumulative, total carry U-R, quarterly-held part)."""
    R = 0.0; Up = 0.0; rows = []
    for U in Us:
        hi, lo = max(Q, Up), min(-Q, Up)
        tgt = min(max(U, lo), hi)
        d = max(-W, min(W, tgt - R))
        R += d; rows.append((U, d, R, U - R, U - tgt)); Up = U
    return rows

def rt_table():
    sb = min(200, max(25, 25 + 2000 / math.sqrt(5000))); rts = {1e4: [], 2.5e5: [], 1e6: []}
    for vs, sig in [(1.0, 0.16), (0.9, 0.16), (1.0, 0.35), (0.9, 0.35)]:
        for turn in [0.008, 0.004]:
            adv = turn * 5e9
            for N in rts:
                rts[N].append(sb / 1e4 * vs + 2 * FEE + 2 * Y * sig * vs / math.sqrt(DPY) * math.sqrt(N / adv))
    return {N: (min(v), max(v)) for N, v in rts.items()}

def window_path15(L, o, W=W15, days=20):
    """Front-loaded fake (U = L from the first signal after the filing re-anchor). Window day 0 = F+2. Signals on days d = o (mod 5),
    d >= -2 (a signal on F itself counts, after the filing; worst case). Returns lnV lift on each window day."""
    sig_days = [d for d in range(-2, days) if (d - o) % 5 == 0]
    rows = release15([L] * len(sig_days), W)
    return [next((rows[i][2] for i in reversed(range(len(sig_days))) if sig_days[i] <= d), 0.0) for d in range(days)]

def breakeven15(o, stake, adv, sig, hs, fee, acct, W=W15):
    lo, hi = 0.0, 0.5
    for _ in range(50):
        mid = (lo + hi) / 2
        p, _ = best_profit(window_path15(mid, o, W), stake, adv, sig, hs, fee, acct)
        (lo, hi) = (mid, hi) if p <= 0 else (lo, mid)
    return hi

def v15():
    RT = rt_table()
    P("\n=== F. v1.5-lit (literal reading: cap on ALL backlog change since the last filing; superseded for backlog by G13, rule kept for unbacked parts) release path: alpha = 1, weekly cap 1.5%, quarterly cap 2.5% with its carry released at the NEXT weekly signal (ceiling = max(2.5%, previous U)) ===")
    for J in [0.033, 0.05]:
        rows = release15([J] * 6)
        P(f"  J={J*100:.1f}% launch at signal 1: consensus step at the launch signal = {rows[0][0]*100:.3f}% (v1.4 EWMA a=0.5: {0.5*J*100:.3f}%); "
          + "; ".join(f"wk{k+1}: release {r[1]*100:.3f}% carry {r[3]*100:.3f}% (quarterly-held {r[4]*100:.3f}%)" for k, r in enumerate(rows[:4]))
          + f"; fully released at wk{next(k+1 for k, r in enumerate(rows) if r[3] < 1e-12)}")
    rows = release15([0.02, 0.02, 0.04, 0.04, 0.04])
    P("  Two launches (U 2.0% at wk1, 4.0% from wk3), shows the quarterly cap binding: " + "; ".join(f"wk{k+1}: release {r[1]*100:.3f}% cum {r[2]*100:.3f}% quarterly-held {r[4]*100:.3f}%" for k, r in enumerate(rows)))

    P("\n=== G. v1.5-lit cap_carry_edge, hold-to-close bot (buys after the launch signal, holds until the carry is released; v1.4: until the close signal) vs round trip at $5B ===")
    for N, (a, b) in RT.items():
        P(f"  round trip ${N/1e3:g}k: {a*100:.3f}%-{b*100:.3f}% (section E range)")
    for J in [0.033, 0.05]:
        r15 = release15([J] * 6); c15 = r15[0][3]
        r14 = carry(J, 0.015); c14 = J - r14[0][2]; q14 = r14[-1][3]   # v1.4: everything not yet in lnV after wk1 (EWMA lag + caps) is in lnV by the close; q14 = quarterly-cap part held to the close
        nxt = r15[1][1]
        P(f"  J={J*100:.1f}%: carry after the launch signal v1.5 = {c15*100:.3f}% (released by wk{next(k+1 for k, r in enumerate(r15) if r[3] < 1e-12)}; next signal alone releases {nxt*100:.3f}%), v1.4 (EWMA lag + caps, all in lnV by the close signal) = {c14*100:.3f}%, of which held by the quarterly cap to the close = {q14*100:.3f}%")
        for N, (a, b) in RT.items():
            P(f"    vs ${N/1e3:g}k RT: gross carry - RT = {(c15-b)*100:+.3f}% (dearest bucket) to {(c15-a)*100:+.3f}% (cheapest) -> {'FAIL in every bucket' if c15 > b else ('PASS in every bucket' if c15 <= a else 'FAIL in some buckets')}; hold-to-next-signal only: {(nxt-b)*100:+.3f}% to {(nxt-a)*100:+.3f}%")
        P(f"    weekly cap needed for carry <= cheapest $10k RT ({RT[1e4][0]*100:.3f}%): W >= {(J-RT[1e4][0])*100:.3f}%")
    for J in [0.0165, 0.025]:
        r = release15([J] * 4)
        P(f"  contingency w_b 0.25 (launch J halves to {J*100:.2f}%): carry after the launch signal = {r[0][3]*100:.3f}%")

    P("\n=== H. v1.5-lit faking (front-loaded fake; the quarterly cap never binds on it because W < 2.5% and the ceiling then rises to U) ===")
    c = case(0.16, 0.49, 0.008); cf = case(0.16, 0.49, 0.008, fee=FEE)
    reach = {o: window_path15(1.0, o)[-1] for o in range(5)}
    P("  max lift reachable by window day 20 per signal alignment o (window day of the first in-window signal): " + ", ".join(f"o={o}: {v*100:.2f}%" for o, v in reach.items()))
    ow = max(reach, key=lambda o: (reach[o], -o))
    for o, lab in [(0, 'o=0 (v1.4 ramp model)'), (ow, f'o={ow} (worst alignment)')]:
        p13, s13 = best_profit(window_path15(0.025, o), c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'v13')
        pin, sin = best_profit(window_path15(0.025, o), c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'incr')
        be = breakeven15(o, c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'v13'); bef = breakeven15(o, cf['stake'], cf['adv'], cf['sig'], cf['hs'], FEE, 'v13')
        P(f"  {lab}: at L=2.5%: v1.3-model P&L {p13*100:.4f}% of shares out (sold {s13*100:.2f}%), shares-sold-only {pin*100:+.4f}% (sold {sin*100:.2f}%); break-even L = {be*100:.3f}% ({bef*100:.3f}% with fee)")
        best = (-9, None, None)
        for L in [0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06, 0.065, 0.07, 0.075]:
            if L > reach[o] + 1e-12: break
            p, s = best_profit(window_path15(L, o), c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'v13')
            if p > best[0]: best = (p, L, s)
        pin, sin = best_profit(window_path15(reach[o], o), c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'incr')
        P(f"    best v1.3-model P&L over reachable L (<= {reach[o]*100:.2f}%) = {best[0]*100:+.4f}% at L = {best[1]*100:.2f}% (sold {best[2]*100:.2f}%); shares-sold-only at L = {reach[o]*100:.2f}%: {pin*100:+.4f}% (sold {sin*100:.2f}%)")
    pb, sb_ = best_profit([0.025] * 20, c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'v13')
    pbi, _ = best_profit([0.025] * 20, c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'incr')
    pbx, _ = best_profit([reach[ow]] * 20, c['stake'], c['adv'], c['sig'], c['hs'], 0.0, 'v13')
    P(f"  v1.3 bound (full L all 20 days): L=2.5%: {pb*100:.4f}% (shares-sold-only {pbi*100:+.4f}%), break-even 2.685% (section A); at L={reach[ow]*100:.2f}%: {pbx*100:+.4f}%")
    P("  sweep, 60 listings (section B grid), best v1.3-model P&L at worst alignment over L in {2.5%, 4%, 5%, 6%, reach}:")
    mx = (-9, None, None); neg25 = 0
    for sig, flt, turn in itertools.product([0.16, 0.20, 0.25, 0.30, 0.35], [0.15, 0.25, 0.35, 0.49], [0.004, 0.006, 0.008]):
        cc = case(sig, flt, turn)
        for L in sorted({0.025, 0.04, 0.05, 0.06, reach[ow]}):
            p, _ = best_profit(window_path15(L, ow), cc['stake'], cc['adv'], sig, cc['hs'], 0.0, 'v13')
            if L == 0.025 and p < 0: neg25 += 1
            if p > mx[0]: mx = (p, L, (sig, flt, turn))
    P(f"    P&L < 0 at L=2.5% in {neg25}/60; max over reachable L = {mx[0]*100:+.4f}% of shares out at L={mx[1]*100:.2f}%, listing sigma/float/turnover {mx[2]}")

    P("\n=== I. Noise, re-anchor and filing surprise under alpha = 1 (sens = m*w_b/(4n) = 0.5*0.5/0.6, backlog = 5/63 of Rev_q, sigma_sig 0.04) ===")
    sens, B, ss = 0.5 * 0.5 / (4 * 0.15), 5 / 63, 0.04
    for a in [0.5, 1.0]:
        wk = sens * B * ss * a * math.sqrt(2 / (2 - a)); cl = sens * B * ss * math.sqrt(a / (2 - a))
        P(f"  alpha {a}: weekly forward dlnV noise sd = {wk*100:.4f}% (1.5% cap = {0.015/wk:.1f} sd); close-consensus backlog error -> re-anchor sd = {cl*100:.4f}% of lnV; rho contribution at sigma_Q 0.10 = {cl/0.10:.4f}")
    a5 = sens * B * ss * math.sqrt(1 / 3) / 0.10; a1 = sens * B * ss / 0.10
    P(f"  if v1.4 rho = 0.150 exactly, v1.5 rho = {math.sqrt(0.15**2 - a5**2 + a1**2):.4f}; at the 0.25 ceiling: {math.sqrt(0.25**2 - a5**2 + a1**2):.4f}")
    for J in [0.033, 0.05]:
        P(f"  launch J={J*100:.1f}% k signals before the close: predictable re-anchor (EWMA lag at the close) v1.4 = " + ", ".join(f"k={k}: {J*0.5**k*100:.3f}%" for k in [1, 2, 3]) + "; v1.5 (alpha 1) = 0 for every k")

def path_v14(J, W=0.015, Q=0.025, n=12):
    """v1.4 rules: EWMA alpha 0.5 on backlog, weekly cap W, quarterly cap Q, quarterly excess held to the close signal (uncapped)."""
    return carry(J, W, Q, n)

def v15_g13_g14():
    RT = rt_table()
    P("\n=== K. G13 cap scope. Three rule sets, launch J at signal 1, bots at a $5B listing (round trips from section E) ===")
    P("  v1.4 = alpha 0.5, all forward parts capped (1.5%/wk, 2.5%/qtr held to the close). v1.5-lit = alpha 1, weekly cap on ALL backlog change since the last filing, quarterly carry released next signal (sections F-G).")
    P("  v1.5 (G13) = alpha 1, backed backlog (real NPC orders in the weekly band, verifiable against the filed backlog field) uncapped; caps only on unbacked parts (hiring is cost-only, so only downward; utilization does not enter V).")
    for J in [0.033, 0.05]:
        r14 = path_v14(J)
        lag14 = r14[1][2]                                   # week-2 release = EWMA lag + weekly carry released
        Ub = next(i for i, r in enumerate(r14) if r[1] - (sum(x[2] for x in r14[:i+1])) > 1e-12 and sum(x[2] for x in r14[:i+1]) >= 0.025 - 1e-12) if J > 0.025 else None
        h14 = r14[-1][3]                                    # carry still held at the last in-quarter signal -> released by the uncapped close signal
        r15 = release15([J] * 6)
        lag15, h15 = r15[1][1], r15[0][3]
        lagG, hG = 0.0, 0.0                                 # backed backlog passes in full at the launch signal: nothing deferred
        P(f"  J={J*100:.1f}%: (i) lag-aware next-signal gross: v1.4 {lag14*100:.3f}% | v1.5-lit {lag15*100:.3f}% | v1.5 (G13) {lagG*100:.3f}%;  (ii) hold-to-close gross: v1.4 {h14*100:.3f}% (enters when the 2.5% cap binds, wk{Ub+1}) | v1.5-lit {h15*100:.3f}% (enters after wk1) | v1.5 (G13) {hG*100:.3f}%")
        for N, (a, b) in RT.items():
            def verdict(g): return 'FAIL all' if g > b else ('PASS all' if g <= a else 'FAIL some')
            P(f"    ${N/1e3:g}k RT {a*100:.3f}-{b*100:.3f}%: (i) v1.4 {verdict(lag14)}, v1.5-lit {verdict(lag15)}, v1.5 {verdict(lagG)};  (ii) v1.4 {verdict(h14)}, v1.5-lit {verdict(h15)}, v1.5 {verdict(hG)}")

    P("\n=== L. G14 faking vs the honest founder who sells the SAME schedule (impact, spread and the unsold stake cancel): gain = sum_d x_d * L_d, before the cost of producing the fake ===")
    c = case(0.16, 0.49, 0.008)
    def sched(path):  # faker's own best schedule from section C accounting (sum x(L - cost)), then the twin copies it
        xs = []; sold = 0.0
        for Ld in path:
            best, bx = 0.0, 0.0
            for x in GRID:
                if sold + x > c['stake']: break
                v = x * (Ld - unit_cost(x, c['adv'], c['sig'], c['hs'], 0.0))
                if v > best: best, bx = v, x
            xs.append(bx); sold += bx
        return xs
    def gain(path, xs): return sum(x * L for x, L in zip(xs, path)), sum(xs)
    cases = [('v1.4 bound (full 2.5% all 20 days)', [0.025] * 20), ('v1.4 ramp 1.5%/wk to 2.5%', lift_path(0.025, 0.015)),
             ('v1.5-lit, L=2.5%, o=0', window_path15(0.025, 0)), ('v1.5-lit, reachable 6.0%, o=0', window_path15(0.06, 0)), ('v1.5-lit, reachable 7.5%, o=3', window_path15(0.075, 3)),
             ('v1.5 (G13) backed backlog uncapped, L=2.5% from day 1', [0.025] * 20), ('v1.5 (G13), L=5%', [0.05] * 20), ('v1.5 (G13), L=10%', [0.10] * 20)]
    for lab, path in cases:
        g, sold = gain(path, sched(path)); gm, sm = gain(path, [0.02] * 20)
        P(f"  {lab}: faker's own best schedule: gain {g*100:.4f}% of shares out (sold {sold*100:.2f}%, = L x {g/path[-1]*100:.1f}%); max schedule 2%/gd x 20: gain {gm*100:.4f}% (sold {sm*100:.0f}%)")
    P("  break-even production cost = the gain above, as % of mcap. Per 1% of shares sold by a planTimed plan on lifted days: gain = L x 1% (no impact difference).")
    sens = 0.5 * 0.5 / (4 * 0.15)
    for evs in [1.0, 2.0, 4.0]:
        mcap_rq = 4 * evs                                   # mcap / Rev_q, net debt 0
        for sold in [0.23, 0.40]:
            k = sold * sens * mcap_rq                       # gain sold*L*mcap; fake backlog needed dB = L/sens * Rev_q
            P(f"  backed-backlog fake (G13, uncapped): EV/S {evs:g}, sold {sold*100:.0f}%: faking pays unless producing $1 of fake backlog costs more than ${k:.2f} (scale-free in L)")
    P("  contingency w_b 0.25: sens halves, so the backlog needed per point of lift doubles and the $ thresholds above halve.")

# ---------------------------------------------------------------- v1.6 (sections M-O) ----------------------------------------------------------------
SECTORS = [('software', 0.80, 0.02), ('pharma', 0.70, 0.04), ('food', 0.35, 0.03), ('consumer', 0.45, 0.05), ('industrial', 0.25, 0.06), ('security', 0.40, 0.03)]
WB, NM = 0.5, 0.15    # backlog weight w_b, reference net margin n (sens per $ of contribution backlog = w_b / (4 n) per Rev_q, section I's model)

def v16():
    P("\n=== M. v1.6 rule (a): backlog lifts lnV by its contribution (price - variable cost), not revenue x TTM gross margin. Lift per $1 of LIST-PRICE volume (units x list price), in units of 1/Rev_q ===")
    for name, m, cb in SECTORS:
        cm30 = (0.7 - (1 - m)) / 0.7          # order booked at -30% price, variable cost unchanged, per $ of order revenue
        v15l, v16list, v16cut = m * WB / (4 * NM), WB * m / (4 * NM), WB * (0.7 - (1 - m)) / (4 * NM)   # -30%: revenue 0.7 per list $, contribution 0.7 - (1 - m)
        P(f"  {name:10s} (gross margin {m*100:.0f}%): list-price order: v1.5 {v15l:.4f}, v1.6 {v16list:.4f} | order at -30%: cm {cm30*100:+.1f}% of its revenue, v1.5 {v15l*0.7:.4f} (lifted at TTM margin), v1.6 {v16cut:+.4f} ({'adds nothing or subtracts' if cm30 <= 0 else f'{v16cut/(v15l*0.7)*100:.0f}% of v1.5'})")

    P("\n=== N. v1.6 rule (b): faker vs honest same-schedule seller, after repaying the excess non-converted lift. Fake backlog never ships; NPC cancels exactly c_s of every order (deterministic), so excess = (1 - c_s) x the fake's lift ===")
    P("  per-sector base rate c_s (proposed, tunable): " + ", ".join(f"{n} {cb*100:.0f}%" for n, m, cb in SECTORS))
    for cb in [0.02, 0.06]:
        for L in [0.025, 0.05, 0.10]:
            row = []
            for sold in [0.40, 0.23]:
                gross = L * sold; repay = (1 - cb) * L * sold; net = gross - repay
                row.append(f"sold {sold*100:.0f}%: gross {gross*100:.3f}%, repay {repay*100:.3f}%, net {net*100:.4f}%")
            P(f"  c_s {cb*100:.0f}%, lift L={L*100:.1f}%: " + " | ".join(row) + " (% of shares out x price, before production cost)")
    P("  break-even production cost per $1 of fake backlog (faking pays only if producing $1 of fake backlog costs less): gross = sold*w_b*cm*EVS/n; v1.6 net = c_s x gross")
    for evs in [1.0, 2.0, 4.0]:
        for cm in [0.20, 0.40]:
            parts = []
            for sold in [0.23, 0.40]:
                g = sold * WB * cm * evs / NM
                parts.append(f"sold {sold*100:.0f}%: rule (a) only ${g:.3f}, (a)+(b) c_s 2% ${0.02*g:.4f}, c_s 6% ${0.06*g:.4f}")
            P(f"  EV/S {evs:g}, cm {cm*100:.0f}%: " + " | ".join(parts))
    g15 = 0.40 * WB * 0.5 * 4.0 / NM
    P(f"  (v1.5 reference, same formula with TTM m = 50%, EV/S 4, sold 40%: ${g15:.3f}; section L printed $2.67)")
    P("  contingency w_b 0.25: every $ figure above halves (the lift per $ halves, the repayment rule is unchanged).")

    P("\n=== O. Honest founders: repayment from non-conversion above the base rate. Reference: mcap $5B, EV/S 2 (Rev_q $625M), cm 40%, consumer c_s 5%, founder sold 2% of shares after the signals ===")
    mcap, evs, cm, cb, soldf = 5e9, 2.0, 0.40, 0.05, 0.02
    lh = WB * cm / (4 * NM)               # gross reported lift of a quarter's bookings (bookings ~ Rev_q), ln units
    P(f"  gross reported backlog lift of the quarter's orders = {lh*100:.2f}% (each order lifts when reported, unwinds when it ships)")
    for extra in [0.0, 0.005, 0.01, 0.02]:
        rate = cb + extra
        X = max(0.0, rate * lh - cb * lh)
        repay = X * soldf * mcap
        P(f"  non-conversion {rate*100:.1f}% (base {cb*100:.0f}% + {extra*100:.1f} pts): excess lift {X*100:.3f}%, repayment ${repay/1e3:,.0f}k = {repay/(soldf*mcap)*100:.3f}% of the ${soldf*mcap/1e6:,.0f}M sold")

# ---------------------------------------------------------------- v1.7 (sections P-R) ----------------------------------------------------------------
def v17():
    P("\n=== P. v1.7 G15 + G17: orders are booked only within capacity (no free overflow); the allowance is the NPC share ACTUALLY cancelled (a = floor(c_s q)/q per order of q units), not c_s. Faker keeps a x L x sold ===")
    for name, m, cb in SECTORS:
        row = []
        for q in [10, 30, 60, 260, 1000]:
            a = math.floor(cb * q) / q
            row.append(f"q {q}: a {a*100:.2f}% (v1.6.1 allowance {cb*100:.0f}%), keep at L=10%, 40% sold {a*0.10*0.40*100:.4f}% (v1.6.1 {cb*0.10*0.40*100:.4f}%)")
        P(f"  {name:10s}: " + " | ".join(row))
    P("  G15: demand above capacity is never booked, so a 'free overflow' fake has nothing to book: lift 0, keep 0 (v1.6.1: c_s x L x sold, up to 0.240% of mcap per quarter at L=10%, industrial, 40% sold).")
    P("\n=== Q. v1.7 G16: S_k = stock sold + net short delta (futures delta + options delta on the stock) opened in the window. Founder who sells no stock and shorts delta D (% of shares out) at lift L, NPC allowance a ===")
    for L in [0.025, 0.05, 0.10]:
        row = []
        for a in [0.02, 0.06]:
            X = max(0.0, L - a * L)              # fake never ships: excess lift above the allowance
            for D in [0.05, 0.20]:
                gain = L * D; repay = (1 - math.exp(-X)) * D
                row.append(f"a {a*100:.0f}%, D {D*100:.0f}%: gain {gain*100:.3f}%, v1.6.1 repay 0 -> v1.7 repay {repay*100:.3f}%, net {(gain-repay)*100:+.4f}%")
        P(f"  L={L*100:.1f}%: " + " | ".join(row))
    P("  (net is c_s-sized like section N; e^-X makes the repayment slightly smaller than (1 - a) L D; % of shares out x price, before costs)")
    P("\n=== R. v1.7 G23: consensus margin = filed unit cost x public prices. Price push -30% with NPC logit demand (c 2, share 0.25 -> demand x1.6194), all shipped: consensus GP vs base GP ===")
    e = math.exp(-2.0 * math.log(0.7)); mult = e / (1 - 0.25 + 0.25 * e)
    for name, m, cb in SECTORS:
        gp_uc = mult * (0.7 - (1 - m)) / m          # G23: units x (public price - filed unit cost)
        gp_pct = mult * 0.7                         # v1.6.1 reading M%: revenue x last filed margin %
        P(f"  {name:10s} (m {m*100:.0f}%): demand x{mult:.4f}; consensus GP ratio v1.6.1 (filed margin %) {gp_pct:.4f} -> v1.7 (unit cost) {gp_uc:+.4f}; lnV move at eR 1: {math.log(gp_pct)*100:+.2f}% -> {('%+.2f%%' % (math.log(gp_uc)*100)) if gp_uc > 0 else 'GP <= 0 (no lift)'}")

if not V14_ONLY:
    v15()
    v15_g13_g14()
    if not V15_ONLY:
        v16()
        if not V16_ONLY:
            v17()
open(ARGS[0] if ARGS else '/tmp/signal_cap_breakeven.out', 'w').write("\n".join(out) + "\n")
