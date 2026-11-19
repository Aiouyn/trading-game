// Who in the player's circle knows whom. People do not live alone: two contacts who work at the same firm,
// share a family or have each other in their own books of contacts are linked, and the screens draw the links.
import type { World } from '../../kernel/index.ts';
import type { EconState } from '../economy/index.ts';
import { contactsOf } from '../social/index.ts';

export interface Link { a: number; b: number; kind: 'family' | 'work' | 'friends'; why: string }

const econ = (w: World): EconState => w.state.economy as EconState;

function kin(w: World, a: number, b: number): string {
  const P = econ(w).P;
  if (a >= P.n || b >= P.n) return '';
  if (P.spouse[a] === b || P.spouse[b] === a) return 'married';
  if (P.parent[a] === b) return 'their parent';
  if (P.parent[b] === a) return 'their child';
  const pa = P.parent[a], pb = P.parent[b];
  if (pa >= 0 && pa === pb) return 'siblings';
  if (P.family[a] === P.family[b]) return 'the same family';
  return '';
}

/** Links among the given people (the player's contacts). The player is not a node: every contact already knows the player. */
export function circleLinks(w: World, people: number[]): Link[] {
  const s = econ(w), P = s.P;
  const out: Link[] = [];
  const seen = new Set<string>();
  const known = new Map<number, Set<number>>();
  for (const a of people) known.set(a, new Set(contactsOf(w, a).map((c) => c.who)));
  for (let x = 0; x < people.length; x++) {
    for (let y = x + 1; y < people.length; y++) {
      const a = people[x], b = people[y];
      if (a === b || a < 0 || b < 0 || a >= P.n || b >= P.n) continue;
      const key = `${a}:${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const k = kin(w, a, b);
      if (k) { out.push({ a, b, kind: 'family', why: k }); continue; }
      const ea = P.employer[a], eb = P.employer[b];
      if (ea >= 0 && ea === eb) { out.push({ a, b, kind: 'work', why: `they work together at ${s.firms[ea].name}` }); continue; }
      if (known.get(a)?.has(b) || known.get(b)?.has(a)) out.push({ a, b, kind: 'friends', why: 'they know each other' });
    }
  }
  return out;
}
