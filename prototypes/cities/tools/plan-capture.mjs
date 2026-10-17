// Orthographic plan closeups of the road conditions an architect would dimension.
// Not a catalogue of buildings: one drawing per road problem.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ready } from './browser-ready.mjs';

const [base = 'http://127.0.0.1:3650', dir = 'prototypes/cities/evidence/plans'] = process.argv.slice(2);
const out = resolve(dir);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce' });
  await ready(page, `${base}/?city=avalon&t=15`);
  const picks = await page.evaluate(() => {
    const city = window.__cities.city;
    const g = city.roadGraph;
    const deg = new Map();
    for (const e of g.edges) {
      deg.set(e.a, (deg.get(e.a) || 0) + 1);
      deg.set(e.b, (deg.get(e.b) || 0) + 1);
    }
    const len = (e) => e.pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - e.pts[i - 1][0], p[1] - e.pts[i - 1][1]) : 0, 0);
    const mid = (e) => e?.pts[e.pts.length >> 1] ?? null;
    const longest = (cls) => g.edges.filter((e) => e.cls === cls).sort((a, b) => len(b) - len(a))[0];
    const node = (d) => {
      for (const [id, n] of deg) if (n === d) return g.nodes[id];
      return null;
    };
    const drives = (city.network ?? []).filter((n) => n.cls <= 1 && n.pts?.length > 1);
    drives.sort((a, b) => b.pts.length - a.pts.length);
    return {
      local: mid(longest(2)),
      collector: mid(longest(3)),
      arterial: mid(longest(4)),
      tee: node(3),
      cross: node(4),
      deadend: node(1),
      drive: drives[0]?.pts[Math.floor(drives[0].pts.length / 2)] ?? null,
    };
  });
  const shots = [
    ['local', picks.local, 0.045],
    ['collector', picks.collector, 0.05],
    ['arterial', picks.arterial, 0.06],
    ['tee', picks.tee, 0.04],
    ['cross', picks.cross, 0.04],
    ['deadend', picks.deadend, 0.035],
    ['drive', picks.drive, 0.03],
  ];
  const canvas = await page.$('canvas');
  for (const [name, p, scale] of shots) {
    if (!p) { console.log('missing', name); continue; }
    await page.evaluate(({ x, z, scale }) => {
      const v = window.__cities.view;
      v.setQualityTier('high');
      v.motion = false;
      v.fly = null;
      v.setPlan(true);
      v.target.set(x, 0, z);
      v.scale = scale;
      v.yaw = v.yawTarget = 0;
      v.flushChunks();
      v.dirty = true;
      v.frame(0);
    }, { x: p[0], z: p[1], scale });
    await canvas.screenshot({ path: join(out, `${name}.png`) });
    console.log('plan', name, p.map((n) => Math.round(n)).join(','));
  }
} finally {
  await browser.close();
}
