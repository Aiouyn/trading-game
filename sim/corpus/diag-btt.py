# v8 diagnosis: big-then-tiny decomposition on the real corpus (same bars as series.py), plus age buckets
import pandas as pd, numpy as np, json
df = pd.read_parquet('cache/slim.parquet'); s = pd.read_csv('mint-summary.csv', index_col=0); full = set(s[s.t0 < 5].index); df = df[df.mint.isin(full)]
R = dict(big=0, bt=0, bt_next01=0, big_next01=0, big_h1=0, bt_h1=0, bt_h1_nextact=0, big_h1_nextact=0, ages=[])
for mint, d in df.groupby('mint', sort=False):
    t = (d.seconds_since_launch.values // 5).astype(int); L = t.max() + 1
    px = np.full(L, np.nan); vol = np.zeros(L); n = np.zeros(L); np.add.at(vol, t, d.sol_amount.values * 150); np.add.at(n, t, 1); px[t] = d.price_sol.values
    px = pd.Series(px).ffill().values; cl = px[2::3]; idx = np.arange(0, L, 3); v3 = np.add.reduceat(vol, idx)[:len(cl)]; n3 = np.add.reduceat(n, idx)[:len(cl)]
    if len(cl) <= 2: continue
    a = np.abs(cl[1:-1] / cl[:-2] - 1); nx = np.abs(cl[2:] / cl[1:-1] - 1); ok = v3[1:-1] > 0; nn = n3[2:]; age = np.arange(1, len(cl) - 1) * 15
    B = (a >= .05) & ok; BT = B & (nx < .01); h1 = age < 3600
    R['big'] += int(B.sum()); R['bt'] += int(BT.sum()); R['bt_next01'] += int((BT & (nn <= 1)).sum()); R['big_next01'] += int((B & (nn <= 1)).sum())
    R['big_h1'] += int((B & h1).sum()); R['bt_h1'] += int((BT & h1).sum()); R['big_h1_nextact'] += int((B & h1 & (nn >= 2)).sum()); R['bt_h1_nextact'] += int((BT & h1 & (nn >= 2)).sum())
    R['ages'] += list(age[B])
ag = np.array(R.pop('ages')); R['bigAge_p50_p90_s'] = [float(np.median(ag)), float(np.quantile(ag, .9))]
print(json.dumps(R))
