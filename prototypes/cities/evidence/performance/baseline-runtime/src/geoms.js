// Unit geometries for instanced parts: base at y = 0, height 1, footprint [-0.5, 0.5]^2.
// Non-indexed, flat normals. Per vertex: aFace (u, v, tri) for screen-space ink edges and aInfo (axis, kind).
// kind: 0 wall, 1 roof or top, 3 smooth (no edges). axis: 0 face spans local x, 2 spans z, 1 arc.

import * as THREE from 'three';

function build(faces, center = [0, 0.4, 0]) {
  const pos = [], nor = [], face = [], info = [];
  for (const f of faces) {
    let v = f.v;
    const e1 = sub(v[1], v[0]), e2 = sub(v[2], v[0]);
    let n = norm(cross(e1, e2));
    const c = v.reduce((a, p) => [a[0] + p[0] / v.length, a[1] + p[1] / v.length, a[2] + p[2] / v.length], [0, 0, 0]);
    if (dot(n, sub(c, center)) < 0) { v = v.slice().reverse(); n = n.map((x) => -x); }
    const kind = f.kind ?? 0, axis = f.axis ?? (Math.abs(n[0]) > Math.abs(n[2]) ? 2 : 0);
    const put = (p, uv, tri) => { pos.push(...p); nor.push(...n); face.push(uv[0], uv[1], tri); info.push(axis, kind); };
    if (v.length === 4) {
      const uv = f.reversedUV ? [[1, 0], [0, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
      const ord = v === f.v ? uv : [uv[3], uv[2], uv[1], uv[0]];
      put(v[0], ord[0], 0); put(v[1], ord[1], 0); put(v[2], ord[2], 0);
      put(v[0], ord[0], 0); put(v[2], ord[2], 0); put(v[3], ord[3], 0);
    } else {
      put(v[0], [1, 0], 1); put(v[1], [0, 1], 1); put(v[2], [0, 0], 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 3));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 2));
  return g;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

export function makeGeoms() {
  const h = 0.5;
  const box = build([
    { v: [[h, 0, -h], [h, 0, h], [h, 1, h], [h, 1, -h]] },
    { v: [[-h, 0, h], [-h, 0, -h], [-h, 1, -h], [-h, 1, h]] },
    { v: [[-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h]] },
    { v: [[h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h]] },
    { v: [[-h, 1, -h], [h, 1, -h], [h, 1, h], [-h, 1, h]], kind: 1 },
  ], [0, 0.5, 0]);
  const gable = build([
    { v: [[-h, 0, -h], [h, 0, -h], [h, 1, 0], [-h, 1, 0]], kind: 1, axis: 0 },
    { v: [[h, 0, h], [-h, 0, h], [-h, 1, 0], [h, 1, 0]], kind: 1, axis: 0 },
    { v: [[-h, 0, -h], [-h, 0, h], [-h, 1, 0]] },
    { v: [[h, 0, h], [h, 0, -h], [h, 1, 0]] },
  ], [0, 0.3, 0]);
  const r = 0.25;
  const hip = build([
    { v: [[-h, 0, -h], [h, 0, -h], [r, 1, 0], [-r, 1, 0]], kind: 1, axis: 0 },
    { v: [[h, 0, h], [-h, 0, h], [-r, 1, 0], [r, 1, 0]], kind: 1, axis: 0 },
    { v: [[-h, 0, h], [-h, 0, -h], [-r, 1, 0]], kind: 1 },
    { v: [[h, 0, -h], [h, 0, h], [r, 1, 0]], kind: 1 },
  ], [0, 0.3, 0]);
  const pyr = build([
    { v: [[-h, 0, -h], [h, 0, -h], [0, 1, 0]], kind: 1 },
    { v: [[h, 0, -h], [h, 0, h], [0, 1, 0]], kind: 1 },
    { v: [[h, 0, h], [-h, 0, h], [0, 1, 0]], kind: 1 },
    { v: [[-h, 0, h], [-h, 0, -h], [0, 1, 0]], kind: 1 },
  ], [0, 0.3, 0]);
  const seg = 12;
  const ring = (y, rad) => Array.from({ length: seg }, (_, i) => { const a = (i / seg) * Math.PI * 2; return [Math.cos(a) * rad, y, Math.sin(a) * rad]; });
  const cylF = [], coneF = [], domeF = [];
  const r0 = ring(0, h), r1 = ring(1, h);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    cylF.push({ v: [r0[i], r0[j], r1[j], r1[i]], kind: 3, axis: 1 });
    cylF.push({ v: [r1[i], r1[j], [0, 1, 0]], kind: 3 });
    coneF.push({ v: [r0[i], r0[j], [0, 1, 0]], kind: 3 });
  }
  const lat = 4;
  for (let k = 0; k < lat; k++) {
    const a0 = (k / lat) * Math.PI / 2, a1 = ((k + 1) / lat) * Math.PI / 2;
    const ra = ring(Math.sin(a0), h * Math.cos(a0)), rb = ring(Math.sin(a1), h * Math.cos(a1));
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      if (k === lat - 1) domeF.push({ v: [ra[i], ra[j], [0, 1, 0]], kind: 3 });
      else domeF.push({ v: [ra[i], ra[j], rb[j], rb[i]], kind: 3, axis: 1 });
    }
  }
  const cyl = build(cylF, [0, 0.5, 0]);
  const cone = build(coneF, [0, 0.3, 0]);
  const dome = build(domeF, [0, 0.3, 0]);
  // icosahedron, radius 0.5 around (0, 0.5, 0)
  const t = (1 + Math.sqrt(5)) / 2;
  const iv = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((p) => { const n = norm(p); return [n[0] * h, n[1] * h + h, n[2] * h]; });
  const it = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const ico = build(it.map(([a, b, c]) => ({ v: [iv[a], iv[b], iv[c]], kind: 3 })), [0, 0.5, 0]);
  return { box, gable, hip, pyr, cyl, cone, dome, ico };
}
