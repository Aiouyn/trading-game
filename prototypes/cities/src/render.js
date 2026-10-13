// Three.js scene: orthographic dimetric camera, instanced parts, ground, outskirts ring, roads, labels, picking.

import * as THREE from 'three';
import { makeGeoms } from './geoms.js';
import { GEOMS, STRIDE } from './archetypes.js';
import { partVert, partFrag, groundVert, groundFrag, roadVert, roadFrag, outVert, outFrag } from './shaders.js';
import { PALETTE, RAMP } from './lenses.js';
import { BIT_OCCLUDER, BIT_FOCUS, projectBoxes, findSeeThrough } from './seethrough.js';

const PITCH = Math.atan(0.5) * 2 > 1 ? Math.PI / 6 : Math.PI / 6; // 30 degrees: a 2:1 dimetric diamond
const col = (hex) => new THREE.Color(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const distCol = new Float32Array(PALETTE.length * 3);
PALETTE.forEach((h, i) => distCol.set([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], i * 3));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class CityView {
  constructor(canvas, labelLayer) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -30000, 30000);
    this.geoms = makeGeoms();
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uAmb: { value: new THREE.Color(0.5, 0.5, 0.55) }, uNightAmb: { value: new THREE.Color(0.1, 0.12, 0.2) },
      uNight: { value: 0 }, uGrowth: { value: 1.04 }, uBand: { value: 0.035 }, uTime: { value: 0 },
      uInk: { value: col(0x15171b) }, uMood: { value: 0 }, uHover: { value: -1 },
      uLit0: { value: col(0xffcf7a) }, uLit1: { value: col(0xffe2a8) }, uLit2: { value: col(0xffb85c) },
      uBrass: { value: col(0xc9a45c) }, uSkyRefl: { value: col(0x9fb4c4) }, uGhostPass: { value: 0 },
      // map lenses (lenses.js): uLens emphasis on, uLensGround 0 none / 1 land value / 2 districts, uLensDim ground dim
      uLens: { value: 0 }, uLensGround: { value: 0 }, uLensDim: { value: 0 },
      uRamp0: { value: col(RAMP[0]) }, uRamp1: { value: col(RAMP[1]) }, uRamp2: { value: col(RAMP[2]) },
      uDistCol: { value: distCol },
      uHazeColor: { value: new THREE.Color(0.83, 0.6, 0.48) }, uHaze0: { value: 1000 }, uHaze1: { value: 4000 },
    };
    this.yaw = Math.PI / 4; this.yawTarget = this.yaw;
    this.target = new THREE.Vector3();
    this.scale = 2; // metres per CSS pixel
    this.dirty = true;
    this.city = null;
    this.objects = [];
    this.labels = [];
    this.hoverId = -1;
    // see-through: focus set (building ids), its occluder count, and the screen boxes for the yaw they were made at
    this.focusIds = []; this.focusSet = new Set();
    this.ghosts = []; this.seeCount = 0; this.seeDirty = false;
    this.seeBoxes = null; this.boxYaw = NaN; this.seeYaw = NaN; this.seeScale = NaN; this.seeMs = 0; this.seeBoxMs = 0;
    this.motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.setTime(19.2);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.w = w; this.h = h;
    this.dirty = true;
  }

  load(city) {
    for (const o of this.objects) { this.scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); }
    this.objects = [];
    this.city = city;
    const P = city.P, pal = P.palette, half = city.S / 2;
    this.uniforms.uLit0.value = col(pal.lit[0]); this.uniforms.uLit1.value = col(pal.lit[1]); this.uniforms.uLit2.value = col(pal.lit[2]);

    // per-building state, one RGBA texel per building id (bid), read by the part shaders.
    // rgb = lens tint (0..255), a = bit flags: 1 lens emphasis, 2 see-through (ghost), 4 focus.
    // Writers: lenses set rgb + bit 1; see-through sets bits 2 and 4. Row 0 / bid 0 = trees, boats, cranes.
    const STATE_W = 256;
    const stateH = Math.max(1, Math.ceil((city.buildings.length + 1) / STATE_W));
    this.state = new Uint8Array(STATE_W * stateH * 4);
    this.stateTex = new THREE.DataTexture(this.state, STATE_W, stateH, THREE.RGBAFormat);
    this.stateTex.magFilter = THREE.NearestFilter; this.stateTex.minFilter = THREE.NearestFilter;
    this.stateTex.needsUpdate = true;
    this.uniforms.uState = { value: this.stateTex };
    this.uniforms.uStateW = { value: STATE_W };
    this.focusIds = []; this.focusSet = new Set();
    this.seeBoxes = null; this.boxYaw = NaN; this.seeYaw = NaN; this.seeScale = NaN; this.seeCount = 0; this.seeDirty = true;

    // lens rasters on the generator's coarse grid (same layout as the heights): land value as bytes, and the
    // district index per cell (a byte, read back as idx / 255 in groundFrag)
    const grid = (data, filter) => {
      const t = new THREE.DataTexture(data, city.value.n, city.value.n, THREE.RedFormat, THREE.UnsignedByteType);
      t.magFilter = filter; t.minFilter = filter; t.unpackAlignment = 1; t.needsUpdate = true;
      return t;
    };
    const landBytes = new Uint8Array(city.value.data.length);
    for (let i = 0; i < landBytes.length; i++) landBytes[i] = Math.round(Math.min(1, Math.max(0, city.value.data[i])) * 255);
    this.uniforms.uLandV = { value: grid(landBytes, THREE.LinearFilter) };
    this.uniforms.uDistT = { value: grid(city.districts.data, THREE.NearestFilter) };

    // parts: one instanced draw per geometry, plus a ghost draw of the same geometry for the see-through occluders
    const partMat = new THREE.ShaderMaterial({ vertexShader: partVert, fragmentShader: partFrag, uniforms: this.uniforms });
    // the ghost material shares the uniform objects (cloning would freeze the numbers), with uGhostPass = 1
    const ghostMat = new THREE.ShaderMaterial({
      vertexShader: partVert, fragmentShader: partFrag, uniforms: { ...this.uniforms, uGhostPass: { value: 1 } },
      transparent: true, depthWrite: false,
    });
    this.ghosts = [];
    for (const k of GEOMS) {
      const arr = city.parts[k];
      const count = arr.length / STRIDE;
      if (!count) continue;
      const base = this.geoms[k];
      const g = new THREE.InstancedBufferGeometry();
      for (const name of ['position', 'normal', 'aFace', 'aInfo']) g.setAttribute(name, base.getAttribute(name));
      const ib = new THREE.InstancedInterleavedBuffer(arr, STRIDE);
      g.setAttribute('iPos', new THREE.InterleavedBufferAttribute(ib, 3, 0));
      g.setAttribute('iSize', new THREE.InterleavedBufferAttribute(ib, 3, 3));
      g.setAttribute('iRot', new THREE.InterleavedBufferAttribute(ib, 1, 6));
      g.setAttribute('iColor', new THREE.InterleavedBufferAttribute(ib, 3, 7));
      g.setAttribute('iStyle', new THREE.InterleavedBufferAttribute(ib, 4, 10));
      g.setAttribute('iMeta', new THREE.InterleavedBufferAttribute(ib, 4, 14));
      g.instanceCount = count;
      const m = new THREE.Mesh(g, partMat);
      m.frustumCulled = false;
      this.add(m);
      const gm = new THREE.Mesh(g, ghostMat);
      gm.frustumCulled = false; gm.renderOrder = 2; gm.visible = false;
      this.add(gm); this.ghosts.push(gm);
    }

    // ground
    const G = Math.min(480, city.N / 2);
    const pg = new THREE.PlaneGeometry(city.S, city.S, G, G);
    pg.rotateX(-Math.PI / 2);
    const pa = pg.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i);
      const hgt = this.heightAt(x, z);
      pa.setY(i, hgt < 0 ? -0.15 : hgt);
    }
    // shade the relief with exaggerated normals so hills read in a flat projection
    for (let i = 0; i < pa.count; i++) pa.setY(i, pa.getY(i) * 2.6);
    pg.computeVertexNormals();
    for (let i = 0; i < pa.count; i++) pa.setY(i, pa.getY(i) / 2.6);
    const tex = (data) => { const t = new THREE.DataTexture(data, city.N, city.N, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
    const gu = {
      ...this.uniforms, uA: { value: tex(city.texA) }, uB: { value: tex(city.texB) }, uHalf: { value: half },
      cLand: { value: col(pal.land) }, cNatural: { value: col(pal.natural) }, cPark: { value: col(pal.park) }, cSand: { value: col(pal.sand) },
      cPave: { value: col(pal.pave) }, cPlaza: { value: col(pal.plaza) }, cWater0: { value: col(pal.water[0]) }, cWater1: { value: col(pal.water[1]) },
      uSnow: { value: P.id === 'nordhaven' ? 55 : P.id === 'kaiyo' ? 150 : 9999 },
    };
    this.add(new THREE.Mesh(pg, new THREE.ShaderMaterial({ vertexShader: groundVert, fragmentShader: groundFrag, uniforms: gu })));

    // roads
    const rb = city.ribbons;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rb.position, 3));
    rg.setAttribute('aSide', new THREE.BufferAttribute(rb.side, 1));
    rg.setAttribute('aDist', new THREE.BufferAttribute(rb.dist, 1));
    rg.setAttribute('aOrder', new THREE.BufferAttribute(rb.order, 1));
    rg.setAttribute('aCls', new THREE.BufferAttribute(rb.cls, 1));
    rg.setIndex(new THREE.BufferAttribute(rb.index, 1));
    const rm = new THREE.ShaderMaterial({
      vertexShader: roadVert, fragmentShader: roadFrag,
      uniforms: { ...this.uniforms, cRoad0: { value: col(pal.road[0]) }, cRoad1: { value: col(pal.road[1]) }, cRoad2: { value: col(pal.road[2]) } },
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    const road = new THREE.Mesh(rg, rm);
    road.frustumCulled = false;
    road.renderOrder = 1;
    this.add(road);

    // trains on the elevated loop (Kaiyo)
    this.train = null;
    if (city.rail) {
      const path = city.rail.path.map(([x, y]) => [x, y, Math.max(0, this.heightAt(x, y))]);
      const cum = [0];
      for (let i = 1; i <= path.length; i++) { const a = path[i - 1], b = path[i % path.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
      const cars = 15, arr = new Float32Array(cars * STRIDE);
      const g = new THREE.InstancedBufferGeometry();
      const base = this.geoms.box;
      for (const name of ['position', 'normal', 'aFace', 'aInfo']) g.setAttribute(name, base.getAttribute(name));
      const ib = new THREE.InstancedInterleavedBuffer(arr, STRIDE);
      ib.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', new THREE.InterleavedBufferAttribute(ib, 3, 0));
      g.setAttribute('iSize', new THREE.InterleavedBufferAttribute(ib, 3, 3));
      g.setAttribute('iRot', new THREE.InterleavedBufferAttribute(ib, 1, 6));
      g.setAttribute('iColor', new THREE.InterleavedBufferAttribute(ib, 3, 7));
      g.setAttribute('iStyle', new THREE.InterleavedBufferAttribute(ib, 4, 10));
      g.setAttribute('iMeta', new THREE.InterleavedBufferAttribute(ib, 4, 14));
      g.instanceCount = cars;
      const m = new THREE.Mesh(g, partMat);
      m.frustumCulled = false;
      this.add(m);
      this.train = { path, cum, L: cum[cum.length - 1], arr, ib, cars, h: city.rail.h, t: 0 };
      this.moveTrain(0);
    }

    // the outskirts: land and sea beyond the square, and a seam skirt that hides the join to the inner ground
    const outMat = new THREE.ShaderMaterial({
      vertexShader: outVert, fragmentShader: outFrag, side: THREE.DoubleSide,
      uniforms: {
        ...this.uniforms, uHalf: { value: half }, uBeach: { value: P.beach ? 1 : 0 },
        cNatural: { value: col(pal.natural) }, cPark: { value: col(pal.park) }, cSand: { value: col(pal.sand) },
        cWater0: { value: col(pal.water[0]) }, cWater1: { value: col(pal.water[1]) },
        uSnow: { value: P.id === 'nordhaven' ? 55 : P.id === 'kaiyo' ? 150 : 9999 },
      },
    });
    this.add(this.makeOutskirts(city, half, outMat));
    this.add(this.makeSeam(half, G, outMat));
    this.uniforms.uHaze0.value = half * 1.05;
    this.uniforms.uHaze1.value = half * 3.4;

    // labels
    this.labelLayer.innerHTML = '';
    this.labels = city.labels.map((l) => {
      const el = document.createElement('div');
      el.className = `lbl lbl-${l.kind}`;
      el.textContent = l.text;
      this.labelLayer.appendChild(el);
      const b = l.bid ? city.buildings[l.bid - 1] : null;
      return { ...l, el, order: b?.order ?? 0, pos: new THREE.Vector3(l.x, l.z, l.y) };
    });

    this.fit();
    this.dirty = true;
  }

  add(o) { this.scene.add(o); this.objects.push(o); }

  /** Per-building state (see load): set one building's texel; call commitState() once after a batch. */
  setState(bid, r, g, b, a) { const o = bid * 4; this.state[o] = r; this.state[o + 1] = g; this.state[o + 2] = b; this.state[o + 3] = a; }
  getFlags(bid) { return this.state[bid * 4 + 3]; }
  setFlags(bid, a) { this.state[bid * 4 + 3] = a; }
  clearState(mask = 255) { for (let i = 3; i < this.state.length; i += 4) this.state[i] &= ~mask & 255; }
  commitState() { this.stateTex.needsUpdate = true; this.dirty = true; }

  moveTrain(dt) {
    const T = this.train;
    T.t += dt;
    const at = (d) => {
      d = ((d % T.L) + T.L) % T.L;
      let lo = 0, hi = T.cum.length - 1;
      while (lo < hi - 1) { const m = (lo + hi) >> 1; if (T.cum[m] <= d) lo = m; else hi = m; }
      const a = T.path[lo], b = T.path[(lo + 1) % T.path.length];
      const f = (d - T.cum[lo]) / Math.max(1e-6, T.cum[lo + 1] - T.cum[lo]);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])];
    };
    for (let c = 0; c < T.cars; c++) {
      const train = Math.floor(c / 5), car = c % 5;
      const [x, y, g, rot] = at(T.t * 24 + (train * T.L) / 3 - car * 21.5);
      const o = c * STRIDE;
      T.arr.set([x, g + T.h + 1.6, y, 20.5, 3.6, 3.3, rot, 0.92, 0.91, 0.88, 3, 3.6, 2.2, 0, 0, 0.95, g, 0], o);
    }
    T.ib.needsUpdate = true;
  }

  /**
   * The outskirts ring: one quad per grid cell outside the square (the square's own cells are the inner ground).
   * Vertices on the square's border sit 0.3 m low, so the inner ground's edge covers the join.
   * Normals come from the relief exaggerated x2.6, like the inner ground, so hills read in the flat projection.
   */
  makeOutskirts(city, half, mat) {
    const out = city.outskirts, np = out.n, step = out.step, ext = out.extent;
    const count = np * np;
    const pos = new Float32Array(count * 3), aH = new Float32Array(count);
    const onBorder = (x, z) => (Math.abs(Math.abs(x) - half) < 1e-3 && Math.abs(z) <= half + 1e-3) || (Math.abs(Math.abs(z) - half) < 1e-3 && Math.abs(x) <= half + 1e-3);
    for (let j = 0; j < np; j++) for (let i = 0; i < np; i++) {
      const k = j * np + i, x = -ext + i * step, z = -ext + j * step, h = out.h[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = (h < 0 ? -0.15 : h) - (onBorder(x, z) ? 0.3 : 0);
      pos[k * 3 + 2] = z;
      aH[k] = h;
    }
    const idx = [];
    for (let j = 0; j < np - 1; j++) for (let i = 0; i < np - 1; i++) {
      const x0 = -ext + i * step, z0 = -ext + j * step;
      if (x0 >= -half - 1e-3 && x0 + step <= half + 1e-3 && z0 >= -half - 1e-3 && z0 + step <= half + 1e-3) continue;
      const a = j * np + i, b = a + 1, d = a + np, c = d + 1;
      idx.push(a, d, c, a, c, b); // counter-clockwise seen from above, so the normals point up
    }
    const exag = new Float32Array(pos);
    for (let k = 0; k < count; k++) exag[k * 3 + 1] *= 2.6;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(exag, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.computeVertexNormals(); // the normals stay; the positions go back to true heights
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
    g.setAttribute('aFld', new THREE.BufferAttribute(out.fld, 1)); // farmland and woods just inside the border
    g.setAttribute('aFrs', new THREE.BufferAttribute(out.frs, 1));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    return m;
  }

  /**
   * Vertical strip hanging 40 m from the inner ground's four edges: hides any crack to the ring. It is shaded as
   * ground (normal up), so the 0.3 m step at the border reads as the same land and no dark line shows.
   */
  makeSeam(half, G, mat) {
    const pos = [], nor = [], ah = [];
    const drop = 40;
    const edges = [
      { at: (t) => [t, -half] }, { at: (t) => [half, t] }, { at: (t) => [t, half] }, { at: (t) => [-half, t] },
    ];
    for (const e of edges) for (let i = 0; i < G; i++) {
      const [x0, z0] = e.at(-half + (2 * half * i) / G), [x1, z1] = e.at(-half + (2 * half * (i + 1)) / G);
      const h0 = this.heightAt(x0, z0), h1 = this.heightAt(x1, z1);
      const y0 = h0 < 0 ? -0.15 : h0, y1 = h1 < 0 ? -0.15 : h1;
      const q = [[x0, y0, z0, h0], [x1, y1, z1, h1], [x1, y1 - drop, z1, h1], [x0, y0 - drop, z0, h0]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const v = q[k];
        pos.push(v[0], v[1], v[2]); nor.push(0, 1, 0); ah.push(v[3]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(ah, 1));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    return m;
  }

  heightAt(x, z) {
    const c = this.city, N = c.N, res = c.RES, half = c.S / 2;
    let fx = (x + half) / res - 0.5, fy = (z + half) / res - 0.5;
    fx = Math.max(0, Math.min(N - 1.001, fx)); fy = Math.max(0, Math.min(N - 1.001, fy));
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * N + i, H = c.H;
    return (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - ty) + (H[k + N] * (1 - tx) + H[k + N + 1] * tx) * ty;
  }

  fit() {
    const S = this.city.S;
    this.target.set(0, 0, 0);
    this.scale = Math.min(this.maxScale(), (S * 1.22) / Math.max(320, Math.min(this.w, this.h * 1.75)));
    this.dirty = true;
  }

  // ------------------------------------------------------------------ time of day, mood, growth
  setTime(hour) {
    this.hour = hour;
    const a = (Math.PI * (hour - 6.4)) / 13.2; // sunrise about 6:24, sunset about 19:36
    const el = Math.sin(a);
    const elev = Math.max(0.12, el) * 0.95;
    const az = a;
    const sd = new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.sin(elev) + 0.15, Math.sin(az) * Math.cos(elev) + 0.35).normalize();
    this.uniforms.uSunDir.value.copy(sd);
    const night = 1 - smooth(-0.12, 0.22, el);
    const warm = 1 - smooth(0.05, 0.55, el);
    this.uniforms.uNight.value = night;
    const sun = new THREE.Color(1.0, 0.96, 0.88).lerp(new THREE.Color(1.0, 0.62, 0.36), warm).multiplyScalar(0.62);
    this.uniforms.uSunCol.value.copy(sun);
    const amb = new THREE.Color(0.58, 0.6, 0.64).lerp(new THREE.Color(0.55, 0.47, 0.48), warm * 0.8);
    this.uniforms.uAmb.value.copy(amb);
    this.uniforms.uNightAmb.value.set(0.22, 0.25, 0.38);
    this.uniforms.uSkyRefl.value.copy(new THREE.Color(0.62, 0.72, 0.8).lerp(new THREE.Color(0.95, 0.66, 0.5), warm * 0.8));
    this.sky = skyFor(el, warm, night);
    // the haze is the sky's bottom colour, so the land and sea melt into the page's gradient
    const [hr, hg, hb] = this.sky.haze;
    this.uniforms.uHazeColor.value.setRGB(hr, hg, hb);
    this.dirty = true;
  }
  setMood(m) { this.uniforms.uMood.value = m; this.dirty = true; }
  setGrowth(g) { this.uniforms.uGrowth.value = g; this.seeDirty = true; this.dirty = true; }
  rotate(dir) { this.yawTarget += (dir * Math.PI) / 2; this.dirty = true; }
  /** Camera target limit: within 0.8 of the half-size on each axis, so the view stays on the city and its ring. */
  targetLimit() { return this.city ? this.city.S * 0.4 : 960; }
  clampTarget() {
    const lim = this.targetLimit();
    this.target.x = clamp(this.target.x, -lim, lim);
    this.target.z = clamp(this.target.z, -lim, lim);
  }
  /**
   * The most zoomed-out scale (metres per pixel) that keeps every visible ground point inside the outskirts ring:
   * the view covers w*s/2 across and h*s along the ground at this pitch, around a target at most 0.8 half out.
   */
  maxScale() {
    if (!this.city) return 6;
    const half = this.city.S / 2, reach = this.city.outskirts.extent - 300;
    const span = Math.hypot(this.w / 2, this.h); // bounds the visible ground's reach on either axis, at any yaw
    return clamp((reach - 0.8 * half) / Math.max(1, span), 0.5, 6);
  }

  /** Smoothly move the camera to map point (x, z) at an optional scale (metres per pixel); instant under reduced motion. */
  flyTo(x, z, scale = null, seconds = 0.7) {
    const lim = this.targetLimit();
    const to = { x: clamp(x, -lim, lim), z: clamp(z, -lim, lim), scale: Math.min(this.maxScale(), scale ?? this.scale) };
    if (!this.motion) { this.target.set(to.x, 0, to.z); this.scale = to.scale; this.dirty = true; return; }
    this.fly = { from: { x: this.target.x, z: this.target.z, scale: this.scale }, to, t: 0, dur: seconds };
  }

  // ------------------------------------------------------------------ camera
  updateCamera() {
    const d = 9000;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    this.camera.position.set(this.target.x + d * cp * Math.sin(this.yaw), this.target.y + d * sp, this.target.z + d * cp * Math.cos(this.yaw));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    const hw = (this.w * this.scale) / 2, hh = (this.h * this.scale) / 2;
    this.camera.left = -hw; this.camera.right = hw; this.camera.top = hh; this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  pan(dx, dy) {
    const s = this.scale;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.target.addScaledVector(right, -dx * s);
    this.target.addScaledVector(fwd, (dy * s) / Math.sin(PITCH));
    this.clampTarget();
    this.dirty = true;
  }

  zoomAt(factor, px, py) {
    const before = this.groundAt(px, py);
    this.scale = Math.max(0.08, Math.min(this.maxScale(), this.scale * factor));
    this.updateCamera();
    const after = this.groundAt(px, py);
    if (before && after) { this.target.add(before.sub(after)); }
    this.clampTarget();
    this.dirty = true;
  }

  ray(px, py) {
    const ndc = new THREE.Vector3((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1, -1);
    const o = ndc.clone().unproject(this.camera);
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld);
    return { o, dir };
  }

  groundAt(px, py) {
    const { o, dir } = this.ray(px, py);
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (0 - o.y) / dir.y;
    return o.clone().addScaledVector(dir, t);
  }

  pick(px, py) {
    if (!this.city) return null;
    this.updateCamera();
    const { o, dir } = this.ray(px, py);
    const g = this.uniforms.uGrowth.value - this.uniforms.uBand.value * 0.5;
    let best = null, bt = Infinity, bestFocus = null, btFocus = Infinity;
    for (const b of this.city.buildings) {
      if (b.order > g) continue;
      const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
      const ox = o.x - b.x, oz = o.z - b.y, oy = o.y - b.gz;
      const lx = c * ox - s * oz, lz = s * ox + c * oz;
      const dx = c * dir.x - s * dir.z, dz = s * dir.x + c * dir.z, dy = dir.y;
      const hw = b.w / 2, hd = b.dp / 2;
      let t0 = -Infinity, t1 = Infinity;
      for (const [p, d, lo, hi] of [[lx, dx, -hw, hw], [oy, dy, 0, b.h], [lz, dz, -hd, hd]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = Infinity; break; } continue; }
        let a = (lo - p) / d, bb = (hi - p) / d;
        if (a > bb) [a, bb] = [bb, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, bb);
      }
      if (t0 > t1) continue;
      if (t0 < bt) { bt = t0; best = b; }
      // a focus building the ray passes through wins the click, so it stays reachable behind the glass in front of it
      if (t0 < btFocus && this.focusSet.has(b.id)) { btFocus = t0; bestFocus = b; }
    }
    return bestFocus ?? best;
  }

  setHover(id) { if (id !== this.hoverId) { this.hoverId = id; this.uniforms.uHover.value = id; this.dirty = true; } }

  // ------------------------------------------------------------------ see-through
  /** The focus set (building ids): drawn with brass edges, and the built buildings that hide them are ghosted. */
  setFocus(ids) {
    const next = [...new Set(ids)];
    if (next.length === this.focusIds.length && next.every((id, i) => id === this.focusIds[i])) return;
    this.focusIds = next;
    this.focusSet = new Set(next);
    this.syncFocusLabels();
    this.seeDirty = true; this.dirty = true;
  }

  /** A label for each focus building that has none of its own, so the focus building always has a label. */
  syncFocusLabels() {
    const keep = [];
    for (const l of this.labels) { if (l.focusOnly) l.el.remove(); else keep.push(l); }
    this.labels = keep;
    if (!this.city) return;
    for (const id of this.focusIds) {
      if (this.labels.some((l) => l.bid === id)) continue;
      const b = this.city.buildings[id - 1];
      const el = document.createElement('div');
      el.className = 'lbl lbl-focus';
      el.textContent = b.label ?? b.kind;
      this.labelLayer.appendChild(el);
      this.labels.push({ kind: 'focus', text: el.textContent, bid: id, el, order: b.order, pos: new THREE.Vector3(b.x, b.gz + b.h + 8, b.y), focusOnly: true });
    }
  }

  /**
   * The see-through pass, on the CPU and only when something changed (focus, growth, a settled yaw), never per frame:
   * bit 4 on the focus buildings, bit 2 on the built buildings that stand in front of them. Other bits are kept.
   */
  applySeeThrough() {
    const t0 = performance.now();
    this.seeDirty = false;
    this.seeYaw = this.yaw;
    this.seeScale = this.scale;
    this.clearState(BIT_OCCLUDER | BIT_FOCUS);
    this.seeCount = 0;
    if (this.focusIds.length && this.city) {
      this.updateCamera();
      if (this.boxYaw !== this.yaw) {
        // the view basis from the camera: columns are right, up and back (the camera looks along -back)
        const t1 = performance.now();
        const e = this.camera.matrixWorld.elements;
        this.seeBoxes = projectBoxes(this.city.buildings, [e[0], e[1], e[2]], [e[4], e[5], e[6]], [-e[8], -e[9], -e[10]], this.seeBoxes);
        this.boxYaw = this.yaw;
        this.seeBoxMs = performance.now() - t1;
      }
      const margin = 4 * this.scale; // four CSS pixels, in metres
      const { focus, occluders } = findSeeThrough(this.city.buildings, this.seeBoxes, this.focusIds, this.uniforms.uGrowth.value, margin);
      for (const id of focus) this.setFlags(id, this.getFlags(id) | BIT_FOCUS);
      for (const id of occluders) this.setFlags(id, this.getFlags(id) | BIT_OCCLUDER);
      this.seeCount = occluders.length;
    }
    for (const gm of this.ghosts) gm.visible = this.seeCount > 0;
    this.commitState();
    this.seeMs = performance.now() - t0;
  }

  // ------------------------------------------------------------------ frame
  frame(dt) {
    if (this.fly) {
      const f = this.fly; f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      this.target.set(f.from.x + (f.to.x - f.from.x) * e, 0, f.from.z + (f.to.z - f.from.z) * e);
      this.scale = f.from.scale * Math.pow(f.to.scale / f.from.scale, e);
      this.dirty = true;
      if (f.t >= 1) this.fly = null;
    }
    if (Math.abs(this.yawTarget - this.yaw) > 1e-4) {
      this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * (this.motion ? 7 : 60));
      if (Math.abs(this.yawTarget - this.yaw) < 1e-3) this.yaw = this.yawTarget;
      this.dirty = true;
    }
    // the camera settled on a new yaw: the screen boxes, and so the occluders, changed
    if (this.yaw === this.yawTarget && this.yaw !== this.seeYaw) this.seeDirty = true;
    // the 4 px margin is in metres, so a zoom of more than a quarter also redoes the test (not on every wheel tick)
    if (this.focusIds.length && Math.abs(Math.log(this.scale / this.seeScale)) > Math.log(1.25)) this.seeDirty = true;
    if (this.seeDirty && this.city) this.applySeeThrough();
    if (this.motion) { this.uniforms.uTime.value += dt; this.dirty = true; if (this.train) this.moveTrain(dt); }
    if (!this.dirty || !this.city) return;
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    this.dirty = false;
  }

  placeLabels() {
    const g = this.uniforms.uGrowth.value;
    const v = new THREE.Vector3();
    const zoom = 1 / this.scale;
    for (const l of this.labels) {
      v.copy(l.pos).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * this.w, y = (-v.y * 0.5 + 0.5) * this.h;
      let show = x > -60 && x < this.w + 60 && y > -20 && y < this.h + 20 && l.order <= g;
      // the label of a focus building (the selected one, yours) shows at any zoom
      if (!this.focusSet.has(l.bid)) {
        if (l.kind === 'minor' && zoom < 0.55) show = false;
        if ((l.kind === 'hq' || l.kind === 'crown') && zoom < 0.9) show = false;
        if (l.kind === 'mine' && zoom < 0.45) show = false;
        if ((l.kind === 'landmark' || l.kind === 'park' || l.kind === 'station') && zoom < 0.7) show = false;
      }
      if (!this.showLabels) show = false;
      l.el.style.display = show ? '' : 'none';
      if (show) l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}

function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function skyFor(el, warm, night) {
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  let top = [118, 150, 178], bot = [212, 222, 226];
  top = mix(top, [74, 76, 112], warm); bot = mix(bot, [236, 176, 128], warm);
  top = mix(top, [10, 12, 20], night); bot = mix(bot, [28, 30, 46], night);
  return { top: `rgb(${top})`, bot: `rgb(${bot})`, haze: bot.map((v) => v / 255) };
}
