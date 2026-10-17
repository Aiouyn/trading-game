import pandas as pd, json, sys; sys.path.insert(0,'/workspace/memecoin-v3/flow'); import measure as M
d=pd.read_parquet('/workspace/memecoin-v3/refs-real/corpus/cache/trades-00000.parquet',columns=['mint','seconds_since_launch','is_buy','sol_amount','token_amount','user_wallet','market_cap_sol','id'])
d=d.rename(columns=dict(seconds_since_launch='t',sol_amount='sol',token_amount='tok',user_wallet='wallet',market_cap_sol='mc')).sort_values(['mint','t','id'])
first=d.groupby('mint').t.min(); full=first[first<10].index; d=d[d.mint.isin(full)]
print('grad mc max', d.mc.quantile([.5,.99,1]).tolist())
J=M.run(d,50); json.dump(J,open('/workspace/memecoin-v3/out/flow/real-flow.json','w'),default=float)
for c,v in J['classes'].items(): print(c,v['n_coins'])
