"""Public Binance 1-second candles, resampled to 5 seconds; stdlib only.
Small fixed sample, not an asset-universe calibration or a memecoin launch sample.
Raw archives stay in the OS temp cache; provenance and aggregate statistics go in proof.
"""
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import tempfile
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

CACHE = Path(tempfile.gettempdir()) / 'trading-game-economy-audit-history'
CACHE.mkdir(exist_ok=True)
OUT = Path('proof/economy-audit')
OUT.mkdir(parents=True, exist_ok=True)

def summary(xs):
    ys = sorted(abs(x) for x in xs)
    q = lambda p: ys[int((len(ys)-1)*p)]*100
    avg = sum(xs)/len(xs)
    return dict(n=len(xs), absP50Pct=q(.5), absP95Pct=q(.95), absP99Pct=q(.99),
                maxAbsPct=ys[-1]*100, flatPct=sum(abs(x)<1e-12 for x in xs)/len(xs)*100,
                sdPct=math.sqrt(sum((x-avg)**2 for x in xs)/len(xs))*100)

def fetch(job):
    symbol, day = job
    name = f'{symbol}-1s-{day}.zip'
    url = f'https://data.binance.vision/data/spot/daily/klines/{symbol}/1s/{name}'
    path = CACHE/name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    raw = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        rows = list(csv.reader(io.StringIO(archive.read(archive.namelist()[0]).decode())))
    buckets = {}
    for row in rows:
        ts = int(row[0])
        # Binance spot switched archive timestamps to microseconds in January 2025.
        seconds = ts//(1000000 if ts > 10**15 else 1000)
        buckets[seconds//5] = float(row[4])
    closes = sorted(buckets.items())
    returns = [p/closes[i-1][1]-1 for i,(b,p) in enumerate(closes) if i and b-closes[i-1][0]==1]
    return dict(symbol=symbol, day=day, source=url, sha256=hashlib.sha256(raw).hexdigest(),
                rows=len(rows), fiveSecondBars=len(closes), stats=summary(returns)), returns

jobs = [(s,d) for s in ['BTCUSDT','ETHUSDT','PEPEUSDT'] for d in ['2025-01-15','2025-07-15']]
outputs = list(ThreadPoolExecutor(max_workers=3).map(fetch, jobs))
result = dict(method='1s candle closes resampled into consecutive 5s closes; simple returns including unchanged intervals',
              limitation='Two UTC days per asset. Centralized spot exchange assets, not new launch curves. Wall-clock comparison only; game has a compressed economic calendar.',
              inputs=[row for row,_ in outputs], pooled={s:summary([x for row,xs in outputs if row['symbol']==s for x in xs]) for s in ['BTCUSDT','ETHUSDT','PEPEUSDT']})
(OUT/'historical-spot.json').write_text(json.dumps(result,indent=2), encoding='utf-8')
print(json.dumps(result,indent=2))
