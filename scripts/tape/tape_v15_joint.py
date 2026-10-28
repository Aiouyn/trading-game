#!/usr/bin/env python3
"""
Tape's independent harness for Quant company spec v1.5 (MODELLED: no company engine exists).
Written from the spec text, not from Quant's script. Sections:
  RT  round trips at $50M / $500M / $5B float-cap listings for $10k / $250k / $1M / $25M (spec §6.2 formula)
  J   signal_joint_v15: weekly signals, v1.4 vs v1.5 consensus rules, bots, reanchor_public_edge, rho band (200 seeds x 8 q)
  F   signal_fake_ev: faker vs honest founder selling the SAME schedule, 200 seeds, net of production cost
Usage: python3 tape_v15_joint.py [--seeds 200] [--print0 0.5] [--closeshare 0.9] [--d1share 1.0] [--wb 0.5]
"""
import argparse, math
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--seeds', type=int, default=200)
ap.add_argument('--print0', type=float, default=0.5, help='share of a signal step printed at the signal tick')
ap.add_argument('--closeshare', type=float, default=0.9, help='share in the price at the close of the signal day')
ap.add_argument('--d1share', type=float, default=1.0, help='share in the price at the close of the next day')
ap.add_argument('--wb', type=float, default=0.5)
ap.add_argument('--eR', type=float, default=1.0, help='elasticity of lnV to the consensus revenue estimate')
ap.add_argument('--sig_wc', type=float, default=0.03, help='sd of unobserved working-capital swing, share of Rev_q')
ap.add_argument('--sig_u', type=float, default=0.01, help='sd of unobserved cost surprise, share of Rev_q')
ap.add_argument('--sigB', type=float, default=0.04)
ap.add_argument('--sigR', type=float, default=0.02)
ap.add_argument('--b0max', type=float, default=15, help='base backlog upper bound, gd of sales')
ap.add_argument('--persistent_noise', action='store_true', help='lever: one noise draw per component per quarter')
A = ap.parse_args()
pct = lambda x: f"{100*x:.3f}%"

# ---------------------------------------------------------------- RT
FEE = 0.001
def spread_bps(fc): return min(max(25 + 2000 / math.sqrt(fc / 1e6), 25), 200)
def rt(fc, N, sigma, advfrac, vs):
    sd = sigma / math.sqrt(252)
    return vs * spread_bps(fc) / 1e4 + 2 * FEE + 2 * 0.8 * sd * math.sqrt(N / (advfrac * fc))
BUCKETS = [50e6, 500e6, 5e9]; SIZES = [1e4, 2.5e5, 1e6, 2.5e7]
print("=== RT. Round trip (spread x volScale + 0.10%/side + 2 x 0.8 sd sqrt(N/ADV)); range over sigma 16-35%, ADV 0.4-0.8% of float cap, volScale 0.9-1.0 ===")
RTR = {}
for fc in BUCKETS:
    row = []
    for N in SIZES:
        vals = [rt(fc, N, s, a, v) for s in (0.16, 0.35) for a in (0.004, 0.008) for v in (0.9, 1.0)]
        RTR[(fc, N)] = (min(vals), max(vals)); row.append(f"${N/1e3:,.0f}k {pct(min(vals))}-{pct(max(vals))}")
    print(f"  float cap ${fc/1e6:,.0f}M (spread {spread_bps(fc):.1f} bps): " + " | ".join(row))

# ---------------------------------------------------------------- J
rng = np.random.default_rng(20261009)
SIG_B, SIG_R = A.sigB, A.sigR
SIGDAYS = list(range(5, 61, 5)) + [63]          # 12 in-quarter weekly signals + the close signal
NQ = 8
def run_joint(rules, seeds):
    r = np.random.default_rng(777)  # identical draws for both rule sets
    trades = {k: [] for k in ('carry', 'lag', 'lagR', 'lagB', 'lagC', 'hold', 'postprint', 'reanchor')}
    rhos = []
    for sd in range(seeds):
        m = r.choice([0.8, 0.7, 0.35, 0.45, 0.25, 0.4]); n = 0.15; sens = m * A.wb / (4 * n)
        b0 = r.uniform(3, A.b0max) / 63
        sigma = r.uniform(0.16, 0.35); advf = r.uniform(0.004, 0.008); vs = r.uniform(0.9, 1.0)
        Rev_prev = 1.0; B_prev = b0; OCF_prev = 0.12
        sf, sq = [], []
        for q in range(NQ):
            g = r.normal(0.015, 0.06); Rev = Rev_prev * math.exp(g)
            daily = Rev / 63 * np.exp(r.normal(0, 0.03, 63)); daily *= Rev / daily.sum()
            # true backlog path (share of Rev_prev units), base drift + launch
            Bpath = np.empty(64); Bpath[0] = B_prev
            base = b0 * Rev
            launch_day, J = None, 0.0
            if r.random() < 0.5:
                launch_day = int(r.integers(3, 58)); J = r.choice([0.02, 0.033, 0.05, 0.08])
            for d in range(1, 64):
                Bpath[d] = Bpath[d-1] + 0.05 * (base - Bpath[d-1]) + r.normal(0, 0.01 * base)
                if launch_day is not None and d == launch_day: Bpath[d] += J / sens * Rev_prev
            # unbacked hiring (cost-only, downward): lnV moves
            hires = np.where(r.random(len(SIGDAYS)) < 0.05, -r.uniform(0.005, 0.04, len(SIGDAYS)), 0.0)
            # noise draws
            if A.persistent_noise:
                eB = np.full(len(SIGDAYS), r.normal(0, SIG_B)); eR = np.full(len(SIGDAYS), r.normal(0, SIG_R))
            else:
                eB = r.normal(0, SIG_B, len(SIGDAYS)); eR = r.normal(0, SIG_R, len(SIGDAYS))
            Brep = np.array([Bpath[d] for d in SIGDAYS]) * np.exp(eB - SIG_B**2 / 2)
            QTD = np.cumsum(daily)
            Rrep = np.array([QTD[d-1] * 63 / d for d in SIGDAYS]) * np.exp(eR - SIG_R**2 / 2)
            # consensus backlog
            if rules == 'v14':
                Bc = np.empty(len(SIGDAYS)); prev = B_prev
                for k in range(len(SIGDAYS)): prev = 0.5 * Brep[k] + 0.5 * prev; Bc[k] = prev
                Bc[-1] = Brep[-1] if False else Bc[-1]
            else:
                Bc = Brep.copy()
            # uncapped forward (backlog) and unbacked (hiring) parts, in lnV
            fwdB = sens * (Bc - B_prev) / Rev_prev
            Ucum = np.cumsum(hires)
            revpart = A.eR * np.log(Rrep / Rev_prev)
            # apply caps -> carried lnV forward part R_k
            Rk = np.empty(len(SIGDAYS)); R = 0.0
            if rules == 'v14':
                U = fwdB + Ucum                         # all forward parts capped
                for k in range(len(SIGDAYS)):
                    if k == len(SIGDAYS) - 1: R = U[k]
                    else:
                        T = min(max(U[k], -0.025), 0.025)
                        R = R + min(max(T - R, -0.015), 0.015)
                    Rk[k] = R
                lnV = revpart + Rk
                carry = (U - Rk)
            else:
                Uprev = 0.0
                for k in range(len(SIGDAYS)):
                    if k == len(SIGDAYS) - 1: R = Ucum[k]
                    else:
                        hi = max(0.025, Uprev); lo = min(-0.025, Uprev)
                        T = min(max(Ucum[k], lo), hi)
                        R = R + min(max(T - R, -0.015), 0.015)
                    Rk[k] = R; Uprev = Ucum[k]
                lnV = revpart + fwdB + Rk
                carry = Ucum - Rk
            # filing: re-anchor to truth (+ unobserved cost surprise u through E)
            wc = r.normal(0, A.sig_wc) * Rev; u = r.normal(0, A.sig_u) * Rev
            Btrue = Bpath[63]
            lnV_fil = A.eR * math.log(Rev / Rev_prev) + sens * (Btrue - B_prev) / Rev_prev + Ucum[-1] + u / (n * Rev)
            steps = np.diff(np.concatenate([[0.0], lnV, [lnV_fil]]))  # step at each signal, last = filing step
            # ---- bots (public info only) ----
            fc = BUCKETS[sd % 3]
            # weekly-carry: carried excess > 0 -> position, entered after convergence, exit after next convergence
            for k in range(len(SIGDAYS) - 1):
                if abs(carry[k]) > 1e-9: trades['carry'].append((fc, sigma, advf, vs, math.copysign(1, carry[k]) * steps[k+1], J))
            # lag-aware: predicted next step from public reports (mean of the last 3 reports as the truth estimate)
            for k in range(2, len(SIGDAYS)):
                Bhat = Brep[max(0, k-2):k+1].mean(); Rhat = Rrep[max(0, k-2):k+1].mean()
                if launch_day is not None and SIGDAYS[k-2] < launch_day <= SIGDAYS[k]:
                    Bhat = Brep[k]  # launch in the window: don't average across it
                pC = carry[k] if k == len(SIGDAYS)-1 else min(max(carry[k], -0.015), 0.015)
                pR = A.eR * math.log(Rhat / Rrep[k]) if k < len(SIGDAYS)-1 else A.eR * math.log(Rhat / Rrep[k])
                if rules == 'v14':
                    pB = 0.5 * sens * (Brep[k] - Bc[k]) / Rev_prev if k < len(SIGDAYS)-1 else sens * (Bhat - Bc[k]) / Rev_prev
                else:
                    pB = sens * (Bhat - Bc[k]) / Rev_prev
                pred = pR + pB + pC
                for key, pv in (('lagR', pR), ('lagB', pB), ('lagC', pC)):
                    trades[key].append((fc, sigma, advf, vs, pv, steps[k+1], J))
                trades['lag'].append((fc, sigma, advf, vs, pred, steps[k+1], J))
            # hold-to-close: first signal where the uncapped estimate differs from what lnV carries; hold to the close signal
            for k in range(len(SIGDAYS) - 1):
                if abs(carry[k]) > 1e-9:
                    trades['hold'].append((fc, sigma, advf, vs, math.copysign(1, carry[k]) * steps[k+1:len(SIGDAYS)].sum(), J)); break
            # post-print: enter right after the print in the step's direction, exit at close D+1
            for k in range(len(SIGDAYS)):
                trades['postprint'].append((fc, sigma, advf, vs, abs(steps[k]), A.d1share - A.print0, J))
            # reanchor_public_edge: short the sign of the cumulative forward part at the close signal, exit after the filing
            cumf = fwdB[-1] + Rk[-1]
            trades['reanchor'].append((fc, sigma, advf, vs, -math.copysign(1, cumf) * steps[-1] if cumf != 0 else 0.0, J))
            # surprise numerators (Rev_q units; D cancels in rho)
            Rc = Rrep[-1]; Bcl = Bc[-1]
            OCF = 0.12 * Rev + wc + u; OCFc = 0.12 * Rc
            sf.append((Rev - Rc) * m + (OCF - OCFc) + (Btrue - Bcl) * m * A.wb)
            sq.append((Rev - Rev_prev) * m + (OCF - OCF_prev) + (Btrue - B_prev) * m * A.wb)
            Rev_prev, B_prev, OCF_prev = Rev, Btrue, OCF
        rhos.append(np.std(sf, ddof=1) / np.std(sq, ddof=1))
    return trades, np.array(rhos)

def rt_of(fc, N, s, a, v): return rt(fc, N, s, a, v)
def report(rules):
    T, rh = run_joint(rules, A.seeds)
    print(f"\n--- rules {rules}: rho over {A.seeds} seeds x {NQ} filings: median {np.median(rh):.4f}, p90 {np.percentile(rh,90):.4f}, p95 {np.percentile(rh,95):.4f} (target <= 0.15 / 0.25)")
    out = {}
    for N in SIZES[:3] + [SIZES[3]]:
        line = []
        for fc in BUCKETS:
            res = {}
            c = [x for x in T['carry'] if x[0] == fc]; res['carry'] = [x[4] - rt_of(fc, N, *x[1:4]) for x in c]
            l = [x for x in T['lag'] if x[0] == fc]
            res['lag'] = [math.copysign(1, x[4]) * x[5] - rt_of(fc, N, *x[1:4]) for x in l if abs(x[4]) > rt_of(fc, N, *x[1:4])]
            for key in ('lagR', 'lagB', 'lagC'):
                l2 = [x for x in T[key] if x[0] == fc]
                res[key] = [math.copysign(1, x[4]) * x[5] - rt_of(fc, N, *x[1:4]) for x in l2 if abs(x[4]) > rt_of(fc, N, *x[1:4])]
            h = [x for x in T['hold'] if x[0] == fc]; res['hold'] = [x[4] - rt_of(fc, N, *x[1:4]) for x in h]
            p = [x for x in T['postprint'] if x[0] == fc]
            res['postprint'] = [x[4] * x[5] - rt_of(fc, N, *x[1:4]) for x in p if x[4] * x[5] > rt_of(fc, N, *x[1:4])]
            ra = [x for x in T['reanchor'] if x[0] == fc]; res['reanchor'] = [x[4] - rt_of(fc, N, *x[1:4]) for x in ra]
            out[(N, fc)] = res
            line.append(f"${fc/1e6:,.0f}M: " + ", ".join(f"{k} {('n/a' if not v else pct(np.mean(v)))} (n={len(v)})" for k, v in res.items()))
        print(f"  ${N/1e3:,.0f}k  mean NET per trade (trades taken)  " + " || ".join(line))
    return T, rh, out

print(f"\n=== J. signal_joint_v15 (MODELLED). {A.seeds} seeds x {NQ} quarters, 12 weekly + close signal, launches J in {{2,3.3,5,8}}% w.p. 0.5/quarter,")
print(f"     sigma_sig backlog 0.04 / shipped 0.02 iid per report{' (PERSISTENT per quarter: lever)' if A.persistent_noise else ''}, eR {A.eR}, w_b {A.wb}; print share {A.print0}, close-D share {A.closeshare}, D+1 share {A.d1share}")
print("     bots: carry/lag/hold/reanchor enter after convergence (pure next-step edge); postprint enters after the print, exits at close D+1, only when (D+1 share - print) x |step| > RT")
T14, rh14, o14 = report('v14')
T15, rh15, o15 = report('v15')
# gross diagnostics for v1.5
lag = T15['lag']
pr = np.array([x[4] for x in lag]); st = np.array([x[5] for x in lag])
print(f"\n  v1.5 lag-aware diagnostics: corr(pred, next step) = {np.corrcoef(pr, st)[0,1]:.3f}; regression slope = {np.polyfit(pr, st, 1)[0]:.3f};"
      f" sd of steps {pct(st.std())}; share |pred| > 0.70% = {np.mean(np.abs(pr) > 0.007):.3f}; mean gross when |pred|>0.70% = {pct(np.mean(np.sign(pr[np.abs(pr)>0.007])*st[np.abs(pr)>0.007]))}")
# decomposition: backlog-only vs revenue-only reversal
pp = np.array([x[4] for x in T15['postprint']])
print(f"  v1.5 signal step |size|: median {pct(np.median(pp))}, p90 {pct(np.percentile(pp,90))}, p99 {pct(np.percentile(pp,99))}; v1.4 p90 {pct(np.percentile([x[4] for x in T14['postprint']],90))}, p99 {pct(np.percentile([x[4] for x in T14['postprint']],99))}")
for Jv in (0.02, 0.033, 0.05, 0.08):
    sel = [x for x in T15['postprint'] if x[6] == Jv]
    big = max(x[4] for x in sel) if sel else 0
    print(f"    launches J={Jv*100:.1f}%: largest step {pct(big)}; post-print capture at (D+1 - print) share {A.d1share - A.print0:.2f}: {pct(big*(A.d1share-A.print0))}")

# ---------------------------------------------------------------- F
print("\n=== F. signal_fake_ev (MODELLED). Faker vs honest founder selling the SAME schedule; gain = sum_d x_d L_d; net = gain - production cost ===")
# (1) reproduce the schedule: the faker's best constant sell rate under impact Y sd sqrt(x/ADV) + half spread (Quant's staples worst case)
Y = 0.8
def best_rate(L, sigma=0.16, adv=0.0039, hs=0.00125, cap=0.02, days=20):
    sd = sigma / math.sqrt(252)
    xs = np.linspace(1e-5, cap, 20000)
    pnl = xs * (L - hs) - Y * sd * xs**1.5 / math.sqrt(adv)
    x = xs[np.argmax(pnl)]; return x * days
for L in (0.025, 0.05, 0.10):
    s = best_rate(L)
    print(f"  L={L*100:.1f}%: faker's own best schedule sells {pct(s)} of shares out; gain vs same-schedule honest = {pct(L*s)} of mcap; max schedule (40%) gain {pct(L*0.40)}")
# (2) production cost per mechanism (spec §2 logit c=2, §4 capacity +15% overload at 1.5x Ops wage, prices bounded +-30% of p_ref)
def logit_mult(s0, dlnp, c=2.0):
    e = math.exp(-c * dlnp); return e / (1 - s0 + s0 * e)
print("  production cost of a backed-backlog fake, -30% price push while capacity-bound (reading R1: demand above 1.15 x cap queues as backlog):")
s0 = 0.25; dl = math.log(0.7); mult = logit_mult(s0, dl)
for m in (0.8, 0.5, 0.35, 0.25):
    for U in (0.85, 1.0):
        dem = mult * U; ship = min(dem, 1.15); excess = max(0.0, dem - 1.15)
        backlog_rev = excess * 0.7 / U          # $ per day, in units of base daily revenue
        overtime = max(0.0, ship - 1.0) * 0.06 / U
        gp_push = (ship * 0.7 - ship * (1 - m)) / U - overtime; gp_h = m
        rev_push = ship * 0.7 / U
        cost = gp_h - gp_push
        per = cost / backlog_rev if backlog_rev > 0 else float('inf')
        sensm = m * A.wb / (4 * 0.15)
        lift_per_day_B = sensm * backlog_rev / 63
        # the shipped-revenue signal moves too (eR on the run-rate change), uncapped and visible
        lift_rev = A.eR * math.log(rev_push)
        print(f"    m {m:.2f}, utilization {U:.2f}: demand x{mult:.2f}, backlog {backlog_rev:.3f} base-rev/day, cost ${per:.2f} per $1 backlog;"
              f" backlog lift +{pct(lift_per_day_B)}/day of push vs run-rate signal {('+' if lift_rev>=0 else '')}{pct(lift_rev)} (consensus run-rate reading)")
print("  production cost of a REVENUE fake, -30% price push with Ops hired to ship it (reading M%: consensus margin = last filed margin %):")
for m in (0.8, 0.5, 0.35):
    ship = mult; rev = ship * 0.7; gp = ship * (0.7 - (1 - m)); wage = (ship - 1) * 0.04  # extra Ops wages ~ 4% of base rev per extra unit-day
    lift = A.eR * math.log(rev)
    print(f"    m {m:.2f}: shipped revenue x{rev:.3f} -> consensus lift {pct(lift)} under M% (0 under unit-cost reading); true GP {gp:.3f} vs {m:.2f} base -> cost {(m-gp+wage):.3f} base-rev/day")
# (3) 200-seed faker vs honest, by mechanism
fr = np.random.default_rng(42)
rows = {k: [] for k in ('backlog_R1', 'revenue_M%', 'preorder_R1', 'hireBurst', 'planTimed')}
be = []
for sd in range(A.seeds):
    m = fr.choice([0.8, 0.7, 0.35, 0.45, 0.25, 0.4]); n = 0.15; evs = fr.uniform(1, 4)
    sigma = fr.uniform(0.16, 0.35); adv = fr.uniform(0.004, 0.008) * fr.uniform(0.15, 0.49)
    sens = m * A.wb / (4 * n); revq_over_mcap = 1 / (4 * evs)
    # schedule: same for both founders; constant rate chosen by the faker
    L_target = 0.05
    sold = best_rate(L_target, sigma, adv)
    # backlog fake (R1 price push, capacity-bound U=1): cost per $ backlog from the logit above
    dem = mult; excess = max(0.0, dem - 1.15); ship = min(dem, 1.15)
    backlog_rev = excess * 0.7; cost_per = (m - (ship * 0.7 - ship * (1 - m) - (ship - 1) * 0.06)) / backlog_rev
    dB = L_target / sens                       # backlog needed, share of Rev_q
    days_needed = dB * 63 / backlog_rev
    rev_hit = A.eR * math.log(ship * 0.7)      # run-rate signal during the push (negative)
    L_net = L_target + rev_hit * min(1.0, days_needed / 63)
    cost = cost_per * dB * revq_over_mcap
    rows['backlog_R1'].append(L_net * sold - cost)
    be.append(L_target * sold / (dB * revq_over_mcap))     # break-even $ per $ backlog
    # pre-orders accepted beyond capacity at list price, never shipped, cancelled at 63 gd (R1 + free cancellation): cost = brand only
    brand_cost = 0.0005 * revq_over_mcap * 20              # assume ~0.05% of Rev_q per stockout day x 20 days (brand -0.02/day, decays)
    rows['preorder_R1'].append(L_target * sold - brand_cost)
    # revenue fake under M% (push 20 window days with Ops hired)
    revL = A.eR * math.log(mult * 0.7)
    gp_loss = (m - mult * (0.7 - (1 - m)) + (mult - 1) * 0.04) * 20 / 63 * revq_over_mcap
    rows['revenue_M%'].append(max(revL, 0) * sold - gp_loss)
    # hireBurst: headcount is cost-only -> lift <= 0; cost = 50% more wages for 21 gd + 21 gd severance (wages ~ 25% of rev)
    rows['hireBurst'].append(0.0 * sold - 0.5 * 0.25 * (42 / 63) * revq_over_mcap)
    # planTimed: plan sells qtyPerDay on lifted days (choose 1%/gd for 20 gd = 20% sold) with the backlog_R1 fake
    rows['planTimed'].append(L_net * 0.20 - cost)
for k, v in rows.items():
    v = np.array(v)
    print(f"  {k:12s}: faker - honest, % of mcap: mean {pct(v.mean())}, median {pct(np.median(v))}, share of seeds faker > honest {np.mean(v>0):.2f}")
be = np.array(be)
print(f"  break-even production cost per $1 of fake backlog (L=5%, faker's schedule): median ${np.median(be):.2f}, p10 ${np.percentile(be,10):.2f}, p90 ${np.percentile(be,90):.2f}")
for L in (0.025, 0.05, 0.10):
    print(f"  break-even production cost as % of mcap at L={L*100:.1f}%: = L x sold: {pct(L*0.23)} (23% sold) to {pct(L*0.40)} (40% sold)")
