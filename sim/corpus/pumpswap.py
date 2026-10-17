# PumpSwap hour sample: ONLY the shape of trade sizes after graduation, as a share of market cap (sol x $150 / mcap_usd, at the
# trade's own row). Timestamps and mcap jumps are not used for anything else.
import pyarrow.parquet as pq, numpy as np, json
d = pq.read_table('cache/pumpswap_sample_1hr.parquet').to_pandas(); d = d[(d.mcap_usd > 1e4) & (d.sol_amount > 0)]
sh = (d.sol_amount * 150 / d.mcap_usd).values; sh = sh[np.isfinite(sh)]
print(len(sh), np.quantile(sh, [.1, .5, .9, .99]))
json.dump(np.random.default_rng(3).choice(sh, 5000, replace=False).round(8).tolist(), open('../../sim/ps-shares.json', 'w'))
