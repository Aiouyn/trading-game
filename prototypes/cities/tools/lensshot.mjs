// node lensshot.mjs <port> <outDir> '<steps as JSON>' : map-lens frames in one headless session (modelled on cityshot.mjs)
// A step may set: city, t (hour), mood (-100..100), lens (id; returns the paint time in ms), search (query), hit (index
// into the results: flies there and opens the card), fit (true: whole-city view), view ({x, z, scale}), name, wait (ms),
// and actions run after the above: { press: 'v' } (keyboard), { type: 'Halyard' } (typed into the focused field),
// { legend: 'Tech' } (clicks the legend row with that text), { click: '#chip-selector' }.
// Each step prints one JSON line with the paint time, the state after the actions, and the screenshot path.
// Example: node lensshot.mjs 3633 <dir> '[{"city":"avalon","lens":"sectors","fit":true,"actions":[{"legend":"Tech"}],"name":"x"}]'
import { chromium } from 'playwright';
import { ready } from './browser-ready.mjs';

const [port, out, json] = process.argv.slice(2);
const steps = JSON.parse(json);
// VIEW=390x844 renders the phone layout
const [vw, vh] = (process.env.VIEW ?? '1600x900').split('x').map(Number);
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const p = await b.newPage({ viewport: { width: vw, height: vh } });
  const errs = await ready(p, `http://localhost:${port}/?city=${steps[0].city ?? 'avalon'}&t=${steps[0].t ?? 15}`);

  const state = () => p.evaluate(() => {
    const C = window.__cities;
    return {
      city: C.city.P.id, buildings: C.city.buildings.length, lens: C.lens, focus: document.activeElement?.id ?? '', infoOpen: document.getElementById('info').style.display === 'block',
      info: document.getElementById('info').querySelector('.t')?.textContent ?? '',
      searchValue: document.getElementById('search').value, resultsOpen: document.getElementById('results').classList.contains('open'),
      results: [...document.querySelectorAll('#results li')].map((li) => li.textContent),
      legend: [...document.querySelectorAll('#legend .lg')].map((r) => r.textContent.trim()).slice(0, 14),
      target: [+C.view.target.x.toFixed(1), +C.view.target.z.toFixed(1)], scale: +C.view.scale.toFixed(3),
    };
  });

  for (const [i, s] of steps.entries()) {
    const res = await p.evaluate(async (s) => {
      const C = window.__cities, r = {};
      if (s.city && C.city.P.id !== s.city) await C.open(s.city);
      if (s.t !== undefined) C.setTime(s.t);
      if (s.mood !== undefined) C.setMood(s.mood);
      if (s.lens !== undefined) r.paintMs = +C.setLens(s.lens).toFixed(2);
      if (s.search !== undefined) r.hits = C.search(s.search);
      if (s.hit !== undefined) C.openHit(s.hit);
      if (s.fit) C.view.fit();
      if (s.view) { C.view.target.set(s.view.x, 0, s.view.z); C.view.scale = s.view.scale; }
      C.view.dirty = true;
      return r;
    }, s);
    for (const a of s.actions ?? []) {
      if (a.press) await p.keyboard.press(a.press);
      else if (a.type) await p.keyboard.type(a.type, { delay: 30 });
      else if (a.legend) await p.locator('#legend button.lg', { hasText: a.legend }).first().click();
      else if (a.click) await p.locator(a.click).first().click();
      else if (a.wait) await p.waitForTimeout(a.wait);
    }
    // flights take 0.7 s; a plain frame needs a few hundred ms
    await p.waitForTimeout(s.wait ?? (s.hit !== undefined || s.view || s.actions ? 1300 : 500));
    const after = await state();
    const name = `${out}/${s.name ?? `step-${i}`}.png`;
    if (s.shot !== false) await p.screenshot({ path: name });
    console.log(JSON.stringify({ name: s.shot === false ? null : name, ...res, after }));
  }
  if (errs.length) throw new Error(errs.join('\n'));
} finally {
  await b.close();
}
