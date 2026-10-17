# The audit's own cleaning (analyze-history.py lines 13-22): valid reserve price, sane ratio, ambiguous tx duplicates removed.
import pandas as pd, numpy as np
raw = pd.read_parquet('cache/trades-00000.parquet', columns=['id','mint','tx_signature','event_time','seconds_since_launch','is_buy','sol_amount','token_amount','user_wallet','v_tokens_bonding_curve','v_sol_bonding_curve','price_sol','curve_pct_depleted'])
valid = (raw.price_sol > 0) & (raw.v_tokens_bonding_curve > 0) & (raw.v_sol_bonding_curve > 0) & np.isfinite(raw.price_sol)
ratio = raw.sol_amount / (raw.token_amount * raw.price_sol); valid &= ratio.between(.01, 100)
valid &= np.isclose(raw.price_sol, raw.v_sol_bonding_curve / raw.v_tokens_bonding_curve / 1000, rtol=1e-5, atol=0)
df = raw.loc[valid]; df = df.loc[~df.duplicated(['mint','tx_signature'], keep=False)].sort_values(['mint','event_time','id'])
df[['mint','seconds_since_launch','is_buy','sol_amount','user_wallet','price_sol','curve_pct_depleted']].to_parquet('cache/slim.parquet'); print(len(df), df.mint.nunique())
