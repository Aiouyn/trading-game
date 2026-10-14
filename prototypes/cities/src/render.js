// Three.js scene: orthographic dimetric camera, instanced parts, ground, outskirts ring, roads, labels, picking.

import * as THREE from 'three';
import { makeGeoms } from './geoms.js';
import { GEOMS, STRIDE, PART_KEYS, TREE_GEOM } from './archetypes.js';
import { partVert, partFrag, groundVert, groundFrag, roadVert, roadFrag, outVert, outFrag, billVert, billFrag } from './shaders.js';
import { PALETTE, RAMP } from './lenses.js';
import { BIT_OCCLUDER, BIT_FOCUS, projectBoxes, findSeeThrough, focusBoxes } from './seethrough.js';
import { outskirtsHeight } from './outskirts.js';
import { smoothstep } from './noise.js';

const PITCH = Math.atan(0.5) * 2 > 1 ? Math.PI / 6 : Math.PI / 6; // 30 degrees: a 2:1 dimetric diamond
const col = (hex) => new THREE.Color(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const distCol = new Float32Array(PALETTE.length * 3);
PALETTE.forEach((h, i) => distCol.set([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], i * 3));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ANIM_FPS = 12; // water, neon and trains, while on screen
const SAVER_FPS = 4; // the battery saver's animation rate
const TREE_FAR_SCALE = 0.35; // metres per pixel: beyond this, tree crowns are billboards and trunks are not drawn
const SMALL_SCALE = 1.2; // metres per pixel: beyond this, the small building parts (footprint under SMALL_M) are not drawn
const SMALL_M = 3; // metres: the footprint limit of a small part
const TILE = 400; // metres: the side of a culling tile
const PIXEL_CAP_LARGE = 1.5; // the pixel ratio cap on screens 1200 CSS px and wider
const SLOW_MS = 24; // a median draw slower than this (on a real GPU) drops the pixel ratio to 1
const GROUND_HEIGHT_TOL = 0.3; // metres: how far ground may sit off a block's corner plane to collapse (simplifyGround)
const GROUND_NORMAL_TOL = 0.05; // the summed normal difference allowed inside a collapsed block
// the glow under a focus building: uv = footprint-relative metres, aHalf = the footprint's half sizes
const glowVert = /* glsl */ `
attribute vec2 aHalf;
varying vec2 vP;
varying vec2 vHalf;
void main() { vP = uv; vHalf = aHalf; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const glowFrag = /* glsl */ `
uniform vec3 uBrass;
uniform float uNight;
varying vec2 vP;
varying vec2 vHalf;
void main() {
  vec2 q = abs(vP) - vHalf;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); // metres outside the footprint
  float a = 1.0 - smoothstep(0.0, 14.0, sd);
  a = a * a * smoothstep(-0.5, 0.5, sd) * 0.45;
  gl_FragColor = vec4(uBrass * (1.0 + 0.3 * uNight), a);
}`;

export class CityView {
  constructor(canvas, labelLayer) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    // the pixel ratio is set once the quality fields exist (applyPixelRatio, below)
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -30000, 30000);
    this.geoms = makeGeoms();
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uAmb: { value: new THREE.Color(0.5, 0.5, 0.55) }, uNightAmb: { value: new THREE.Color(0.1, 0.12, 0.2) },
      uNight: { value: 0 }, uGrowth: { value: 1.04 }, uBand: { value: 0.035 }, uTime: { value: 0 },
      uInk: { value: col(0x15171b) }, uMood: { value: 0 }, uHover: { value: -1 },
      uLit0: { value: col(0xffcf7a) }, uLit1: { value: col(0xffe2a8) }, uLit2: { value: col(0xffb85c) },
      uBrass: { value: col(0xc9a45c) }, uSkyRefl: { value: col(0x9fb4c4) },
      // see-through: uCutT eases 0..1 (occluders cut at uCutH above their ground, from uFullH); the focus boxes for the trees
      uCutT: { value: 0 }, uCutH: { value: 9 }, uFullH: { value: 60 }, uOutlinePass: { value: 0 }, uOutlineM: { value: 2 },
      uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uFwd: { value: new THREE.Vector3(0, 0, -1) },
      uFocusN: { value: 0 }, uFocusRect: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, uFocusDepth: { value: new Float32Array(12) },
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
    // see-through: focus set (building ids), the occluders (bit 2, cut in partVert), the cut's progress (cutP runs to
    // cutTo; uCutT is its eased value), the glows under the focus buildings, and the screen boxes for their yaw
    this.focusIds = []; this.focusSet = new Set(); this.focusKey = '';
    this.occ = []; this.cutP = 0; this.cutTo = 0; this.seeDirty = false; this.glows = [];
    this.seeBoxes = null; this.boxYaw = NaN; this.seeYaw = NaN; this.seeScale = NaN; this.seeMs = 0; this.seeBoxMs = 0;
    this.motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    // animation (water, neon, trains) runs at ANIM_FPS, and only while an animated thing is on screen (see tickAnimation)
    this.clock = 0; this.animT = -1; this.animKey = ''; this.animVisible = false; this.saver = false; this.renders = 0;
    // quality: the pixel ratio is capped at 1.5 on large screens (2 on small ones); the battery saver and a sustained
    // slow frame on a real GPU drop it to 1. Frame times: a GPU timer query where the browser has one, else the wall
    // time of a draw, read back with a one-pixel read. Software renderers (SwiftShader, llvmpipe) never drop quality.
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.software = /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
    this.tq = this.software ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.tqPending = []; this.frameMs = []; this.dropped = false; this.px = new Uint8Array(4);
    this.applyPixelRatio();
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

  /** The device pixel ratio the canvas renders at: capped by screen size, and 1 when saving or after a sustained slow frame. */
  applyPixelRatio() {
    const cap = this.saver || this.dropped ? 1 : window.innerWidth >= 1200 ? PIXEL_CAP_LARGE : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    if (this.w !== undefined) this.resize();
  }

  /** The battery saver: pixel ratio 1 and a slower animation. */
  setSaver(on) {
    this.saver = on;
    this.applyPixelRatio();
    this.animKey = '';
    this.dirty = true;
  }

  /** Start a GPU timer around the next draw (only with the timer query extension). */
  beginTimer() {
    if (!this.tq) return null;
    const gl = this.renderer.getContext(), q = gl.createQuery();
    gl.beginQuery(this.tq.TIME_ELAPSED_EXT, q);
    return q;
  }
  endTimer(q) {
    if (!q) return;
    this.renderer.getContext().endQuery(this.tq.TIME_ELAPSED_EXT);
    this.tqPending.push(q);
  }
  /** Read the finished timer queries (in order; a disjoint GPU result is thrown away). */
  pollTimer() {
    if (!this.tq) return;
    const gl = this.renderer.getContext();
    while (this.tqPending.length && gl.getQueryParameter(this.tqPending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.tqPending.shift();
      const disjoint = gl.getParameter(this.tq.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      if (!disjoint) this.recordFrame(ns / 1e6);
    }
  }
  /** Keep the last 20 draw times; a median above SLOW_MS on a real GPU drops the pixel ratio to 1 (once). */
  recordFrame(ms) {
    if (this.software || this.saver || this.dropped) return;
    this.frameMs.push(ms);
    if (this.frameMs.length > 20) this.frameMs.shift();
    if (this.frameMs.length < 20) return;
    const sorted = [...this.frameMs].sort((a, b) => a - b);
    if (sorted[10] > SLOW_MS) { this.dropped = true; this.applyPixelRatio(); this.dirty = true; }
  }

  load(city) {
    for (const o of this.objects) { this.scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); }
    this.objects = [];
    this.city = city;
    const P = city.P, pal = P.palette, half = city.S / 2;
    this.uniforms.uLit0.value = col(pal.lit[0]); this.uniforms.uLit1.value = col(pal.lit[1]); this.uniforms.uLit2.value = col(pal.lit[2]);

    // per-building state, one RGBA texel per building id (bid), read by the part shaders.
    // rgb = lens tint (0..255), a = bit flags: 1 lens emphasis, 2 see-through occluder (cut), 4 focus.
    // Writers: lenses set rgb + bit 1; see-through sets bits 2 and 4. Row 0 / bid 0 = trees, boats, cranes.
    const STATE_W = 256;
    const stateH = Math.max(1, Math.ceil((city.buildings.length + 1) / STATE_W));
    this.state = new Uint8Array(STATE_W * stateH * 4);
    this.stateTex = new THREE.DataTexture(this.state, STATE_W, stateH, THREE.RGBAFormat);
    this.stateTex.magFilter = THREE.NearestFilter; this.stateTex.minFilter = THREE.NearestFilter;
    this.stateTex.needsUpdate = true;
    this.uniforms.uState = { value: this.stateTex };
    this.uniforms.uStateW = { value: STATE_W };
    this.focusIds = []; this.focusSet = new Set(); this.focusKey = ''; this.occ = []; this.cutP = 0; this.cutTo = 0;
    this.uniforms.uCutT.value = 0; this.uniforms.uFocusN.value = 0;
    this.clearGlows();
    this.seeBoxes = null; this.boxYaw = NaN; this.seeYaw = NaN; this.seeScale = NaN; this.seeDirty = true;

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

    // parts: one instanced draw per geometry; a second draw of the same geometry (inverted hull, back faces) outlines
    // the focus buildings. The outline material shares the uniform objects, so the numbers stay live.
    const partMat = new THREE.ShaderMaterial({ vertexShader: partVert, fragmentShader: partFrag, uniforms: this.uniforms });
    const outlineMat = new THREE.ShaderMaterial({
      vertexShader: partVert, fragmentShader: partFrag, side: THREE.BackSide, uniforms: { ...this.uniforms, uOutlinePass: { value: 1 } },
    });
    // the glow under a focus building: a soft brass halo on the ground around its footprint
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      uniforms: { uBrass: this.uniforms.uBrass, uNight: this.uniforms.uNight },
    });
    // trees: the full crowns and trunks draw when close; from TREE_FAR scale the crowns are billboards and the trunks go
    // trees: the full crowns and trunks draw when close; from TREE_FAR scale the crowns are billboards and the trunks go.
    // Level of detail and culling: the instances are split into TILE-metre tiles (one draw per geometry, tile and size
    // class, each culled by its bounding sphere), and buildings with parts under SMALL_M across form a small class,
    // drawn only up to SMALL_SCALE. The outline draw keeps one unsplit geometry per building geometry (it only shows
    // the focus buildings), so the draw count stays small.
    this.treeFull = []; this.billboards = []; this.lodFar = null; this.smallMeshes = []; this.lodSmall = null;
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const billMat = new THREE.ShaderMaterial({ vertexShader: billVert, fragmentShader: billFrag, uniforms: this.uniforms, alphaToCoverage: true });
    this.outlines = [];
    for (const k of PART_KEYS) {
      const arr = city.parts[k];
      const count = arr.length / STRIDE;
      if (!count) continue;
      const tree = k in TREE_GEOM;
      const base = this.geoms[TREE_GEOM[k] ?? k];
      if (!tree) {
        const og = partGeometry(base, new THREE.InstancedInterleavedBuffer(arr, STRIDE), count);
        const om = new THREE.Mesh(og, outlineMat);
        om.frustumCulled = false; om.renderOrder = 2; om.visible = false;
        this.add(om); this.outlines.push(om);
      }
      for (const tile of splitTiles(arr, half, tree)) {
        const g = partGeometry(base, new THREE.InstancedInterleavedBuffer(tile.data, STRIDE), tile.count);
        g.boundingSphere = tile.sphere;
        const m = new THREE.Mesh(g, partMat);
        m.frustumCulled = true;
        this.add(m);
        if (tile.small) this.smallMeshes.push(m);
        if (tree) this.treeFull.push(m);
        if (k === 'treeIco') {
          const bg = new THREE.InstancedBufferGeometry();
          bg.setAttribute('position', quad.getAttribute('position'));
          bg.setIndex(quad.getIndex());
          for (const name of ['iPos', 'iSize', 'iColor', 'iStyle', 'iMeta']) bg.setAttribute(name, g.getAttribute(name));
          bg.instanceCount = tile.count;
          bg.boundingSphere = tile.sphere;
          const bm = new THREE.Mesh(bg, billMat);
          bm.frustumCulled = true; bm.visible = false;
          this.add(bm); this.billboards.push(bm);
        }
      }
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
    // shade the relief with exaggerated normals so hills read in a flat projection. Near the border (the last 500 m)
    // the normals come from the outskirts' coarse heights, the same surface the ring beyond is shaded with, so the
    // lighting runs on across the border; the positions keep their true heights.
    const trueH = new Float32Array(pa.count);
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), h = pa.getY(i);
      trueH[i] = h;
      const e = smoothstep(half - 500, half, Math.max(Math.abs(x), Math.abs(z)));
      pa.setY(i, (h + (outskirtsHeight(city.outskirts, x, z) - h) * e) * 2.6);
    }
    pg.computeVertexNormals();
    for (let i = 0; i < pa.count; i++) pa.setY(i, trueH[i]);
    this.simplifyGround(pg, G);
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

    // what animates: the sea (water shimmer), neon signs (flicker) and the trains; their places say when a tick matters
    const signs = [];
    for (const k of GEOMS) {
      const a = city.parts[k];
      for (let i = 0; i < a.length; i += STRIDE) if (Math.round(a[i + 10]) === 5) signs.push(a[i], a[i + 2]);
    }
    this.signXZ = new Float32Array(signs);
    this.hasWater = this.hasSea();
    this.animKey = '';

    this.fit();
    this.dirty = true;
  }

  /**
   * Adaptive ground resolution: a block of BLOCK x BLOCK cells whose heights stay within 0.1 m of a plane and whose
   * normals agree within 0.01 (open sea and level ground, the most of the square) is drawn as two triangles. The
   * vertices stay in the buffer, so the seams with full-resolution blocks share their edge corners (a T-junction over
   * a flat plane, with no visible crack). Shading is unchanged where the surface is flat, and the rest keeps its cells.
   */
  simplifyGround(pg, G) {
    const pa = pg.getAttribute('position'), na = pg.getAttribute('normal');
    const V = (i, j) => j * (G + 1) + i;
    // the quadtree: a block of size s cells is one quad when flat, else its four halves are tried in turn
    const flat = (bi, bj, s) => {
      const y0 = pa.getY(V(bi, bj)), n0x = na.getX(V(bi, bj)), n0y = na.getY(V(bi, bj)), n0z = na.getZ(V(bi, bj));
      // the plane through the block's corners: heights must stay within 0.1 m of it, normals within 0.01
      const y1 = pa.getY(V(bi + s, bj)), y2 = pa.getY(V(bi, bj + s)), y3 = pa.getY(V(bi + s, bj + s));
      for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) {
        const v = V(bi + i, bj + j), u = i / s, w = j / s;
        const plane = (y0 * (1 - u) + y1 * u) * (1 - w) + (y2 * (1 - u) + y3 * u) * w;
        if (Math.abs(pa.getY(v) - plane) > GROUND_HEIGHT_TOL) return false;
        if (Math.abs(na.getX(v) - n0x) + Math.abs(na.getY(v) - n0y) + Math.abs(na.getZ(v) - n0z) > GROUND_NORMAL_TOL) return false;
      }
      return true;
    };
    // the leaves of the quadtree: [i, j, size, collapsed] (size in cells; a size-1 leaf is one cell)
    const top = [16, 8, 4, 2, 1].find((s) => G % s === 0);
    const leaves = [];
    const walk = (bi, bj, s) => {
      if (s > 1 && flat(bi, bj, s)) { leaves.push([bi, bj, s, true]); return; }
      if (s === 1) { leaves.push([bi, bj, 1, false]); return; }
      const h = s / 2;
      walk(bi, bj, h); walk(bi + h, bj, h); walk(bi, bj + h, h); walk(bi + h, bj + h, h);
    };
    for (let bj = 0; bj < G; bj += top) for (let bi = 0; bi < G; bi += top) walk(bi, bj, top);
    // A collapsed leaf keeps every vertex of an edge unless the leaf of the same size across that edge is collapsed
    // too, then only the two corners meet there. Both sides of any edge therefore carry the same vertices (no cracks),
    // and the fan over the perimeter shades like the flat cells did.
    const key = (i, j, s) => `${i},${j},${s}`;
    const collapsed = new Set(leaves.filter((l) => l[3]).map((l) => key(l[0], l[1], l[2])));
    const idx = [];
    for (const [x0, z0, s, isC] of leaves) {
      if (!isC) {
        const a = V(x0, z0), b = V(x0, z0 + 1), c = V(x0 + 1, z0 + 1), d = V(x0 + 1, z0);
        idx.push(a, b, d, b, c, d);
        continue;
      }
      // the sides in loop order (-z, +x, +z, -x), each starting at its first corner
      const side = (ax, az, bx, bz, nk) => {
        if (collapsed.has(nk)) return [V(ax, az)];
        const pts = [], dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
        for (let t = 0; t < s; t++) pts.push(V(ax + dx * t, az + dz * t));
        return pts;
      };
      const perim = [
        ...side(x0, z0, x0, z0 + s, key(x0 - s, z0, s)),
        ...side(x0, z0 + s, x0 + s, z0 + s, key(x0, z0 + s, s)),
        ...side(x0 + s, z0 + s, x0 + s, z0, key(x0 + s, z0, s)),
        ...side(x0 + s, z0, x0, z0, key(x0, z0 - s, s)),
      ];
      for (let k = 1; k < perim.length - 1; k++) idx.push(perim[0], perim[k], perim[k + 1]);
    }
    pg.setIndex(idx);
    this.groundTris = idx.length / 3;
    this.groundTrisFull = G * G * 2;
  }

  /** True when some ground lies under the sea level (the water shader animates there). */
  hasSea() {
    const half = this.city.S / 2;
    for (let j = 0; j <= 24; j++) for (let i = 0; i <= 24; i++) {
      const x = -half + (i / 24) * 2 * half, z = -half + (j / 24) * 2 * half;
      if (this.heightAt(x, z) < 0) return true;
    }
    return this.city.outskirts.h.some((h) => h < 0);
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
    // the view basis for the tree rule in partVert (right, up, and the view direction: smaller depth = nearer)
    const e = this.camera.matrixWorld.elements;
    this.uniforms.uRight.value.set(e[0], e[1], e[2]);
    this.uniforms.uUp.value.set(e[4], e[5], e[6]);
    this.uniforms.uFwd.value.set(-e[8], -e[9], -e[10]);
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
      // a focus building the ray passes through wins the click, so it stays reachable behind the towers in front of it
      if (t0 < btFocus && this.focusSet.has(b.id)) { btFocus = t0; bestFocus = b; }
    }
    return bestFocus ?? best;
  }

  setHover(id) { if (id !== this.hoverId) { this.hoverId = id; this.uniforms.uHover.value = id; this.dirty = true; } }

  // ------------------------------------------------------------------ see-through
  /** The focus set (building ids): brass outline and glow, and the built buildings that hide them are cut. */
  setFocus(ids) {
    const next = [...new Set(ids)];
    if (next.length === this.focusIds.length && next.every((id, i) => id === this.focusIds[i])) return;
    this.focusIds = next;
    this.focusSet = new Set(next);
    this.syncFocusLabels();
    this.syncGlows();
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

  /** One soft brass halo on the ground around each focus building's footprint. */
  syncGlows() {
    this.clearGlows();
    if (!this.city) return;
    const R = 14; // metres, the halo's reach (matches glowFrag)
    for (const id of this.focusIds) {
      const b = this.city.buildings[id - 1];
      const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2 + R, hd = b.dp / 2 + R, y = b.gz + 0.6;
      const pos = [], uv = [], half = [];
      for (const [la, lb] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
        pos.push(b.x + c * la - s * lb, y, b.y + s * la + c * lb);
        uv.push(la, lb); half.push(b.w / 2, b.dp / 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aHalf', new THREE.Float32BufferAttribute(half, 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const m = new THREE.Mesh(g, this.glowMat);
      m.frustumCulled = false; m.renderOrder = 3;
      this.scene.add(m); this.glows.push(m);
    }
  }
  clearGlows() {
    for (const m of this.glows) { this.scene.remove(m); m.geometry.dispose(); }
    this.glows = [];
  }

  /**
   * The see-through pass, on the CPU and only when something changed (focus, growth, a settled yaw, a zoom of 25%),
   * never per frame: bit 4 on the focus buildings, bit 2 on the built buildings that stand in front of them (the
   * occluders, cut in partVert). A changed set restarts the cut from full height. When the focus is cleared the
   * occluder bits stay until the cut has retracted (animateCut).
   */
  applySeeThrough() {
    const t0 = performance.now();
    this.seeDirty = false;
    this.seeYaw = this.yaw;
    this.seeScale = this.scale;
    this.clearState(BIT_FOCUS);
    if (!this.focusIds.length || !this.city) {
      this.cutTo = 0;
      this.focusKey = '';
      this.uniforms.uFocusN.value = 0;
      for (const om of this.outlines) om.visible = false;
      this.commitState();
      this.seeMs = performance.now() - t0;
      return;
    }
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
    this.clearState(BIT_OCCLUDER);
    for (const id of occluders) this.setFlags(id, this.getFlags(id) | BIT_OCCLUDER);

    // a changed set (or a cut that was retracting) starts again from full height; an unchanged one keeps its progress
    const key = focus.join(',');
    const same = key === this.focusKey && occluders.length === this.occ.length && occluders.every((id, i) => id === this.occ[i]);
    if (!same || this.cutTo === 0) this.cutP = 0;
    this.focusKey = key; this.occ = occluders; this.cutTo = 1;
    let top = 0;
    for (const id of occluders) top = Math.max(top, this.city.buildings[id - 1].h);
    this.uniforms.uFullH.value = top + 12;
    // the trees' rule: the focus boxes widened by the margin, in the view plane, with their depths
    const fb = focusBoxes(this.seeBoxes, focus, margin).slice(0, 12);
    this.uniforms.uFocusN.value = fb.length;
    fb.forEach((f, k) => { this.uniforms.uFocusRect.value[k].set(f.r0, f.u0, f.r1, f.u1); this.uniforms.uFocusDepth.value[k] = f.depth; });
    for (const om of this.outlines) om.visible = true;
    this.commitState();
    this.seeMs = performance.now() - t0;
  }

  /**
   * The cut eases between its two states over 0.35 s (instant under reduced motion), ease-out in uCutT. When the
   * focus is gone and the cut has retracted, the occluder bits are dropped.
   */
  animateCut(dt) {
    if (this.cutP !== this.cutTo) {
      if (!this.motion) this.cutP = this.cutTo;
      else {
        const st = Math.min(1, dt / 0.35);
        this.cutP = this.cutTo > this.cutP ? Math.min(this.cutTo, this.cutP + st) : Math.max(this.cutTo, this.cutP - st);
      }
      this.dirty = true;
    }
    this.uniforms.uCutT.value = 1 - (1 - this.cutP) ** 3;
    if (this.cutTo === 0 && this.cutP === 0 && this.occ.length) {
      this.occ = [];
      this.clearState(BIT_OCCLUDER);
      this.commitState();
    }
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
    this.animateCut(dt);
    this.uniforms.uOutlineM.value = 1.5 * this.scale; // the focus outline is 1.5 CSS pixels wide
    if (this.motion) { this.clock += dt; this.uniforms.uTime.value = this.clock; this.tickAnimation(); }
    // nothing changed: no draw, no label work (zero renders while idle)
    if (!this.dirty || !this.city) return;
    this.renders++;
    this.updateCamera();
    this.applyLOD();
    const gl = this.renderer.getContext();
    this.pollTimer();
    const t0 = performance.now();
    const q = this.beginTimer();
    this.renderer.render(this.scene, this.camera);
    this.endTimer(q);
    if (!this.tq && !this.software) {
      // no timer query: a one-pixel read waits for the draw, so the wall time is the frame time
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
      this.recordFrame(performance.now() - t0);
    }
    this.placeLabels();
    this.dirty = false;
  }

  /** Tree level of detail by scale: full crowns and trunks when close, billboard crowns (no trunks) when far. */
  applyLOD() {
    const far = this.scale > TREE_FAR_SCALE;
    if (far !== this.lodFar) {
      this.lodFar = far;
      for (const m of this.treeFull) m.visible = !far;
      for (const m of this.billboards) m.visible = far;
    }
    const small = this.scale <= SMALL_SCALE;
    if (small !== this.lodSmall) {
      this.lodSmall = small;
      for (const m of this.smallMeshes) m.visible = small;
    }
  }

  /**
   * Animation tick: while water, neon or a train is on screen (and the page is shown and motion is allowed), the view
   * is marked dirty ANIM_FPS times a second, the train moves by the elapsed step. Otherwise nothing animates.
   */
  tickAnimation() {
    const fps = this.saver ? SAVER_FPS : ANIM_FPS;
    if (!fps || !this.animationOnScreen()) return;
    if (this.animT >= 0 && this.clock - this.animT < 1 / fps) return;
    const step = this.animT < 0 ? 0 : this.clock - this.animT;
    this.animT = this.clock;
    if (this.train && step > 0) this.moveTrain(step);
    this.dirty = true;
  }

  /** Whether an animated thing is inside the visible ground (cached per camera position). */
  animationOnScreen() {
    if (!this.city || !(this.hasWater || this.train || this.signXZ.length)) return false;
    const key = `${this.target.x},${this.target.z},${this.scale},${this.yaw},${this.w},${this.h}`;
    if (key !== this.animKey) { this.animKey = key; this.animVisible = this.computeAnimVisible(); }
    return this.animVisible;
  }

  computeAnimVisible() {
    this.updateCamera();
    const cs = [[0, 0], [this.w, 0], [0, this.h], [this.w, this.h]].map(([x, y]) => this.groundAt(x, y)).filter(Boolean);
    if (cs.length < 4) return true;
    const pad = 40;
    const x0 = Math.min(...cs.map((c) => c.x)) - pad, x1 = Math.max(...cs.map((c) => c.x)) + pad;
    const z0 = Math.min(...cs.map((c) => c.z)) - pad, z1 = Math.max(...cs.map((c) => c.z)) + pad;
    const inView = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    if (this.train && this.train.path.some(([x, y]) => inView(x, y))) return true;
    const sx = this.signXZ;
    for (let i = 0; i < sx.length; i += 2) if (inView(sx[i], sx[i + 1])) return true;
    if (this.hasWater) {
      const half = this.city.S / 2, out = this.city.outskirts;
      for (let j = 0; j <= 12; j++) for (let i = 0; i <= 12; i++) {
        const x = x0 + ((x1 - x0) * i) / 12, z = z0 + ((z1 - z0) * j) / 12;
        const h = Math.abs(x) < half && Math.abs(z) < half ? this.heightAt(x, z) : outskirtsHeight(out, x, z);
        if (h < 0) return true;
      }
    }
    return false;
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

/** An instanced geometry over one interleaved part buffer, with the base geometry's vertex attributes. */
function partGeometry(base, ib, count) {
  const g = new THREE.InstancedBufferGeometry();
  for (const name of ['position', 'normal', 'aFace', 'aInfo']) g.setAttribute(name, base.getAttribute(name));
  g.setAttribute('iPos', new THREE.InterleavedBufferAttribute(ib, 3, 0));
  g.setAttribute('iSize', new THREE.InterleavedBufferAttribute(ib, 3, 3));
  g.setAttribute('iRot', new THREE.InterleavedBufferAttribute(ib, 1, 6));
  g.setAttribute('iColor', new THREE.InterleavedBufferAttribute(ib, 3, 7));
  g.setAttribute('iStyle', new THREE.InterleavedBufferAttribute(ib, 4, 10));
  g.setAttribute('iMeta', new THREE.InterleavedBufferAttribute(ib, 4, 14));
  g.instanceCount = count;
  return g;
}

/**
 * Split one part array into tiles (TILE metres square) and size classes: buildings (bid > 0) whose parts are under
 * SMALL_M across are the small class. Each tile carries its instances' data and a bounding sphere over them.
 */
function splitTiles(arr, half, tree) {
  const groups = new Map();
  for (let o = 0; o < arr.length; o += STRIDE) {
    const x = arr[o], y = arr[o + 1], z = arr[o + 2], sx = arr[o + 3], sy = arr[o + 4], sz = arr[o + 5];
    const small = !tree && arr[o + 13] > 0 && Math.max(sx, sz) < SMALL_M;
    const id = `${+small}|${Math.floor((x + half) / TILE)}|${Math.floor((z + half) / TILE)}`;
    let t = groups.get(id);
    if (!t) groups.set(id, t = { small, list: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    for (let q = 0; q < STRIDE; q++) t.list.push(arr[o + q]);
    const R = Math.hypot(sx, sz) / 2;
    const lo = [x - R, y, z - R], hi = [x + R, y + sy, z + R];
    for (let a = 0; a < 3; a++) { t.lo[a] = Math.min(t.lo[a], lo[a]); t.hi[a] = Math.max(t.hi[a], hi[a]); }
  }
  return [...groups.values()].map((t) => {
    const data = Float32Array.from(t.list);
    const c = [0, 1, 2].map((a) => (t.lo[a] + t.hi[a]) / 2);
    const r = Math.hypot(t.hi[0] - t.lo[0], t.hi[1] - t.lo[1], t.hi[2] - t.lo[2]) / 2;
    return { data, count: data.length / STRIDE, small: t.small, sphere: new THREE.Sphere(new THREE.Vector3(...c), r) };
  });
}

function skyFor(el, warm, night) {
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  let top = [118, 150, 178], bot = [212, 222, 226];
  top = mix(top, [74, 76, 112], warm); bot = mix(bot, [236, 176, 128], warm);
  top = mix(top, [10, 12, 20], night); bot = mix(bot, [28, 30, 46], night);
  return { top: `rgb(${top})`, bot: `rgb(${bot})`, haze: bot.map((v) => v / 255) };
}
