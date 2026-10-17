"""Reproducible exploratory short-horizon analysis; never fit from unfiltered maxima."""
import json
from pathlib import Path
import tempfile
import numpy as np
import pandas as pd

cache = Path(tempfile.gettempdir()) / 'memecoin-history'
out = Path(__file__).parent
cols = ['id', 'mint', 'tx_signature', 'event_time', 'seconds_since_launch', 'is_buy', 'sol_amount', 'token_amount', 'v_tokens_bonding_curve', 'v_sol_bonding_curve', 'price_sol', 'source']
raw = pd.read_parquet(cache/'trades-00000.parquet', columns=cols)
stats = {'dataset': 'Slinky21/Pumpfun_Memecoin_Corpus', 'revision': '13bec2bf3089d56d50c35e602616d1b993bb37f5', 'shard': 'trades-00000.parquet', 'rows_raw': len(raw), 'tokens_raw': raw.mint.nunique(), 'time_start': str(raw.event_time.min()), 'time_end': str(raw.event_time.max())}
valid = (raw.price_sol > 0) & (raw.v_tokens_bonding_curve > 0) & (raw.v_sol_bonding_curve > 0) & np.isfinite(raw.price_sol)
ratio = raw.sol_amount / (raw.token_amount * raw.price_sol)
valid &= ratio.between(.01, 100)
reserve_price = raw.v_sol_bonding_curve / raw.v_tokens_bonding_curve / 1000
valid &= np.isclose(raw.price_sol, reserve_price, rtol=1e-5, atol=0)
df = raw.loc[valid].copy()
# Ambiguous multiple observations of one transaction/mint are removed, not guessed into order.
duplicate = df.duplicated(['mint', 'tx_signature'], keep=False)
stats['ambiguous_duplicate_rows_removed'] = int(duplicate.sum())
df = df.loc[~duplicate].sort_values(['mint', 'event_time', 'id'])
boundary = [raw.mint.min(), raw.mint.max()]
df = df.loc[~df.mint.isin(boundary)].copy()
stats['rows_clean'] = len(df)
stats['tokens_clean'] = df.mint.nunique()
stats['sources_clean'] = {str(k): int(v) for k,v in df.source.value_counts().items()}
df['k'] = df.v_sol_bonding_curve * df.v_tokens_bonding_curve
grp = df.groupby('mint', sort=False)
df['gap'] = grp.event_time.diff().dt.total_seconds()
df['ret'] = grp.price_sol.pct_change(fill_method=None)
df['kchange'] = grp.k.pct_change(fill_method=None)
df['prev_price'] = grp.price_sol.shift()
df['prev_time'] = grp.event_time.shift()
df['prev_sol'] = grp.v_sol_bonding_curve.shift()
df['prev_tok'] = grp.v_tokens_bonding_curve.shift()
df['prev_signature'] = grp.tx_signature.shift()
df['prev_source'] = grp.source.shift()
df['prev_id'] = grp.id.shift()
counts = grp.size()
df['token_observations'] = df.mint.map(counts)

def describe(x):
    x = x.dropna()
    if x.empty:
        return {'n':0}
    ax = x.abs()
    return {'n': len(x), 'abs_return_percentiles_pct': {str(q): float(ax.quantile(q)*100) for q in [.5,.9,.95,.99,.999]}, 'share_abs_ge_pct': {str(v): float((ax >= v/100).mean()*100) for v in [5,10,20,30,50]}, 'max_up_pct': float(x.max()*100), 'max_down_pct': float(x.min()*100)}

pairs = df.loc[df.gap.between(0,5,inclusive='right') & df.kchange.abs().le(.001)].copy()
standard_k = 30e9 * 1_073_000_000e6
pairs['standard_virtual_curve'] = np.isclose(pairs.k, standard_k, rtol=.001, atol=0) & (pairs.v_sol_bonding_curve >= 30e9)
pairs['trade_aligned'] = np.isclose((pairs.v_sol_bonding_curve-pairs.prev_sol).abs()/1e9, pairs.sol_amount, rtol=.03,atol=1e-7) & np.isclose((pairs.v_tokens_bonding_curve-pairs.prev_tok).abs()/1e6,pairs.token_amount,rtol=.03,atol=1e-4)
stats['trade_aligned_pairs'] = describe(pairs.loc[pairs.trade_aligned,'ret'])
stats['standard_virtual_curve_pairs'] = describe(pairs.loc[pairs.standard_virtual_curve & pairs.trade_aligned,'ret'])
stats['other_reserve_regimes_pairs'] = describe(pairs.loc[~pairs.standard_virtual_curve & pairs.trade_aligned,'ret'])
stats['adjacent_observations_within_5s_constant_k'] = describe(pairs.ret)
stats['active_tokens_ge100obs_adjacent_within_5s'] = describe(pairs.loc[pairs.token_observations>=100, 'ret'])
stats['buy_sign_agreement_pct'] = float((pairs.loc[pairs.is_buy,'ret'] >= -1e-8).mean()*100)
stats['sell_sign_agreement_pct'] = float((pairs.loc[~pairs.is_buy,'ret'] <= 1e-8).mean()*100)
stats['median_event_gap_seconds'] = float(pairs.gap.median())
stats['large_pairs_source_counts'] = {str(k):int(v) for k,v in pairs.loc[pairs.ret.abs()>=.2,'source'].value_counts().items()}

# Five-second observed closes: compare populated adjacent buckets only; no invented intra-bucket ordering.
df['bucket'] = df.event_time.dt.floor('5s')
bars = df.groupby(['mint','bucket'], sort=False).agg(open=('price_sol','first'), high=('price_sol','max'), low=('price_sol','min'), close=('price_sol','last'), trades=('id','size'), kmin=('k','min'), kmax=('k','max')).reset_index()
bg = bars.groupby('mint', sort=False)
bars['gap'] = bg.bucket.diff().dt.total_seconds()
bars['ret'] = bg.close.pct_change(fill_method=None)
bars['prev_k'] = bg.kmax.shift()
bars['stable_k'] = ((bars.kmax / bars.kmin - 1).abs() <= .001) & ((bars.kmax / bars.prev_k - 1).abs() <= .001)
active = bars.loc[(bars.gap == 5) & bars.stable_k]
stats['adjacent_populated_5s_buckets'] = describe(active.ret)
stats['within_5s_range'] = describe(active.high / active.low - 1)
standard_bars = np.isclose(active.kmax, standard_k,rtol=.001,atol=0)
stats['standard_virtual_curve_5s_buckets'] = describe(active.loc[standard_bars,'ret'])
stats['other_reserve_regimes_5s_buckets'] = describe(active.loc[~standard_bars,'ret'])
events = pd.read_parquet(cache/'migrations.parquet')
events = events.loc[~events.pool_address.isin(['synthetic_graduation_queue','backfilled_from_pumpswap_trade'])].drop_duplicates('mint')
migration_times = events.set_index('mint').migrated_at
pairs['migration_time']=pairs.mint.map(migration_times)
stats['matched_real_pool_migration_pairs_after'] = describe(pairs.loc[(pairs.event_time>=pairs.migration_time)&pairs.trade_aligned,'ret'])

game = pd.read_csv(out/'game-five-second-prices.csv')
stats['game_2cdbb97'] = {'seeds':4,'tokens':40,'ticks_per_token':720,'all_5s_ticks':describe(game['return']), 'nonzero_5s_ticks':describe(game.loc[game['return'].abs()>1e-12,'return']), 'unchanged_pct':float((game['return'].abs()<=1e-12).mean()*100)}

# Repeat the same reserve-price and trade-alignment checks on the final shard.
later = pd.read_parquet(cache/'trades-00017.parquet',columns=cols)
later_r = later.sol_amount/(later.token_amount*later.price_sol)
lv = (later.price_sol>0)&later_r.between(.01,100)&np.isclose(later.price_sol,later.v_sol_bonding_curve/later.v_tokens_bonding_curve/1000,rtol=1e-5,atol=0)
later = later.loc[lv & ~later.duplicated(['mint','tx_signature'],keep=False)].sort_values(['mint','event_time','id'])
lg=later.groupby('mint',sort=False)
later['ret']=lg.price_sol.pct_change(fill_method=None)
later['gap']=lg.event_time.diff().dt.total_seconds()
later['k']=later.v_sol_bonding_curve*later.v_tokens_bonding_curve
later['kchange']=later.groupby('mint',sort=False).k.pct_change(fill_method=None)
lmatch=np.isclose((later.v_sol_bonding_curve-lg.v_sol_bonding_curve.shift()).abs()/1e9,later.sol_amount,rtol=.03,atol=1e-7)&np.isclose((later.v_tokens_bonding_curve-lg.v_tokens_bonding_curve.shift()).abs()/1e6,later.token_amount,rtol=.03,atol=1e-4)
lp=later.loc[later.gap.between(0,5,inclusive='right')&later.kchange.abs().le(.001)&lmatch]
stats['later_shard_sensitivity']={'rows_clean':len(later),'time_start':str(later.event_time.min()),'time_end':str(later.event_time.max()),'trade_aligned_pairs':describe(lp.ret)}

# Examples retain context and source flags; collector timestamps are not independently verified chain timestamps.
example_rows = pairs.loc[(pairs.token_observations>=100)&pairs.standard_virtual_curve&pairs.trade_aligned].copy()
examples = pd.concat([example_rows.loc[example_rows.ret.between(.2,1)].nlargest(3,'ret'), example_rows.loc[example_rows.ret.between(-.8,-.2)].nsmallest(3,'ret')]).drop_duplicates('mint')
example_fields = ['mint','prev_time','event_time','gap','prev_price','price_sol','ret','is_buy','sol_amount','prev_sol','v_sol_bonding_curve','prev_tok','v_tokens_bonding_curve','kchange','source','prev_source','prev_signature','tx_signature','token_observations']
examples[example_fields].to_csv(out/'historical-jump-examples.csv', index=False)

# A second supplier's sample: slot-order return checks only. Timestamp fractions encode transaction indices.
sw = pd.read_parquet(cache/'pumpswap_sample_1hr.parquet').sort_values(['mint','slot','tx_index'])
sg = sw.groupby('mint', sort=False)
sw['ret'] = sg.mcap_usd.pct_change(fill_method=None)
sw['slot_gap'] = sg.slot.diff()
stats['pumpswap_sample'] = {'rows':len(sw), 'tokens':sw.mint.nunique(), 'same_slot_adjacent_trades':describe(sw.loc[sw.slot_gap==0,'ret']), 'timestamp_warning':'fractional timestamp appears to encode tx_index; no subsecond timestamp claims made; USD market-cap ratios need independent reserve verification'}
(out/'historical-short-horizon-stats.json').write_text(json.dumps(stats,indent=2,allow_nan=False))
print(json.dumps(stats,indent=2))

# Export several price paths from the MIT-licensed curve dataset with visible relative timing.
paths=[]
for mint in examples.mint:
    event = examples.loc[examples.mint==mint].iloc[0]
    path = df.loc[(df.mint==mint) & (df.event_time >= event.event_time-pd.Timedelta(seconds=20)) & (df.event_time<=event.event_time+pd.Timedelta(seconds=40))].copy()
    path['seconds_from_jump']=(path.event_time-event.event_time).dt.total_seconds()
    path['relative_price']=path.price_sol/event.prev_price
    paths.append(path[['mint','event_time','seconds_from_jump','relative_price','price_sol','is_buy']])
pd.concat(paths).to_csv(out/'historical-example-paths.csv',index=False)

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig, axes=plt.subplots(1,2,figsize=(12,4.7),layout='constrained')
thresholds=np.geomspace(.00001,100,250)
historical_curve=active.loc[standard_bars,'ret'].abs()*100
for label,values,color in [('Historical: standard curve, active 5s',historical_curve,'#ca6730'),('Game: every 5s tick, NPC-only',game['return'].abs()*100,'#346b92')]:
    axes[0].plot(thresholds,[(values>=v).mean()*100 for v in thresholds],label=label,color=color)
axes[0].set(xscale='log',yscale='log',xlabel='Absolute price change (%)',ylabel='Intervals exceeding change (%)',ylim=(.01,100),title='Magnitude and frequency differ sharply')
axes[0].grid(alpha=.2);axes[0].legend(fontsize=8)
x=np.arange(4)
q=[.9,.95,.99,.999]
axes[1].bar(x-.18,[historical_curve.quantile(v) for v in q],.36,label='Historical active curve intervals',color='#ca6730')
axes[1].bar(x+.18,[game['return'].abs().quantile(v)*100 for v in q],.36,label='Game ticks',color='#346b92')
axes[1].set(xticks=x,xticklabels=['90th','95th','99th','99.9th'],ylabel='Absolute change (%)',title='Five-second return percentiles')
axes[1].legend(fontsize=8);axes[1].grid(axis='y',alpha=.2)
fig.suptitle('Exploratory historical sample vs. build 2cdbb97',fontweight='bold')
fig.text(.5,-.04,'Different populations: history is standard-curve-invariant, active intervals; game is 40 launches, first hour, no humans/news.\nCollector timestamps are not independently verified chain timestamps. This is a diagnostic comparison, not a fitted calibration.',ha='center',fontsize=8)
fig.savefig(out/'price-cadence-comparison.png',dpi=160,bbox_inches='tight')
