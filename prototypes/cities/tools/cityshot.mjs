// node cityshot.mjs <port> <outDir> <city> [hour] [x z scale] : renders one frame of the cities prototype headless
import { chromium } from 'file:///C:/Users/Mathis/Projects/trading-game/.claude/worktrees/eval/node_modules/playwright/index.mjs';
const [port, out, city = 'avalon', hour = '15', x, z, scale] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await p.goto(`http://localhost:${port}/?city=${city}&t=${hour}`);
await p.waitForFunction(() => window.__cities && window.__cities.city, null, { timeout: 180000 });
await p.evaluate(([x, z, scale]) => { const v = window.__cities.view; if (x !== undefined && x !== null && x !== '') { v.target.set(+x, 0, +z); v.scale = +scale; } else v.fit(); v.dirty = true; v.frame(0); }, [x, z, scale]);
await p.waitForTimeout(400);
const name = `${out}/${city}-${hour}${x ? `-${x}_${z}_${scale}` : ''}.png`;
await p.screenshot({ path: name });
console.log('saved', name); if (errs.length) console.log('page errors:', errs);
await b.close();
