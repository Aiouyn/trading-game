import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';

const root = 'proof/memecoin-visual-20261015';
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const img = (path, caption) => `<figure><a href="${esc(path)}"><img loading="lazy" src="${esc(path)}" alt="${esc(caption)}"></a><figcaption>${esc(caption)}<br><code>${esc(path)}</code></figcaption></figure>`;
const group = (title, description, rows) => `<section><h2>${esc(title)}</h2><p>${esc(description)}</p><div class="grid">${rows.join('\n')}</div></section>`;

const game = manifest.gameLaunchesAtSnapshot.flatMap((x) => ['1m', '5m'].map((tf) =>
  img(`before/game-${x.ticker}-${tf}-maximized.png`, `${x.ticker} · game ${tf} · ${x.ageElapsedMinutes} nominal elapsed minutes at tick 2220 (${x.ageGameDays.toFixed(2)} game days at snapshot).`)));
const gameAfter = manifest.gameAfterPreview.launches.flatMap((x) => ['1m', '5m'].map((tf) =>
  img(`after/game-${x.ticker}-${tf}-maximized.png`, `${x.ticker} · AFTER game ${tf} · ${x.ageElapsedMinutes} nominal elapsed minutes at source snapshot tick 2220 (${x.ageGameDays.toFixed(2)} game days).`)));
const gameFinal = ['TZSL', 'HUQB', 'UKC', 'WLLK'].flatMap((ticker) => ['1m', '5m'].map((tf) =>
  img(`final/game-${ticker}-${tf}-final-8794.png`, `${ticker} · FINAL game ${tf} · authoritative risk-exit source, world 8794, snapshot tick 2220.`)));
const gameFrozen = ['TZSL', 'HUQB', 'UKC', 'WLLK'].flatMap((ticker) => ['1m', '5m'].map((tf) =>
  img(`final-settled-risk/game-${ticker}-${tf}-final-8795.png`, `${ticker} · FINAL FREEZE game ${tf} · corrected risk-exit source, world 8795, snapshot tick 2220.`)));
const young = manifest.realYoungPools.flatMap((x) => x.screenshots.map((path) =>
  img(path, `${x.name} (${x.symbol}) · ${path.endsWith('1m.png') ? '1m' : '5m'} · UI age ${x.uiAgeAtScreenshot}; ${x.shape}`)));
const micro = manifest.realVeryYoungMicrostructure.flatMap((x) => x.screenshots.map((path) =>
  img(path, `${x.symbol} · ${path.endsWith('1s.png') ? '1s' : '1m'} · UI age ${x.uiAgeAtScreenshot}; early microstructure only.`)));
const mature = manifest.realMatureContext.flatMap((x) => x.screenshots.filter((p) => !p.includes('test')).map((path) =>
  img(path, `${x.symbol} · ${path.includes('-1m') ? '1m' : '5m'} · mature context (${x.uiAge}); not launch-age matched.`)));
const youngSources = manifest.realYoungPools.map((x) => `<li><a href="${esc(x.url)}">${esc(x.name)} (${esc(x.symbol)})</a> · ${x.candles} observed ${x.tf} candles / ${x.spanMinutes} min span; ${x.missingMinutes} missing minute intervals; liquidity $${x.liquidityUsd ?? 'n/a'}; 1h change ${x.priceChange1hPct}%.</li>`).join('\n');
const limitation = manifest.limitations.map((s) => `<li>${esc(s)}</li>`).join('\n');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Memecoin visual evidence · 2026-10-15</title>
<style>
body{margin:0;background:#101319;color:#e5e7eb;font:16px/1.5 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:28px}h1{font-size:30px}h2{margin-top:42px;border-bottom:1px solid #39404b;padding-bottom:8px}a{color:#8fc4ff}p,li{color:#bec6d1}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px}figure{margin:0;background:#1b2028;border:1px solid #39404b;border-radius:8px;padding:8px}img{display:block;width:100%;height:auto;border-radius:4px}figcaption{font-size:13px;padding:8px 3px 3px;overflow-wrap:anywhere}code{font-size:11px;color:#99a4b3}.tag{background:#273241;padding:2px 8px;border-radius:99px;margin-right:6px;font-size:13px}
</style><main>
<h1>Real and in-game memecoin chart evidence</h1>
<p><span class="tag">Native screenshots</span><span class="tag">2026-10-15</span><span class="tag">No chart data redrawn</span></p>
<p>Each image is an original browser screenshot from GeckoTerminal or the current-code Launchpad preview. This page only arranges the PNGs; open any image for the full capture. Selection notes and caveats follow.</p>
${group('BEFORE: current-code game launches · maximized app', 'Disposable preview world 8791, controlled eight-launch fixture, 1× pace. Initial source snapshot tick 2220; each launch creates settled-fill candles. 1m charts contain 91–126 bars at the source snapshot. The controlled fixture is not natural launch-frequency evidence.', game)}
${group('INTERMEDIATE AFTER: quiet-window-only stage · maximized app', 'Disposable preview world 8792, same seed, launch schedule, tick-2220 snapshot, ages, and 1m/5m viewports. This stage predates the bounded inventory-risk exit correction and is retained only to show the intermediate state. It is superseded by the FINAL group below.', gameAfter)}
${group('INTERMEDIATE: initial risk-exit source', 'Disposable preview world 8794, same seed and snapshot. This version predates the corrected risk-exit causality and is retained only as an intermediate stage.', gameFinal)}
${group('FINAL FREEZE: corrected risk-exit source · matched representative launches', 'Authoritative disposable preview world 8795, source frozen after verification and ordering review; same seed, schedule, tick-2220 snapshot and maximized viewport. These four representative tokens are captured at 1m and 5m.', gameFrozen)}
${group('Young real pools · matching minute-candle horizon', 'Fresh pools with independently checked creation time and raw OHLCV. Missing intervals are left visible; no-trade periods are not padded into synthetic bars.', young)}
<section><h3>Young-pool provenance</h3><ul>${youngSources}</ul><p>Full timestamps, raw candles, calculations, and provider URLs: <a href="young-pool-api-evidence.json">young-pool-api-evidence.json</a>.</p></section>
${group('Very young real pools · 1-second detail', 'Pools around 6–7 minutes old. 1s detail illustrates opening tape, but 1m views often contain only one candle; do not use these for 30–90m delivery comparisons.', micro)}
${group('Mature real-coin context', 'Canonical high-liquidity pools selected by token and highest-liquidity pool; active native 1m/5m windows are several hours wide and ages are 1–3 years. Context only, not launch-age matched.', mature)}
<section><h2>Measured comparison caveat</h2><p>At the same tick across eight controlled launches, flat 1-minute bars moved from 0–1.1% before to 6.3–14.9% in the authoritative FINAL FREEZE snapshot; maximum flat run moved from 0–1 to 2–4 minutes. Median absolute close changes and median range/open stayed broadly comparable. Both earlier after snapshots are retained as intermediate stages and are superseded. This is evidence of changed activity in one seed, not evidence that every real launch is matched. See <a href="game-young-launchpath-metrics.json">BEFORE metrics</a>, <a href="game-young-launchpath-after-metrics.json">quiet-only intermediate metrics</a>, <a href="game-young-launchpath-authoritative-final-metrics.json">8794 intermediate metrics</a>, and <a href="game-young-launchpath-final-freeze-metrics.json">FINAL FREEZE metrics</a>.</p></section>
<section><h2>Selection and limits</h2><ul>${limitation}</ul><p>Capture metadata: <a href="manifest.json">manifest.json</a> and <a href="capture-index.json">capture-index.json</a>. The game source inventory is in <a href="../../docs/audit/CURRENT-CHANGES-2026-10-15.md">CURRENT-CHANGES-2026-10-15.md</a>.</p></section>
</main></html>`;
await mkdir(`${root}/after`, { recursive: true });
await writeFile(`${root}/index.html`, html, 'utf8');
const imagePaths = [...html.matchAll(/<img[^>]+src="([^"]+)/g)].map((match) => match[1]);
const captures = await Promise.all(imagePaths.map(async (imagePath) => {
  const file = `${root}/${imagePath}`;
  const metadata = await stat(file);
  return { path: imagePath, bytes: metadata.size, fileModifiedUtc: metadata.mtime.toISOString() };
}));
await writeFile(`${root}/capture-index.json`, `${JSON.stringify(captures, null, 2)}\n`, 'utf8');
console.log(`${root}/index.html`);
