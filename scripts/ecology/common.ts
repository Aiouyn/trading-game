/**
 * Shared helpers for the ecology scripts (scripts/ecology/gates.ts, learnability.ts, crowd-hunt.ts).
 * In-process only: the scripts never spawn child processes. Pure helpers; the engine is only read here.
 */
import { defaultConfig, universeConfig } from '../../src/engine/index';
import type { EcologyConfig, WorldConfig } from '../../src/engine/index';

export const argv = process.argv.slice(2);

/** --name value, or the fallback */
export function arg(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--') ? argv[i + 1]! : fallback;
}
export const numArg = (name: string, fallback: number): number => Number(arg(name, String(fallback)));
export const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

/** Every --set key=value, with dotted keys nested (sizes.trend=2). Values are numbers. */
export function setArgs(): string[] {
  const out: string[] = [];
  argv.forEach((a, i) => { if (a === '--set' && argv[i + 1]) out.push(argv[i + 1]!); });
  return out;
}
export function ecologyOverrides(): Partial<EcologyConfig> {
  const o: Record<string, unknown> = {};
  for (const s of setArgs()) {
    const [k, v] = s.split('=');
    const keys = k!.split('.');
    let t = o;
    for (const kk of keys.slice(0, -1)) t = (t[kk] ??= {}) as Record<string, unknown>;
    t[keys[keys.length - 1]!] = Number(v);
  }
  return o as Partial<EcologyConfig>;
}

/**
 * The momentum-fix fields that staging's defaultConfig carried (news is permanent, 70% prints at once, the rest
 * drifts in). The v1 bare defaultConfig does not set them; universeConfig does. Scripts add them to the bare catalog
 * so the bare run matches the staging calibration.
 */
export const MOMENTUM_FIX = { permanentShare: 0.9, jumpPermanent: 1, jumpImmediate: 0.7, jumpCompensation: true } as const;

/**
 * The world config for a run. --universe = universeConfig (183 assets). Otherwise the bare 17-asset catalog with the
 * momentum-fix fields. The ecology field is always set explicitly (mode 'off' for the live path), because the universe
 * defaults to ecology full.
 */
export function worldConfig(universe: boolean, tpd: number, ecology: Partial<EcologyConfig>): WorldConfig {
  return universe
    ? universeConfig({ ticksPerDay: tpd, ecology })
    : defaultConfig({ ticksPerDay: tpd, ...MOMENTUM_FIX, ecology });
}

export const mean = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
export function median(x: readonly number[]): number {
  if (!x.length) return Number.NaN;
  const s = [...x].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}
/** standard error of the mean (sample sd / sqrt n) */
export function sem(x: readonly number[]): number {
  if (x.length < 2) return Number.NaN;
  const m = mean(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1) / x.length);
}
export function corr(a: readonly number[], b: readonly number[]): number {
  const n = a.length, ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
export function rank(x: readonly number[]): number[] {
  const r = new Array<number>(x.length);
  x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).forEach(([, i], j) => { r[i] = j; });
  return r;
}
export function spearman(a: readonly number[], b: readonly number[]): number {
  const ra = rank(a), rb = rank(b);
  let dd = 0;
  for (let i = 0; i < a.length; i++) dd += (ra[i]! - rb[i]!) ** 2;
  const n = a.length;
  return 1 - (6 * dd) / (n * (n * n - 1));
}
export const diffs = (x: readonly number[]): number[] => x.slice(1).map((v, i) => v - x[i]!);
