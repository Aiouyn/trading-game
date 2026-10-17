import json, sys, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt, matplotlib.ticker
REFS = [(54,'rug-like: pump & dump'),(50,'quick death'),(4,'quick death'),(56,'grinder-like'),(22,'grinder-like'),(67,'trender-like'),(13,'runner-like (best avail.)'),(92,'quiet/dead')]
corp = json.load(open('../out/refs/corpus.json'))
def bars(px, vol, k, n):
    px = np.array(px, float); vol = np.array(vol, float); m = min(len(px)//k, n)
    o, h, l, c, v = [], [], [], [], []
    prev = px[0]
    for i in range(m):
        seg = px[i*k:(i+1)*k]; o.append(prev); h.append(max(prev, seg.max())); l.append(min(prev, seg.min())); c.append(seg[-1]); v.append(vol[i*k:(i+1)*k].sum()); prev = seg[-1]
    return [np.array(a) for a in (o, h, l, c, v)]
def draw(fig, gs, px, vol, k, n, title, gradtick=None, mc=None):
    sub = gs.subgridspec(2, 1, height_ratios=[3, 1], hspace=0.05); ax = fig.add_subplot(sub[0]); av = fig.add_subplot(sub[1], sharex=ax)
    o, h, l, c, v = bars(px, vol, k, n); x = np.arange(len(o)); up = c >= o; col = np.where(up, '#26a69a', '#ef5350')
    p0 = px[0] if mc is None else 1 / mc; o, h, l, c = o/p0, h/p0, l/p0, c/p0  # v6: mc = USD mcap per unit price
    ax.vlines(x, l, h, color=col, lw=0.6); ax.bar(x, np.maximum(np.abs(c-o), 1e-9*c), bottom=np.minimum(o, c), color=col, width=0.8)
    av.bar(x, v, color=col, width=0.8)
    if gradtick is not None and gradtick >= 0 and gradtick//k < len(x): ax.axvline(gradtick//k, color='gold', lw=0.8, ls='--')
    ax.set_title(title, fontsize=7, color='w'); 
    for a in (ax, av):
        a.set_facecolor('#111418'); a.tick_params(labelsize=5, colors='#aaa'); [s.set_color('#333') for s in a.spines.values()]
    ax.tick_params(labelbottom=False); ax.set_ylabel('x launch' if mc is None else 'mcap $', fontsize=5, color='#aaa'); ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f'{v/1e3:.0f}k' if v >= 1e3 else f'{v:.0f}')) if mc is not None else None; av.set_ylabel('$ vol', fontsize=5, color='#aaa')
TF = {'15s': (3, 120, 'first 30 min'), '1m': (12, 180, 'first 3 h')}
def sheet(tf, sims, name, path):
    k, n, span = TF[tf]; rows = 2 + (2 if sims else 0); fig = plt.figure(figsize=(20, 3.1*rows), facecolor='#0b0d10'); gs = fig.add_gridspec(rows, 5, hspace=0.45, wspace=0.25)
    for j, (i, lab) in enumerate(REFS):
        r = corp[i]; draw(fig, gs[j//4, j % 4 + (1 if j//4 else 0) if False else j % 4], r['px'], r['vol'], k, n, f'REAL corpus #{i} ({r["kind"]}) {lab} [{len(r["px"])*5//60} min recorded]')
    fig.add_subplot(gs[0, 4]).axis('off'); fig.add_subplot(gs[1, 4]).axis('off')
    fig.text(0.81, 0.85 if sims else 0.6, 'Rows 1-2: REAL Pump.fun flows (repo historical-flow.json)\nreplayed trade by trade through the game curve.\nThey are only 1-10 min long: short windows,\nnot full lifecycles.\n' + (f'Rows 3-4: approach {name}, 10 sim coins\n(2 each: rug, quick, grinder, trender, runner).\nGold dashed line = graduation to x*y=k pool.' if sims else ''), color='w', fontsize=8, va='top')
    for j, s in enumerate(sims or []):
        draw(fig, gs[2 + j//5, j % 5], s['px'], s['vol'], k, n, f'SIM {name} #{j+1} hidden type: {s["type"]}' + (f' (grad t={s["grad"]*5//60}min)' if s['grad'] >= 0 else ''), s['grad'])
    fig.suptitle(f'{tf} candles, {span}, price as multiple of launch, volume panel' + (f'  |  approach {name} vs real' if sims else '  |  references'), color='w', fontsize=11)
    fig.savefig(path, dpi=90, facecolor=fig.get_facecolor(), bbox_inches='tight'); plt.close(fig)
if __name__ == "__main__":
  for tf in TF: sheet(tf, None, '', f'../out/refs/references-{tf}.png')
  for name in sys.argv[1:]:
      d = json.load(open(f'../out/{name}/data.json'))
      for tf in TF: sheet(tf, d['charts'], name, f'../out/{name}/{name}-vs-real-{tf}.png')
print('done')
