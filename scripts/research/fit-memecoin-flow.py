"""Extract order-flow episodes, never target prices, from pinned Pump.fun history.

Run after downloading the corpus shards to %TEMP%/memecoin-history.
Collector timestamps are not independently verified chain times. The game intentionally
over-samples active launches; this is a playable historical flow library, not a market fit.
"""
import hashlib
import json
import os
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get('TEMP', '/tmp')) / 'memecoin-history'
REV = '13bec2bf3089d56d50c35e602616d1b993bb37f5'
K = 30e9 * 1_073_000_000e6
profiles, evidence = [], []
for shard in ['trades-00000.parquet', 'trades-00001.parquet']:
    path = CACHE / shard
    df = pd.read_parquet(path)
    duplicate = df.duplicated(['mint', 'tx_signature'], keep=False)
    x, y = df.v_sol_bonding_curve, df.v_tokens_bonding_curve
    pre_x = x - np.where(df.is_buy, df.sol_amount * 1e9, -df.sol_amount * 1e9)
    pre_y = y + np.where(df.is_buy, df.token_amount * 1e6, -df.token_amount * 1e6)
    valid = (~duplicate & (df.price_sol > 0) & df.seconds_since_launch.between(0, 600)
             & (df.sol_amount / (df.token_amount * df.price_sol)).between(.01, 100)
             & np.isclose(x*y, K, rtol=.001)
             & np.isclose(df.price_sol, x/y/1000, rtol=1e-5)
             & (pre_x > 0) & (pre_y > 0) & np.isclose(pre_x*pre_y, K, rtol=.03))
    fraction = np.where(df.is_buy, df.sol_amount*1e9/pre_x, -df.token_amount*1e6/pre_y)
    df = df.loc[valid].copy()
    df['fraction'] = fraction[valid]
    df = df.loc[df.fraction.abs().between(.00005, .6)].sort_values(['mint', 'event_time', 'id'])
    summary = df.groupby('mint').agg(n=('id', 'size'), first=('seconds_since_launch', 'min'))
    # Stratify across distinct mints, deterministically; do not select on maximum returns.
    bands = [('hot', 100, 2500, 24), ('mixed', 20, 99, 16), ('quiet', 2, 19, 8)]
    for band, lo, hi, count in bands:
        candidates = summary.loc[(summary['first'] < 30) & summary.n.between(lo, hi)].index
        candidates = sorted(candidates, key=lambda mint: hashlib.sha256(mint.encode()).hexdigest())[:count]
        for mint in candidates:
            rows = df.loc[df.mint == mint]
            events = []
            for row in rows.itertuples():
                # Actor slot preserves recurrence, but never ships a real wallet address.
                actor = int(hashlib.sha256(str(row.user_wallet).encode()).hexdigest()[:8], 16) % 24
                events.append([int(row.seconds_since_launch // 5), round(row.fraction, 7), actor])
            profiles.append({'kind': band, 'events': events})
            evidence.append({'shard': shard, 'mint': mint, 'kind': band, 'events': len(events)})
    print(shard, 'clean rows', len(df), 'profiles', len(profiles), flush=True)

target = ROOT / 'src/world/launchpad/historical-flow.json'
target.write_text(json.dumps(profiles, separators=(',', ':')) + '\n')
report = {'dataset': 'Slinky21/Pumpfun_Memecoin_Corpus', 'revision': REV,
          'windowSeconds': 600, 'profiles': len(profiles), 'episodes': evidence,
          'inputs': [{'file': s, 'sha256': hashlib.sha256((CACHE/s).read_bytes()).hexdigest()}
                     for s in ['trades-00000.parquet', 'trades-00001.parquet']],
          'limits': ['collector time', 'active launches intentionally oversampled',
                     '24 anonymous actor slots can merge historical wallets',
                     'orders clipped to actual game cash and inventory; prices are not replayed']}
out = ROOT / 'proof/memecoin-history-fit'
out.mkdir(exist_ok=True, parents=True)
(out/'flow-library-manifest.json').write_text(json.dumps(report, indent=2)+'\n')
print('Saved', target, target.stat().st_size)
