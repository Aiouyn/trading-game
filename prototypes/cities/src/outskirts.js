// The outskirts: the land and sea beyond the city square, on a coarse grid. The city's own heights sit on the
// square's border, so the ground runs on to the haze with no map edge. Also the highways that leave the city.

import { clamp, smoothstep } from './noise.js';

export const OUT_STEP = 50;      // metres per grid cell
export const OUT_EXTENT = 7200;  // the grid covers |x| and |y| <= extent

/**
 * Samples the outskirts grid. On and inside the square: the city's own heights. Outside: P.terrain, held to the
 * city's shore rule, which caps land at 0.35 + 0.09 m per metre from the water (the quays in gen.js). The
 * distance keeps counting outwards from the border, so the ring meets the city without a step. Without the cap,
 * raw terrain sits up to 230 m above the city's border heights in places (Nordhaven, Kaiyo).
 */
export function sampleOutskirts(P, n, half, heightAt, dWaterAt) {
  const step = OUT_STEP, extent = OUT_EXTENT;
  const np = Math.round((2 * extent) / step) + 1;
  const h = new Float32Array(np * np);
  for (let j = 0; j < np; j++) {
    const y = -extent + j * step;
    for (let i = 0; i < np; i++) {
      const x = -extent + i * step;
      const dOut = Math.max(Math.abs(x), Math.abs(y)) - half; // metres outside the square
      let v;
      if (dOut <= 0) v = heightAt(x, y);
      else {
        const t = P.terrain(x, y, n);
        if (t < 0) v = t;
        else {
          const cx = clamp(x, -half, half), cy = clamp(y, -half, half);
          const cap = 0.35 + 0.09 * (dWaterAt(cx, cy) + dOut);
          // a soft minimum, blended in past the border, so the cap's crease with raw terrain rounds off
          const k = 12, soft = -k * Math.log(Math.exp(-t / k) + Math.exp(-cap / k));
          const w = smoothstep(0, 150, dOut);
          v = Math.min(t, cap) * (1 - w) + soft * w;
        }
      }
      h[j * np + i] = v;
    }
  }
  return { step, extent, n: np, h };
}

/**
 * The land use just inside the border, carried out over the ring: farmland and woods continue past the square
 * (fading over 450 m in the shader), so no straight line marks the edge. Reads the city's surface codes (surf:
 * SURF.fields, SURF.forest, SURF.park) at the nearest border cell. Fills out.fld and out.frs on the grid.
 */
export function borderSurface(out, surf, N, res, half, SURF) {
  const { n: np, extent: ext, step } = out;
  out.fld = new Float32Array(np * np);
  out.frs = new Float32Array(np * np);
  for (let j = 0; j < np; j++) for (let i = 0; i < np; i++) {
    const x = clamp(-ext + i * step, -half, half), z = clamp(-ext + j * step, -half, half);
    const ci = clamp(Math.floor((x + half) / res), 0, N - 1), cj = clamp(Math.floor((z + half) / res), 0, N - 1);
    const s = surf[cj * N + ci], k = j * np + i;
    out.fld[k] = s === SURF.fields ? 1 : 0;
    out.frs[k] = s === SURF.forest || s === SURF.park ? 1 : 0;
  }
}

/** Value of a grid array (border flags) at the grid node nearest to (x, y). */
export function nearestNode(out, arr, x, y) {
  const { step, extent, n } = out;
  const i = clamp(Math.round((x + extent) / step), 0, n - 1), j = clamp(Math.round((y + extent) / step), 0, n - 1);
  return arr[j * n + i];
}

/**
 * Height of the ring mesh at (x, y): the same planar triangles the mesh is drawn with (split along a to c,
 * see render.js), so roads and trees sit exactly on the ground.
 */
export function outskirtsHeight(out, x, y) {
  const { step, extent, n, h } = out;
  const fx = clamp((x + extent) / step, 0, n - 1.001), fy = clamp((y + extent) / step, 0, n - 1.001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
  const a = j * n + i, b = a + 1, d = a + n, c = d + 1;
  if (u >= v) return h[a] * (1 - u) + h[b] * (u - v) + h[c] * v;
  return h[a] * (1 - v) + h[d] * (v - u) + h[c] * u;
}

/**
 * Arterials run on to the horizon: every arterial end within 40 m of the square's border that already points out
 * continues outwards, bending slowly with the noise, for up to 6 km, and stops at the water.
 */
export function traceHighways(arterials, { P, n, half, outH }) {
  const out = [];
  const reach = OUT_EXTENT - 80, STEP = 30, MAX = 6000;
  for (const ln of arterials) {
    const pts = ln.pts, m = pts.length;
    if (m < 3) continue;
    for (const atEnd of [false, true]) {
      const [ex, ey] = atEnd ? pts[m - 1] : pts[0];
      const [qx, qy] = atEnd ? pts[m - 2] : pts[1];
      const dX = half - Math.abs(ex), dY = half - Math.abs(ey);
      if (Math.min(dX, dY) > 40) continue;
      const [nx, ny] = dX <= dY ? [Math.sign(ex) || 1, 0] : [0, Math.sign(ey) || 1];
      let hx = ex - qx, hy = ey - qy;
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl; hy /= hl;
      if (hx * nx + hy * ny < 0.3) continue; // the arterial must already head out of the square
      let heading = Math.atan2(hy, hx);
      let x = ex, y = ey;
      const line = [[ex, ey]];
      for (let len = 0; len < MAX; len += STEP) {
        heading += 0.1 * n.fbm(x / 700 + 17, y / 700 - 5, 2);
        x += Math.cos(heading) * STEP;
        y += Math.sin(heading) * STEP;
        if (Math.abs(x) > reach || Math.abs(y) > reach || P.terrain(x, y, n) < 0) break;
        line.push([x, y]);
      }
      if (line.length < 3) continue;
      out.push({ cls: 4, fam: 0, pts: line, outer: true, level: 'highway', width: line.map(() => 15) });
    }
  }
  return out;
}
