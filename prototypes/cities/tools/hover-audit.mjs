import { chromium } from 'playwright';
import { ready } from './browser-ready.mjs';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ready(page, 'http://127.0.0.1:3761/?city=avalon&t=15');
  const result = await page.evaluate(() => {
    const a = window.__cities, v = a.view;
    v.motion = false; v.uniforms.uTime.value = 0; v.tickAnimation = () => {};
    const b = a.city.buildings.find(b => b.d.id === 'oldharbor' && b.kind !== 'Landmark' && !b.mine && b.h > 10);
    v.target.set(b.x, 0, b.y); v.scale = 0.18; v.yaw = v.yawTarget = Math.PI / 4;
    a.select(null); v.setHover(-1); v.dirty = true; v.frame(0);
    const gl = v.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const read = () => { v.dirty = true; v.frame(0); v.renderer.render(v.scene, v.camera); const p = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
    const center = v.target.clone().set(b.x, b.gz + b.h / 2, b.y).project(v.camera);
    const pickedAtCenter = v.pick((center.x * 0.5 + 0.5) * v.w, (0.5 - center.y * 0.5) * v.h)?.id;
    const before = read(); v.setHover(b.id); const after = read();
    let changed = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) {
        changed++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return { pickedAtCenter, building: { id: b.id, x: b.x, y: b.y, h: b.h, gz: b.gz, w: b.w, dp: b.dp, rot: b.rot }, changed, changedBounds: [x0, y0, x1, y1], target: v.target.toArray(), scale: v.scale, fly: v.fly,
      glows: v.glows.map(g => ({ visible: g.visible, count: g.geometry.getAttribute('position').count, y: g.geometry.getAttribute('position').getY(0) })) };
  });
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
