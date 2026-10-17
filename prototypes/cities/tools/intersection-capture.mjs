import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ready } from './browser-ready.mjs';
const [base = 'http://127.0.0.1:3761', directory = 'prototypes/cities/evidence/performance/junctions'] = process.argv.slice(2);
const out = resolve(directory); await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, reducedMotion: 'reduce' });
  await ready(page, `${base}/?city=avalon&t=15`);
  const junctions = await page.evaluate(() => {
    const a = window.__cities, g = a.city.roadGraph, inc = g.nodes.map(() => []);
    for (const e of g.edges) { inc[e.a].push(e); inc[e.b].push(e); }
    const near = degree => g.nodes.map((p, n) => ({ p, n, arms: inc[n] })).filter(j => j.arms.length === degree && j.arms.some(e => e.cls >= 3))
      .sort((a, b) => Math.hypot(a.p[0] + 100, a.p[1] + 400) - Math.hypot(b.p[0] + 100, b.p[1] + 400))[0];
    const list = [near(3), near(4)];
    for (const el of document.body.children) if (!['view', 'sky'].includes(el.id)) el.style.display = 'none';
    a.view.motion = false; a.view.fly = null; a.view.showLabels = false; a.view.setQualityTier('high'); a.setSee('off');
    a.view.setLayers('roads'); // expose the complete surface even beneath tall blocks
    return list.map((j, i) => ({ name: i ? 'cross' : 'tee', node: j.n, p: j.p }));
  });
  for (const j of junctions) for (const [name, plan, yaw] of [['plan', true, 0], ['oblique', false, Math.PI / 4], ['reverse', false, Math.PI * 1.25]]) {
    await page.evaluate(({ j, plan, yaw }) => {
      const v = window.__cities.view;
      v.setPlan(plan); v.yaw = v.yawTarget = yaw;
      v.target.set(j.p[0], v.heightAt(...j.p), j.p[1]); v.scale = 0.12;
      v.dirty = true; v.frame(0);
      for (const o of v.objects) if (['buildings', 'trees'].includes(o.userData.layer)) o.visible = false;
      v.renderer.render(v.scene, v.camera);
    }, { j, plan, yaw });
    await page.locator('#view').screenshot({ path: join(out, `${j.name}-${name}.png`) });
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(junctions, null, 2));
} finally { await browser.close(); }
