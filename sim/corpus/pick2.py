import pandas as pd
s = pd.read_csv('mint-summary.csv', index_col=0); full = s[s.t0 < 5]
print(full[['n','dur','peak','fin','cmax','sol','devsell']].quantile([.5,.9,.99]))
print('grad share (cmax>=99.9)', (full.cmax >= 99.9).mean())
pd.set_option('display.width', 250)
print('rug'); print(full[(full.n > 80) & (full.peak > 2) & (full.fin < 0.2) & (full.devsell > 1)].sort_values('n', ascending=False).head(6))
print('quick'); print(full[(full.n.between(60, 600)) & (full.peak.between(1.8, 8)) & (full.fin < 0.3) & (full.devsell < 0.3)].sort_values('n', ascending=False).head(8))
