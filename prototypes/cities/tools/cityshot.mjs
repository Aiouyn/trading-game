// node cityshot.mjs <port> <outDir> <city> [hour] [x z scale] : renders one frame of the cities prototype headless
import { chromium } from 'playwright';
import { ready } from './browser-ready.mjs';
const [port, out, city = 'avalon', hour = '15', x, z, scale] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = await ready(p, `http://localhost:${port}/?city=${city}&t=${hour}`);
  await p.evaluate(([x, z, scale]) => { const v = window.__cities.view; if (x !== undefined && x !== null && x !== '') { v.target.set(+x, 0, +z); v.scale = +scale; } else v.fit(); v.dirty = true; v.frame(0); }, [x, z, scale]);
  await p.waitForTimeout(400);
  const name = `${out}/${city}-${hour}${x ? `-${x}_${z}_${scale}` : ''}.png`;
  await p.screenshot({ path: name });
  if (errs.length) throw new Error(errs.join('\n'));
  console.log('saved', name);
} finally {
  await b.close();
}
