# Empirical table for approach C from the cleaned corpus: per (age bucket, activity bucket) the gaps to the next trade (s),
# the trade sizes (SOL), and the buy share. Age buckets (s): <30,<120,<600,<3600,>=3600; activity = trades in the previous 60 s: 0,1-3,4-15,>15.
import pandas as pd, numpy as np, json
df = pd.read_parquet('cache/slim.parquet'); s = pd.read_csv('mint-summary.csv', index_col=0); df = df[df.mint.isin(set(s[s.t0 < 5].index))]
AB = [30, 120, 600, 3600]; CB = [0, 3, 15]
tab = {}; rng = np.random.default_rng(1)
for mint, d in df.groupby('mint', sort=False):
    t = d.seconds_since_launch.values; n = len(t)
    act = np.searchsorted(t, t, 'left') - np.searchsorted(t, t - 60, 'left')
    gap = np.append(np.diff(t), 7 * 86400)  # after the last trade: no more trades in the shard (coin went quiet)
    for i in range(n):
        k = f'{np.searchsorted(AB, t[i], "right")},{np.searchsorted(CB, act[i], "left") if act[i] > 0 else 0}'
        e = tab.setdefault(k, [[], [], 0, 0]); e[0].append(float(gap[i])); e[1].append(float(d.sol_amount.values[i])); e[2] += 1; e[3] += int(d.is_buy.values[i])
out = {k: dict(gap=rng.choice(v[0], min(4000, len(v[0])), replace=False).round(2).tolist(), sol=rng.choice(v[1], min(4000, len(v[1])), replace=False).round(4).tolist(), buyShare=v[3] / v[2], n=v[2]) for k, v in tab.items()}
json.dump(out, open('../../sim/c-table.json', 'w')); print({k: (v['n'], round(v['buyShare'], 2), float(np.median(v['gap']))) for k, v in sorted(out.items())})
