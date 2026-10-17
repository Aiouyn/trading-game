# Real Pump.fun corpus (Slinky21 trades-00000, sha 646f56bb..., launch-observed coins only: first trade < 5 s after launch).
# 5 s price series (last trade price, carried), $ volume at a nominal $150/SOL; same stat definitions as sim/run.ts.
import pandas as pd, numpy as np, json
df = pd.read_parquet('cache/slim.parquet'); s = pd.read_csv('mint-summary.csv', index_col=0); full = set(s[s.t0 < 5].index)
df = df[df.mint.isin(full)]
PICK = {'69YygsSny6tdLwc2R6fNmfN3utxPtUFv7vzVhQxzpump': 'rug (creator sold 28.3 SOL)', '3oS2MoyLBrUhoVw8c7s6hstYWMoTTuetfp9EgWdepump': 'rug (creator sold 13.3 SOL)',
        '21DyGRJ1TSggjwUZBciDrJuQRQtR9kMuvMUZEyj7pump': 'quick death', '6Cz3NDV5Mbbczb45NwjQRFKt5mN5XAYzGaFC3D3Zpump': 'quick death'}
m5, m5late, out, big, bt = [], [], {}, 0, 0; rb, tb = [], []; rng = np.random.default_rng(7); FEE = 0.01
for mint, d in df.groupby('mint', sort=False):
    t = (d.seconds_since_launch.values // 5).astype(int); p = d.price_sol.values; L = t.max() + 1
    px = np.full(L, np.nan); vol = np.zeros(L); np.add.at(vol, t, d.sol_amount.values * 150); px[t] = p  # last trade in tick wins (sorted)
    px = pd.Series(px).ffill().values
    act = vol > 0; r = np.abs(px[1:] / px[:-1] - 1); m5.extend(r[act[1:]]); m5late.extend(r[60:][act[61:]])
    cl = px[2::3]; v3 = np.add.reduceat(vol, np.arange(0, L, 3))[:len(cl)]
    if len(cl) > 2:
        a = np.abs(cl[1:-1] / cl[:-2] - 1); nx = np.abs(cl[2:] / cl[1:-1] - 1); ok = v3[1:-1] > 0
        big += int(((a >= .05) & ok).sum()); bt += int(((a >= .05) & ok & (nx < .01)).sum())
    def at(k): return px[min(k, L - 1)]
    if rng.random() < 0.5:  # random bot: entry tick in [60,720), exit +360 ticks, 1% fee each way, no impact (price-path approximation)
        k = 60 + rng.integers(660); rb.append(50 * (1 - FEE) ** 2 * at(k + 360) / at(k) - 50)
    e = d[d.seconds_since_launch < 300]
    if e.user_wallet[e.is_buy].nunique() >= 15 and e.is_buy.mean() >= 0.65 and at(60) >= 1.3 * px[0]: tb.append(50 * (1 - FEE) ** 2 * at(420) / at(60) - 50)
    if mint in PICK: out[mint] = dict(label=PICK[mint], px=[float(f'{x:.6g}') for x in px / px[0]], vol=[int(v) for v in vol])
m5 = np.array(m5); m5late = np.array(m5late)
st = dict(coins=len(full), bigThenTiny=bt / big, bigCandles=big, m5p95=float(np.quantile(m5, .95)), m5p99=float(np.quantile(m5, .99)), m5p95_after5min=float(np.quantile(m5late, .95)), m5p99_after5min=float(np.quantile(m5late, .99)),
          gradRate=float((s[s.t0 < 5].cmax >= 99.9).mean()), randBot=dict(n=len(rb), perTrade=float(np.mean(rb))), tellBot=dict(n=len(tb), perTrade=float(np.mean(tb))),
          peakP50=float(s[s.t0 < 5].peak.median()), peakP99=float(s[s.t0 < 5].peak.quantile(.99)))
json.dump(dict(stats=st, coins=out), open('../../out/refs/corpus-v2.json', 'w')); print(json.dumps(st))
