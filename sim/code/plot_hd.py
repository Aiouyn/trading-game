#!/usr/bin/env python3
"""Hi-res Pump.fun-style charts (Mathis standard, v13+). Usage (also for Sweep):
  python3 sim/plot_hd.py --data out/OBS/v13.1/data.json --out out/OBS/v13.1/hd [--coins all|0,3,5] [--pairs] [--overview] [--refs out/refs/corpus-v2.json]
Per coin: <out>/coin-XX-<label>.png (>=2400x1400 @200 dpi): full life (auto bar size) + zooms launch / peak / fade; log USD mcap; volume pane.
--pairs: <out>/pairs/pair-*.png: real corpus coin (replotted from trades) or original screenshot (native pixels) beside a matching sim coin.
--overview: <out>/overview-pNN.png, 6 coins per page at 4800x2800."""
import json, argparse, os, re, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt, matplotlib.image as mpimg, matplotlib.ticker as mt
plt.rcParams['text.parse_math'] = False  # literal $ in titles
TICK = 5; SOL_USD = 150; REAL_MC0 = 27.96 * SOL_USD  # real Pump.fun launch mcap (30 SOL virtual / 1.073B x 1B) at $150/SOL
BG, PANEL, GRID, UP, DN = '#0b0d10', '#111418', '#2a2e36', '#26a69a', '#ef5350'
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
def life_end(vol):  # last active tick (+5 min) = death or end of run
    nz = np.nonzero(np.asarray(vol) > 0)[0]; return int(min(len(vol), (nz[-1] + 60) if len(nz) else len(vol)))
def auto_k(n, target=220):  # bar size in ticks from a Pump.fun-like ladder so ~120-300 candles show
    ks = (1, 3, 12, 60, 180, 720)  # 5s, 15s, 1m, 5m, 15m, 1h
    for k in ks:
        if n / k <= target * 1.4: break
    while k > 1 and n / k < 12: k = ks[ks.index(k) - 1]  # short/sparse coins: keep >=12 candles, down to 5 s
    return k
LBL = {1: '5s', 3: '15s', 12: '1m', 60: '5m', 180: '15m', 720: '1h'}
def bars(mc, vol, a, b, k):
    mc = np.asarray(mc[a:b], float); vol = np.asarray(vol[a:b], float); m = len(mc) // k
    if m == 0: return [np.array([])] * 5
    prev = mc[0]; O, H, L, C, V = [], [], [], [], []
    for i in range(m):
        s = mc[i * k:(i + 1) * k]; O.append(prev); H.append(max(prev, s.max())); L.append(min(prev, s.min())); C.append(s[-1]); V.append(vol[i * k:(i + 1) * k].sum()); prev = s[-1]
    return [np.array(x) for x in (O, H, L, C, V)]
def fmt_usd(v, _=None): return f'${v/1e9:.1f}B' if v >= 1e9 else f'${v/1e6:.1f}M' if v >= 1e6 else f'${v/1e3:.0f}k' if v >= 1e3 else f'${v:.0f}'
def panel(fig, spec, mc, vol, a, b, k, title, ylim=None, grad=None, lw=1.0):
    sub = spec.subgridspec(2, 1, height_ratios=[3.2, 1], hspace=0.04); ax = fig.add_subplot(sub[0]); av = fig.add_subplot(sub[1], sharex=ax)
    O, H, L, C, V = bars(mc, vol, a, b, k); x = (a + np.arange(len(O)) * k) * TICK / 60  # minutes since launch
    if len(O):
        col = np.where(C >= O, UP, DN); w = k * TICK / 60 * 0.75
        ax.vlines(x, L, H, color=col, lw=lw * 0.8); ax.bar(x, np.maximum(np.abs(C - O), C * 1e-4), bottom=np.minimum(O, C), color=col, width=w, align='center'); av.bar(x, V, color=col, width=w)
    ax.set_yscale('log'); ax.yaxis.set_major_locator(mt.LogLocator(base=10, subs=(1, 2, 5), numticks=30)); ax.yaxis.set_major_formatter(mt.FuncFormatter(fmt_usd)); ax.yaxis.set_minor_locator(mt.LogLocator(base=10, subs=tuple(range(1, 10)), numticks=60)); ax.yaxis.set_minor_formatter(mt.NullFormatter())
    if ylim: ax.set_ylim(*ylim)
    if grad is not None and grad >= 0 and a <= grad < b: ax.axvline(grad * TICK / 60, color='gold', lw=1, ls='--'); ax.text(grad * TICK / 60, ax.get_ylim()[1], ' graduation', color='gold', fontsize=7, va='top')
    av.yaxis.set_major_formatter(mt.FuncFormatter(fmt_usd)); av.set_xlabel('minutes since launch', fontsize=7, color='#bbb')
    for a_ in (ax, av):
        a_.set_facecolor(PANEL); a_.tick_params(labelsize=7, colors='#ccc'); a_.grid(color=GRID, lw=0.4); [s.set_color('#333') for s in a_.spines.values()]
    ax.tick_params(labelbottom=False); ax.set_title(f'{title}  [{LBL[k]} candles]', fontsize=9, color='w', loc='left'); ax.set_ylabel('market cap (USD, log)', fontsize=7, color='#bbb'); av.set_ylabel('volume $', fontsize=7, color='#bbb')
    return ax
def coin_layout(fig, spec, mc, vol, name, grad=-1, ylim=None):
    """main full-life chart on top, zooms (launch / peak / fade) below; returns ylim used"""
    end = life_end(vol); pk = int(np.argmax(mc[:end])); lo, hi = max(1.0, np.min(mc[:end]) * 0.8), np.max(mc[:end]) * 1.25; ylim = ylim or (lo, hi)
    g = spec.subgridspec(2, 3, height_ratios=[1.35, 1], hspace=0.32, wspace=0.18)
    panel(fig, g[0, :], mc, vol, 0, end, auto_k(end), f'{name}: full life, {end*TICK/3600:.1f} h (launch to {"end of run" if end >= len(vol) else "death"})', ylim, grad)
    end = max(end, 36); la = min(end, 360); panel(fig, g[1, 0], mc, vol, 0, la, auto_k(la, 120), 'zoom: launch (first 30 min)', None, grad)
    a, b = max(0, pk - 180), min(end, pk + 180); a, b = (max(0, min(a, b - 36)), max(b, a + 36)); panel(fig, g[1, 1], mc, vol, a, b, auto_k(b - a, 120), f'zoom: peak {fmt_usd(mc[pk])} at {pk*TICK/60:.0f} min', None, grad)
    a, b = pk, min(end, pk + max(360, (end - pk))); panel(fig, g[1, 2], mc, vol, a, max(b, a + 36), auto_k(max(36, b - a), 160), 'zoom: fade (peak to death/end)', None, grad)
    return ylim
def save(fig, path): os.makedirs(os.path.dirname(path), exist_ok=True); fig.savefig(path, dpi=200, facecolor=BG); plt.close(fig); return path
def sim_coins(d): return [dict(name=f'SIM #{i+1} {c["type"]}', label=c['type'].split()[0], mc=np.asarray(c['px'], float) * 1e9, vol=np.asarray(c['vol'], float), grad=c.get('grad', -1)) for i, c in enumerate(d['charts'])]
SHOTS = [('motion-15s', 'Motion 15s (trender)', 'trender', 3, 720), ('ftr-1m', 'FTR 1m (grinder turning runner)', 'grinder', 12, 2880), ('baton-15m-full', 'baton 15m full (runner, ~1 month)', 'runner', 180, 5040),
         ('baton-15m-lastdays', 'baton 15m last days (runner)', 'runner', 180, 5040), ('botcoin-15s', 'BOTCOIN 15s (trender)', 'trender', 3, 720), ('trump1-15s', 'Trump $1 15s (runner: pump, fade)', 'runner', 3, 3960), ('rostr-15s-quickdeath', 'ROSTR 15s (quick death)', 'quick', 3, 720)]
def match(coins, label):
    c = [x for x in coins if x['label'] == label]
    if c: return c[0], ''
    best = max(coins, key=lambda x: x['mc'].max() / x['mc'][0]); return best, f' (no sim {label} in this batch: highest-peak sim coin shown)'
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--data', required=True); ap.add_argument('--out', required=True); ap.add_argument('--coins', default='all'); ap.add_argument('--pairs', action='store_true'); ap.add_argument('--overview', action='store_true')
    ap.add_argument('--refs', default=os.path.join(ROOT, 'out/refs/corpus-v2.json')); ap.add_argument('--shots', default=os.path.join(ROOT, 'refs-real')); a = ap.parse_args()
    d = json.load(open(a.data)); coins = sim_coins(d); sel = range(len(coins)) if a.coins == 'all' else [int(x) for x in a.coins.split(',')]; out = []
    for i in sel:
        c = coins[i]; fig = plt.figure(figsize=(12, 7), facecolor=BG); coin_layout(fig, fig.add_gridspec(1, 1, left=0.07, right=0.98, top=0.93, bottom=0.07)[0], c['mc'], c['vol'], c['name'], c['grad'])
        fig.suptitle(f'{c["name"]}  |  hidden traits shown for review only', color='w', fontsize=11); out.append(save(fig, f'{a.out}/coin-{i+1:02d}-{re.sub("[^a-z]", "", c["label"])}.png'))
    if a.pairs:
        corp = json.load(open(a.refs))['coins']
        for mint, rc in corp.items():  # real corpus coins, replotted from trades with the same layout and y range as the sim coin
            lab = 'rug' if rc['label'].startswith('rug') else 'quick'; sc, note = match(coins, lab)
            rmc = np.asarray(rc['px'], float) * REAL_MC0; rvol = np.asarray(rc['vol'], float); n = max(life_end(rvol), 12)
            ylim = (max(1.0, min(rmc[:n].min(), sc['mc'][:life_end(sc['vol'])].min()) * 0.8), max(rmc[:n].max(), sc['mc'].max()) * 1.25)
            fig = plt.figure(figsize=(24, 7), facecolor=BG); g = fig.add_gridspec(1, 2, left=0.04, right=0.99, top=0.9, bottom=0.07, wspace=0.12)
            coin_layout(fig, g[0], rmc, rvol, f'REAL corpus {mint[:6]}.. ({rc["label"]})', -1, ylim); coin_layout(fig, g[1], sc['mc'], sc['vol'], sc['name'] + note, sc['grad'], ylim)
            fig.suptitle(f'REAL vs SIM, same layout and log scale. Real: Slinky21 shard 00000, replotted from trades (mcap = price x 1B, launch {fmt_usd(REAL_MC0)} at ${SOL_USD}/SOL).', color='w', fontsize=11)
            out.append(save(fig, f'{a.out}/pairs/pair-corpus-{mint[:6]}-vs-sim-{lab}.png'))
        for f, cap, lab, k, span in SHOTS:  # screenshots cannot be replotted: native pixels beside a sim chart of matching span and log scale
            sc, note = match(coins, lab); img = mpimg.imread(f'{a.shots}/{f}.png'); h, w = img.shape[:2]
            fig = plt.figure(figsize=(24, 7), facecolor=BG); g = fig.add_gridspec(1, 2, left=0.02, right=0.99, top=0.88, bottom=0.07, wspace=0.08)
            ax = fig.add_subplot(g[0]); ax.imshow(img, interpolation='nearest'); ax.axis('off'); ax.set_title(f'REAL screenshot (original {w}x{h} px, not replotted): {cap}', color='w', fontsize=10, loc='left')
            end = min(span, len(sc['vol'])); sub = g[1].subgridspec(1, 1)[0]; panel(fig, sub, sc['mc'], sc['vol'], 0, end, k, f'{sc["name"]}{note}: first {end*TICK/3600:.1f} h', None, sc['grad'], lw=1.2)
            fig.suptitle(f'Screenshot pair: real chart is the original image at native resolution (cannot be replotted); sim uses the same candle size ({LBL[k]}), an approximate matching time span and a log USD scale. Screenshot axis scale may be linear.', color='w', fontsize=10)
            out.append(save(fig, f'{a.out}/pairs/pair-shot-{f}-vs-sim-{lab}.png'))
    if a.overview:
        per = 6
        for p in range(0, len(coins), per):
            fig = plt.figure(figsize=(24, 14), facecolor=BG); g = fig.add_gridspec(3, 2, left=0.04, right=0.99, top=0.95, bottom=0.04, hspace=0.3, wspace=0.12)
            for j, c in enumerate(coins[p:p + per]): end = life_end(c['vol']); panel(fig, g[j // 2, j % 2], c['mc'], c['vol'], 0, end, auto_k(end), f'{c["name"]}: full life {end*TICK/3600:.1f} h', None, c['grad'])
            fig.suptitle(f'Overview page {p // per + 1}: {os.path.basename(os.path.dirname(os.path.abspath(a.data)))} (log USD mcap, volume pane, auto candle size)', color='w', fontsize=13); out.append(save(fig, f'{a.out}/overview-p{p // per + 1:02d}.png'))
    print(json.dumps(out, indent=0))
if __name__ == '__main__': main()
