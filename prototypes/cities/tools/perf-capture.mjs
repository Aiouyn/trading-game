// Repeatable rendering workload. gl.finish measures completed work, not just
// command submission; rAF cadence captures the asynchronous browser pipeline.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ready } from './browser-ready.mjs';

const [base = 'http://127.0.0.1:3761', directory = 'prototypes/cities/evidence/performance/before', tierOnly] = process.argv.slice(2);
const out = resolve(directory);
await mkdir(out, { recursive: true });
const backend = process.env.CITY_GPU_BACKEND;
const browser = await chromium.launch({ args: backend ? [`--use-angle=${backend}`, '--enable-gpu'] : [] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const begin = Date.now();
  await ready(page, `${base}/?city=avalon&t=15`);
  const readyMs = Date.now() - begin;
  const summary = await page.evaluate(() => {
    const a = window.__cities, v = a.view;
    v.motion = false; v.fly = null; v.showLabels = false;
    const bytes = new Set(); let totalBytes = 0;
    const count = value => {
      if (!value || typeof value !== 'object') return;
      if (ArrayBuffer.isView(value)) { if (!bytes.has(value.buffer)) { bytes.add(value.buffer); totalBytes += value.buffer.byteLength; } return; }
      for (const key of Object.keys(value)) if (key !== 'P') count(value[key]);
    };
    count(a.city);
    return { ...a.diagnostics(), typedArrayBytes: totalBytes, parts: Object.fromEntries(Object.entries(a.city.parts).map(([k, v]) => [k, v.length / 18])), roadVertices: a.city.ribbons.side.length };
  });
  const samples = [];
  for (const camera of [{ name: 'overview', x: 0, z: -150, scale: 2.3 }, { name: 'street', x: -200, z: -160, scale: 0.22 }]) {
    for (const tier of ['high', 'balanced', 'low'].filter(tier => !tierOnly || tier === tierOnly)) {
      const result = await page.evaluate(({ camera, tier }) => {
        const a = window.__cities, v = a.view;
        v.setPlan(false); v.setQualityTier(tier); v.yaw = v.yawTarget = Math.PI / 4;
        v.target.set(camera.x, 0, camera.z); v.scale = camera.scale;
        const gl = v.renderer.getContext();
        for (let i = 0; i < 3; i++) { v.dirty = true; v.frame(0); }
        const layerTriangles = {};
        for (const object of v.objects) object.onBeforeRender = (_renderer, _scene, _camera, geometry) => {
          const count = geometry.index?.count ?? geometry.getAttribute('position').count;
          const instances = geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1;
          const layer = object.userData.layer ?? 'other';
          layerTriangles[layer] = (layerTriangles[layer] ?? 0) + count / 3 * instances;
        };
        v.dirty = true; v.frame(0);
        for (const object of v.objects) object.onBeforeRender = () => {};
        gl.finish();
        const durations = [], calls = [], triangles = [];
        for (let i = 0; i < 12; i++) {
          v.target.x = camera.x + Math.sin(i * 0.23) * 20;
          const start = performance.now();
          v.dirty = true; v.frame(0); gl.finish();
          durations.push(performance.now() - start);
          calls.push(v.renderer.info.render.calls); triangles.push(v.renderer.info.render.triangles);
        }
        durations.sort((a, b) => a - b);
        return { camera: camera.name, tier, layerTriangles, submissionAndFinishMsMedian: durations[6], submissionAndFinishMsP95: durations[11], drawCalls: Math.max(...calls), triangles: Math.max(...triangles), dpr: v.renderer.getPixelRatio(), visibleObjects: v.objects.filter(o => o.visible).length, memory: a.diagnostics().memory };
      }, { camera, tier });
      result.frameCadence = await page.evaluate(async () => {
        const v = window.__cities.view, samples = [];
        let last = await new Promise(requestAnimationFrame);
        for (let i = 0; i < 16; i++) {
          v.target.x += 1; v.dirty = true; v.frame(0);
          const now = await new Promise(requestAnimationFrame);
          samples.push(now - last); last = now;
        }
        samples.sort((a, b) => a - b);
        return { medianMs: samples[8], p95Ms: samples[15] };
      });
      result.gpuTiming = await page.evaluate(() => {
        const v = window.__cities.view; v.pollTimer();
        const samples = v.frameMs.slice(-16).sort((a, b) => a - b);
        return samples.length ? { samples: samples.length, medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.floor((samples.length - 1) * 0.95)] } : null;
      });
      samples.push(result);
      await page.locator('#view').screenshot({ path: join(out, `${camera.name}-${tier}.png`) });
      console.log(JSON.stringify(result));
    }
  }
  await writeFile(join(out, 'profile.json'), JSON.stringify({ readyMs, summary, samples }, null, 2));
} finally { await browser.close(); }
