import type * as THREE_NS from 'three';
import type { Ramps } from '../art/ramps';
import type { Rgb } from '../art/color';
import { FLOATS_PER_PART } from '../worker/format';
import { screenBasis, viewDirection, type CameraState } from './camera';

type Three = typeof THREE_NS;

export interface PartTable {
  /** FLOATS_PER_PART per part */
  parts: Float32Array;
  colors: Float32Array; // 3 per part
  flat: Uint8Array; // 1 per part
  entity: Int32Array; // index into entityIds, -1 = none
}

export interface SceneConfig {
  dpr: number;
  nearRing: number; // metres; Infinity = windows everywhere
  boats: boolean;
}

export interface GroundData {
  mask: Uint8Array;
  size: number;
  extent: number;
}

const BOAT_COUNT = 24;

/** All GPU state of the city. One shared ShaderMaterial for parts (spec §8). */
export class CityScene {
  readonly renderer: THREE_NS.WebGLRenderer;
  readonly camera: THREE_NS.OrthographicCamera;
  private readonly scene: THREE_NS.Scene;
  private readonly partMat: THREE_NS.ShaderMaterial;
  private readonly groundMat: THREE_NS.ShaderMaterial;
  private readonly unitBox: THREE_NS.BoxGeometry;
  private parts: THREE_NS.Mesh | null = null;
  private boats: THREE_NS.Mesh | null = null;
  private ground: THREE_NS.Mesh | null = null;
  private groundTex: THREE_NS.DataTexture | null = null;
  private selection: THREE_NS.LineSegments | null = null;
  private readonly selectionMat: THREE_NS.LineBasicMaterial;
  partCount = 0;
  uploads = 0;
  private disposed = false;
  private lastInfo = { geometries: 0, textures: 0 };

  constructor(
    private readonly T: Three,
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    private readonly ramps: Ramps,
    private config: SceneConfig,
    private extent = 512,
  ) {
    this.renderer = new T.WebGLRenderer({ canvas, context, antialias: false });
    this.renderer.outputColorSpace = T.LinearSRGBColorSpace; // colours are already display sRGB
    this.renderer.setClearColor(new T.Color(...ramps.water), 1);
    this.renderer.info.autoReset = true;
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    const v3 = (c: Rgb) => new T.Vector3(...c);
    this.partMat = new T.ShaderMaterial({
      vertexShader: '',
      fragmentShader: '',
      uniforms: {
        uTime: { value: 0 },
        uKey: { value: v3(ramps.keyLight) },
        uFill: { value: v3(ramps.fillLight) },
        uSunDir: { value: new T.Vector3(-0.5, 0.6, 0.4) },
        uRoof: { value: v3(ramps.roof) },
        uLit: { value: v3(ramps.litWindow) },
        uDark: { value: v3(ramps.darkWindow) },
        uNight: { value: 1 },
        uLitRatio: { value: 0.5 },
        uMask: { value: 0 },
        uFocus: { value: new T.Vector2(0, 0) },
        uNearRing: { value: 1e9 },
      },
    });
    this.groundMat = new T.ShaderMaterial({
      vertexShader: '',
      fragmentShader: '',
      uniforms: {
        uMaskTex: { value: null },
        uWater: { value: v3(ramps.water) },
        uLand: { value: v3(ramps.land) },
        uPark: { value: v3(ramps.park) },
        uRoad: { value: v3(ramps.road) },
        uFill: { value: this.partMat.uniforms.uFill.value },
        uKey: { value: this.partMat.uniforms.uKey.value },
        uMask: { value: 0 },
      },
    });
    this.selectionMat = new T.LineBasicMaterial({ color: new T.Color(...ramps.brass) });
    this.unitBox = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.applyConfig(config);
  }

  setShaders(src: { partVert: string; partFrag: string; groundVert: string; groundFrag: string }): void {
    this.partMat.vertexShader = src.partVert;
    this.partMat.fragmentShader = src.partFrag;
    this.groundMat.vertexShader = src.groundVert;
    this.groundMat.fragmentShader = src.groundFrag;
    this.partMat.needsUpdate = true;
    this.groundMat.needsUpdate = true;
  }

  applyConfig(c: SceneConfig): void {
    this.config = c;
    this.renderer.setPixelRatio(c.dpr);
    this.partMat.uniforms.uNearRing.value = Number.isFinite(c.nearRing) ? c.nearRing : 1e9;
    if (this.boats) this.boats.visible = c.boats;
  }

  setSize(w: number, h: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
  }

  setGround(g: GroundData): void {
    const T = this.T;
    this.extent = g.extent;
    if (this.ground) {
      this.ground.geometry.dispose();
      this.scene.remove(this.ground);
    }
    this.groundTex?.dispose();
    const tex = new T.DataTexture(g.mask, g.size, g.size, T.RedFormat, T.UnsignedByteType);
    tex.magFilter = T.NearestFilter;
    tex.minFilter = T.NearestFilter;
    tex.flipY = false;
    tex.needsUpdate = true;
    this.groundTex = tex;
    this.groundMat.uniforms.uMaskTex.value = tex;
    const geo = new T.PlaneGeometry(g.extent * 2, g.extent * 2).rotateX(-Math.PI / 2);
    // PlaneGeometry uv.v grows with +y, which after rotateX(-90°) is -z; flip so v grows with +z.
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.ground = new T.Mesh(geo, this.groundMat);
    this.ground.frustumCulled = false;
    this.ground.renderOrder = -1;
    this.scene.add(this.ground);
  }

  /** Uploads every part as one instanced draw. */
  setParts(t: PartTable, water: (x: number, z: number) => boolean): void {
    const T = this.T;
    this.uploads++;
    if (this.parts) {
      this.parts.geometry.dispose();
      this.scene.remove(this.parts);
    }
    const n = t.parts.length / FLOATS_PER_PART;
    this.partCount = n;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n * 3);
    const meta = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * FLOATS_PER_PART;
      pos.set([t.parts[o], t.parts[o + 4], t.parts[o + 1]], i * 3);
      size.set([t.parts[o + 2], t.parts[o + 5], t.parts[o + 3]], i * 3);
      meta.set([fract(t.parts[o + 6] * 0.618 + t.parts[o] * 0.013), t.flat[i], 0, 0], i * 4);
    }
    this.parts = new T.Mesh(this.instanced(pos, size, t.colors, meta, n), this.partMat);
    this.parts.frustumCulled = false;
    this.scene.add(this.parts);
    this.buildBoats(water);
  }

  /** Recolours parts in place (overlays) without rebuilding geometry. */
  setColors(colors: Float32Array, flat: Uint8Array): void {
    if (!this.parts) return;
    const g = this.parts.geometry as THREE_NS.InstancedBufferGeometry;
    const c = g.getAttribute('iColor') as THREE_NS.InstancedBufferAttribute;
    (c.array as Float32Array).set(colors);
    c.needsUpdate = true;
    const m = g.getAttribute('iMeta') as THREE_NS.InstancedBufferAttribute;
    for (let i = 0; i < flat.length; i++) (m.array as Float32Array)[i * 4 + 1] = flat[i];
    m.needsUpdate = true;
  }

  setSelection(boxes: { x: number; z: number; w: number; d: number; y0: number; h: number }[]): void {
    const T = this.T;
    if (this.selection) {
      this.selection.geometry.dispose();
      this.scene.remove(this.selection);
      this.selection = null;
    }
    if (!boxes.length) return;
    const edges = new T.EdgesGeometry(this.unitBox);
    const src = edges.getAttribute('position');
    const out = new Float32Array(boxes.length * src.count * 3);
    boxes.forEach((b, k) => {
      for (let i = 0; i < src.count; i++) {
        const o = (k * src.count + i) * 3;
        out[o] = b.x + src.getX(i) * (b.w + 0.6);
        out[o + 1] = b.y0 + src.getY(i) * (b.h + 0.4);
        out[o + 2] = b.z + src.getZ(i) * (b.d + 0.6);
      }
    });
    edges.dispose();
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(out, 3));
    this.selection = new T.LineSegments(g, this.selectionMat);
    this.selection.frustumCulled = false;
    this.scene.add(this.selection);
  }

  setLight(l: { sunDir: [number, number, number]; night: number; key: Rgb; fill: Rgb; litRatio: number }): void {
    const u = this.partMat.uniforms;
    (u.uSunDir.value as THREE_NS.Vector3).set(...l.sunDir);
    (u.uKey.value as THREE_NS.Vector3).set(...l.key);
    (u.uFill.value as THREE_NS.Vector3).set(...l.fill);
    u.uNight.value = l.night;
    u.uLitRatio.value = l.litRatio;
  }

  setTime(seconds: number): void {
    this.partMat.uniforms.uTime.value = seconds;
  }

  setCamera(cam: CameraState, viewW: number, viewH: number, baseHalf: number): void {
    const half = baseHalf / cam.zoom;
    const aspect = viewW / Math.max(1, viewH);
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    const [dx, dy, dz] = viewDirection(cam.rotation);
    const dist = 2000;
    this.camera.position.set(cam.target[0] + dx * dist, dy * dist, cam.target[1] + dz * dist);
    const { up } = screenBasis(cam.rotation);
    this.camera.up.set(...up);
    this.camera.lookAt(cam.target[0], 0, cam.target[1]);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    (this.partMat.uniforms.uFocus.value as THREE_NS.Vector2).set(cam.target[0], cam.target[1]);
  }

  render(mask = false): void {
    this.partMat.uniforms.uMask.value = mask ? 1 : 0;
    this.groundMat.uniforms.uMask.value = mask ? 1 : 0;
    this.selectionMat.color.setRGB(...(mask ? ([1, 1, 1] as Rgb) : this.ramps.brass));
    this.renderer.setClearColor(new this.T.Color(...(mask ? ([0, 0, 0] as Rgb) : this.ramps.water)), 1);
    this.renderer.render(this.scene, this.camera);
    if (mask) {
      this.partMat.uniforms.uMask.value = 0;
      this.groundMat.uniforms.uMask.value = 0;
      this.selectionMat.color.setRGB(...this.ramps.brass);
      this.renderer.setClearColor(new this.T.Color(...this.ramps.water), 1);
    }
  }

  /** World point → CSS pixels relative to the canvas. */
  project(p: [number, number, number], cssW: number, cssH: number): { x: number; y: number } {
    const v = new this.T.Vector3(...p).project(this.camera);
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
  }

  /** Ray (origin, direction) for CSS pixel coordinates. */
  ray(x: number, y: number, cssW: number, cssH: number): { o: [number, number, number]; d: [number, number, number] } {
    const T = this.T;
    const ndc = new T.Vector2((x / cssW) * 2 - 1, 1 - (y / cssH) * 2);
    const rc = new T.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const { origin: o, direction: d } = rc.ray;
    return { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] };
  }

  info(): { drawCalls: number; triangles: number; geometries: number; textures: number; gpuBytes: number } {
    const i = this.renderer.info;
    if (!this.disposed) this.lastInfo = { geometries: i.memory.geometries, textures: i.memory.textures };
    let bytes = 0;
    this.scene.traverse((o) => {
      const g = (o as THREE_NS.Mesh).geometry as THREE_NS.BufferGeometry | undefined;
      if (!g) return;
      for (const a of Object.values(g.attributes)) bytes += (a as THREE_NS.BufferAttribute).array.byteLength;
      if (g.index) bytes += g.index.array.byteLength;
    });
    if (this.groundTex) bytes += this.groundTex.image.width * this.groundTex.image.height;
    const c = this.renderer.domElement;
    bytes += c.width * c.height * 8; // colour + depth/stencil
    return { drawCalls: i.render.calls, triangles: i.render.triangles, ...this.lastInfo, gpuBytes: bytes };
  }

  /** Frees every geometry, material and texture, then the renderer. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    for (const m of [this.parts, this.boats, this.ground, this.selection]) {
      if (m) {
        m.geometry.dispose();
        this.scene.remove(m);
      }
    }
    this.parts = this.boats = this.ground = null;
    this.selection = null;
    this.groundTex?.dispose();
    this.groundTex = null;
    this.unitBox.dispose();
    this.partMat.dispose();
    this.groundMat.dispose();
    this.selectionMat.dispose();
    const i = this.renderer.info.memory;
    this.lastInfo = { geometries: i.geometries, textures: i.textures };
    this.disposed = true;
    this.renderer.dispose();
  }

  private instanced(
    pos: Float32Array,
    size: Float32Array,
    colors: Float32Array,
    meta: Float32Array,
    n: number,
  ): THREE_NS.InstancedBufferGeometry {
    const T = this.T;
    const g = new T.InstancedBufferGeometry();
    // Own copies of the 24-vertex box so disposing one mesh never frees another's buffers.
    g.setIndex(this.unitBox.index!.clone());
    g.setAttribute('position', this.unitBox.getAttribute('position').clone());
    g.setAttribute('normal', this.unitBox.getAttribute('normal').clone());
    g.setAttribute('iPos', new T.InstancedBufferAttribute(pos, 3));
    g.setAttribute('iSize', new T.InstancedBufferAttribute(size, 3));
    g.setAttribute('iColor', new T.InstancedBufferAttribute(new Float32Array(colors), 3));
    g.setAttribute('iMeta', new T.InstancedBufferAttribute(meta, 4));
    g.instanceCount = n;
    return g;
  }

  private buildBoats(water: (x: number, z: number) => boolean): void {
    const T = this.T;
    if (this.boats) {
      this.boats.geometry.dispose();
      this.scene.remove(this.boats);
      this.boats = null;
    }
    const pos: number[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let tries = 0; tries < 2000 && pos.length / 3 < BOAT_COUNT; tries++) {
      const x = (rnd() * 2 - 1) * this.extent * 0.9;
      const z = (rnd() * 2 - 1) * this.extent * 0.9;
      if (water(x, z) && water(x + 30, z + 30) && water(x - 30, z - 30)) pos.push(x, 0, z);
    }
    const n = pos.length / 3;
    if (!n) return;
    const size = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const meta = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      size.set([5, 2.2, 14], i * 3);
      colors.set(this.ramps.facades[3], i * 3);
      meta.set([rnd(), 0, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30], i * 4);
    }
    this.boats = new T.Mesh(this.instanced(new Float32Array(pos), size, colors, meta, n), this.partMat);
    this.boats.frustumCulled = false;
    this.boats.visible = this.config.boats;
    this.scene.add(this.boats);
  }
}

function fract(v: number): number {
  return v - Math.floor(v);
}
