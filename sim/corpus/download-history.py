"""Download pinned public historical data into a temporary research cache."""
import hashlib
import json
from pathlib import Path
import tempfile
import requests

cache = Path(tempfile.gettempdir()) / 'memecoin-history'
cache.mkdir(exist_ok=True)
repo = 'Slinky21/Pumpfun_Memecoin_Corpus'
rev = '13bec2bf3089d56d50c35e602616d1b993bb37f5'
files = [
    (repo, rev, 'KNOWN_ISSUES.md'),
    (repo, rev, 'README.md'),
    (repo, rev, 'trades/trades-00000.parquet'),
    (repo, rev, 'trades/trades-00017.parquet'),
    (repo, rev, 'migrations.parquet'),
]
second = requests.get('https://huggingface.co/api/datasets/biznus1/pumpswap-historical-trades', timeout=30)
second.raise_for_status()
files.extend([
    ('biznus1/pumpswap-historical-trades', second.json()['sha'], 'README.md'),
    ('biznus1/pumpswap-historical-trades', second.json()['sha'], 'pumpswap_sample_1hr.parquet'),
])
manifest = []
for dataset, revision, name in files:
    filename = Path(name).name
    if dataset.startswith('biznus1') and filename == 'README.md':
        filename = 'pumpswap-README.md'
    target = cache / filename
    url = f'https://huggingface.co/datasets/{dataset}/resolve/{revision}/{name}?download=true'
    if not target.exists():
        print('Downloading', name, flush=True)
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        partial = target.with_suffix(target.suffix + '.partial')
        total = 0
        with partial.open('wb') as handle:
            for chunk in response.iter_content(4 * 1024 * 1024):
                handle.write(chunk)
                total += len(chunk)
                if total // (50 * 1024 * 1024) != (total - len(chunk)) // (50 * 1024 * 1024):
                    print(round(total / 1e6, 1), 'MB', flush=True)
        partial.replace(target)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    manifest.append(dict(dataset=dataset, revision=revision, file=name, path=str(target), bytes=target.stat().st_size, sha256=digest, url=url))
    print(filename, target.stat().st_size, digest, flush=True)
(cache / 'manifest.json').write_text(json.dumps(manifest, indent=2))
