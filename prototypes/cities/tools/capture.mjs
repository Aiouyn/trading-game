import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ready } from './browser-ready.mjs';
import { execFileSync } from 'node:child_process';
const [base = 'http://127.0.0.1:3650', dir = 'prototypes/cities/evidence/after'] = process.argv.slice(2);
const out = resolve(dir);
await mkdir(out, { recursive: true });
const views = [
  ['overview', null], ['oldharbor', [-60, -60, 0.18]], ['oldharbor-close', [-40, -20, 0.07]], ['gilthill-close', [-650, -520, 0.07]],
  ['midtown', [300, -400, 0.2]], ['gilthill', [-650, -500, 0.25]],
  ['westbank', [-950, 150, 0.2]], ['docks', [880, 230, 0.25]],
];
for (const [name, camera] of views.slice(1, 2).concat(views.slice(3, 4))) {
  for (let rotation = 1; rotation < 4; rotation++) views.push([`${name}-rot${rotation}`, camera, rotation]);
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
  const errors = await ready(page, `${base}/?city=avalon&t=15`);
  const captures = [];
  for (const hour of [15, 21]) {
    for (const [name, camera, rotation = 0] of views) {
      if (hour === 21 && !['overview', 'oldharbor', 'midtown'].includes(name)) continue;
      const state = await page.evaluate(({ camera, hour, rotation }) => {
        const a = window.__cities;
        a.setTime(hour); a.setLens('normal'); a.setSee('off'); a.select(null);
        const v = a.view;
        v.motion = false;
        v.fly = null;
        v.yaw = v.yawTarget = Math.PI / 4 + rotation * Math.PI / 2;
        if (camera) { v.target.set(camera[0], 0, camera[1]); v.scale = camera[2]; }
        else v.fit();
        v.dirty = true; v.frame(0);
        return { target: [v.target.x, v.target.z], scale: v.scale, yaw: v.yaw,
          pixelRatio: v.renderer.getPixelRatio(), calls: v.renderer.info.render.calls,
          triangles: v.renderer.info.render.triangles };
      }, { camera, hour, rotation });
      const file = `${name}-${hour}.png`;
      await page.screenshot({ path: join(out, file) });
      captures.push({ file, camera, hour, ...state });
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(join(out, 'capture.json'), JSON.stringify({
    date: new Date().toISOString(), base, toolCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    browser: browser.version(), viewport: { width: 1600, height: 900 }, captures, errors }, null, 2));
  console.log(`captured ${captures.length} views`);
} finally {
  await browser.close();
}
