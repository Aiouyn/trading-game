// Old story events leave the log. A person's past keeps the beats a chronicle would
// still show: two per axis, plus every layoff day (the grouped sentence lists them).
import type { World } from '../../kernel/index.ts';
import type { Ev } from '../../kernel/events.ts';
import { dollarsMentioned } from './prose.ts';

const PER_AXIS = 2;
const LOOSE_CAP = 64;

const BASE: Record<string, number> = {
  'law.verdict': 5_000_000,
  'law.judgment': 5_000_000,
  'person.breakdown': 900_000,
  'person.condition': 700_000,
  'health.injury': 1_200_000,
  'health.debt': 400_000,
  'firm.layoffs': 700_000,
  'property.repossess': 3_000_000,
  'property.evict': 2_000_000,
  'property.sale': 200_000,
  'property.mortgage': 200_000,
  'loan.grant': 40_000,
};

export interface Folded {
  day: number;
  kind: string;
  actor: string;
  msg: string;
  cause: string;
}

interface Fold {
  actor: string[];
  day: number[];
  kind: string[];
  msg: string[];
  cause: string[];
  axis: number[];
  weight: number[];
  at: Map<string, number[]>;
  loose: number[];
  layDay: Map<string, number[]>;
  layW: Map<string, number>;
  layCause: Map<string, string>;
}

function blank(): Fold {
  return {
    actor: [], day: [], kind: [], msg: [], cause: [], axis: [], weight: [],
    at: new Map(), loose: [],
    layDay: new Map(), layW: new Map(), layCause: new Map(),
  };
}

function foldOf(w: World): Fold {
  const st = w.state.storyFold as Fold | undefined;
  if (st?.at && st.layDay) return st;
  const next = blank();
  w.state.storyFold = next;
  return next;
}

function axisOf(kind: string): number {
  if (kind.startsWith('health.') || kind === 'person.breakdown' || kind === 'person.condition') return 2;
  if (kind.startsWith('law.') || kind === 'person.died' || kind === 'firm.layoffs' || kind === 'firm.ceoFired') return 3;
  if (kind === 'player.wed' || kind === 'player.birth' || kind === 'property.let') return 1;
  return 0;
}

function weightOf(e: Ev): number {
  return (BASE[e.kind] ?? 40_000) + dollarsMentioned(e.msg);
}

function put(h: Fold, e: Ev, weight: number): void {
  const actor = e.actor ?? '';
  const axis = axisOf(e.kind);
  let idxs = actor ? h.at.get(actor) : h.loose;
  if (actor && !idxs) { idxs = []; h.at.set(actor, idxs); }
  if (!idxs) return;
  let same = 0;
  let worst = -1;
  let worstW = Infinity;
  let worstDay = Infinity;
  for (const i of idxs) {
    if (h.axis[i] !== axis) continue;
    same++;
    const w = h.weight[i];
    if (w < worstW || (w === worstW && h.day[i] > worstDay)) { worstW = w; worstDay = h.day[i]; worst = i; }
  }
  const cap = actor ? PER_AXIS : LOOSE_CAP;
  if (same < cap) {
    const i = h.day.length;
    h.actor.push(actor);
    h.day.push(e.day);
    h.kind.push(e.kind);
    h.msg.push(e.msg);
    h.cause.push('');
    h.axis.push(axis);
    h.weight.push(weight);
    idxs.push(i);
    return;
  }
  if (worst >= 0 && (weight > worstW || (weight === worstW && e.day < h.day[worst]))) {
    h.day[worst] = e.day;
    h.kind[worst] = e.kind;
    h.actor[worst] = actor;
    h.msg[worst] = e.msg;
    h.cause[worst] = '';
    h.weight[worst] = weight;
  }
}

function offer(w: World, e: Ev): void {
  const h = foldOf(w);
  const weight = weightOf(e);
  if (e.kind === 'firm.layoffs' && e.actor) {
    const days = h.layDay.get(e.actor) ?? [];
    days.push(e.day);
    h.layDay.set(e.actor, days);
    if (weight >= (h.layW.get(e.actor) ?? -1)) h.layW.set(e.actor, weight);
    return;
  }
  put(h, e, weight);
}

export function bindStoryFold(w: World): void {
  foldOf(w);
  w.events.onFold = (e) => offer(w, e);
}

export function foldedFor(w: World, actors: Set<string>): Folded[] {
  const h = w.state.storyFold as Fold | undefined;
  if (!h?.at) return [];
  const out: Folded[] = [];
  const take = (idxs: number[] | undefined): void => {
    if (!idxs) return;
    for (const i of idxs) {
      if (h.kind[i] === 'firm.layoffs') continue;
      out.push({ day: h.day[i], kind: h.kind[i], actor: h.actor[i], msg: h.msg[i], cause: h.cause[i] });
    }
  };
  for (const id of actors) take(h.at.get(id));
  take(h.loose);
  return out;
}

export function layoffFold(w: World, firmId: string): { days: number[]; weight: number; cause: string } {
  const h = w.state.storyFold as Fold | undefined;
  if (!h?.layDay) return { days: [], weight: 0, cause: '' };
  return {
    days: h.layDay.get(firmId) ?? [],
    weight: h.layW.get(firmId) ?? 700_000,
    cause: h.layCause.get(firmId) ?? '',
  };
}
