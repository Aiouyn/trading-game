import pandas as pd, numpy as np
df = pd.read_parquet('cache/slim.parquet')


g = df.groupby('mint')
s = pd.DataFrame({'n': g.size(), 'dur': g.seconds_since_launch.max(), 't0': g.seconds_since_launch.min(), 'p0': g.price_sol.first(), 'pk': g.price_sol.max(), 'pend': g.price_sol.last(), 'cmax': g.curve_pct_depleted.max(), 'sol': g.sol_amount.sum()})
s['peak'] = s.pk / s.p0; s['fin'] = s.pend / s.pk
# creator = first trader; their sells
first = g.user_wallet.first()
d2 = df.join(first.rename('cr'), on='mint'); dv = d2[(d2.user_wallet == d2.cr) & (~d2.is_buy)].groupby('mint').sol_amount.sum()
s['devsell'] = dv.reindex(s.index).fillna(0); s.to_csv('mint-summary.csv')
full = s[(s.t0 < 5)]
print(len(s), len(full)); print(full.describe().T[['50%','90%']])
print('rug cands'); print(full[(full.n > 80) & (full.peak > 2) & (full.fin < 0.15) & (full.devsell > 3)].sort_values('n', ascending=False).head(6))
print('quick'); print(full[(full.n.between(60, 400)) & (full.peak.between(1.8, 6)) & (full.fin < 0.25) & (full.devsell < 0.5)].sort_values('n', ascending=False).head(8))
