import json, sys, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt, matplotlib.image as mpimg
from plot import bars, draw
SHOTS = [('motion-15s','Motion 15s (trender)'),('ftr-1m','FTR 1m (grinder -> runner)'),('baton-15m-full','baton 15m full (runner, 1 month)'),('baton-15m-lastdays','baton 15m last days'),
         ('botcoin-15s','BOTCOIN 15s (trender)'),('trump1-15s','Trump $1 15s (runner: pump, fade)'),('rostr-15s-quickdeath','ROSTR 15s (quick death)')]
corp = json.load(open('../out/refs/corpus-v2.json'))
TF = {'15s': (3, 720, 'first 3 h'), '1m': (12, 720, 'first 12 h')}
def sheet(tf, sims, name, path):
    k, n, span = TF[tf]; rows = 3 + (2 if sims else 0); fig = plt.figure(figsize=(24, 3.6 * rows), facecolor='#0b0d10'); gs = fig.add_gridspec(rows, 5, hspace=0.35, wspace=0.15)
    for j, (f, lab) in enumerate(SHOTS):
        ax = fig.add_subplot(gs[j // 4, j % 4]); ax.imshow(mpimg.imread(f'../refs-real/{f}.png')); ax.axis('off'); ax.set_title('REAL screenshot: ' + lab, fontsize=8, color='w')
    for i in (0, 1): fig.add_subplot(gs[i, 4]).axis('off')
    fig.add_subplot(gs[1, 3]).axis('off')
    for j, (m, c) in enumerate(corp['coins'].items()):
        L = len(c['px']); kk = k if L // k >= 20 else 1
        draw(fig, gs[2, j], c['px'], c['vol'], kk, n, mc=MC_REAL if MCAP else None, title= f'REAL corpus {m[:6]}..: {c["label"]}, {L*5//60} min' + ('' if kk == k else ' (5s candles: too short)'))
    fig.add_subplot(gs[2, 4]).axis('off')
    fig.text(0.81, 0.97, ('MCAP mode: y = market cap in USD (real corpus: launch = 27.96 SOL x $150).\n' if MCAP else '') + 'Rows 1-2: Mathis\'s real screenshots (own timeframes, market cap).\nRow 3: real Pump.fun corpus coins (Slinky21 shard 00000,\ncleaned as the audit), $ volume at $150/SOL.\n' + (f'Rows 4-5: approach {name}, 10 sim coins (2 each:\nrug, quick, grinder, trender, runner), {tf} candles, {span}.\nGold dashed = graduation to the x*y=k pool.' if sims else ''), color='w', fontsize=9, va='top')
    for j, s in enumerate(sims or []):
        draw(fig, gs[3 + j // 5, j % 5], s['px'], s['vol'], k, n, mc=1e9 if MCAP else None, gradtick=s['grad'], title= f'SIM {name} #{j+1} hidden type: {s["type"]}' + (f' (grad {s["grad"]*5//60} min)' if s['grad'] >= 0 else ''))
    fig.suptitle(f'{tf}: ' + (f'approach {name} vs real' if sims else 'real references'), color='w', fontsize=13)
    fig.savefig(path, dpi=80, facecolor=fig.get_facecolor(), bbox_inches='tight'); plt.close(fig)
import os
MCAP = os.environ.get('MCAP') == '1'; MC_REAL = 27.96 * 150  # real Pump.fun start: 30 SOL virtual / 1.073B tokens x 1B = 27.96 SOL mcap, at $150/SOL
DATA = os.environ.get('DATA'); TAG = os.environ.get('TAG', '')

for name in sys.argv[1:]:
    sub = os.environ.get('SUB', '' if name == 'AH' else '/v2'); os.makedirs(f'../out/{name}{sub}', exist_ok=True); d = json.load(open(DATA or f'../out/{name}/data.json'))
    for tf in TF: sheet(tf, d['charts'], name, f'../out/{name}{sub}/{name}-vs-real-{tf}{TAG}.png')
print('ok')
