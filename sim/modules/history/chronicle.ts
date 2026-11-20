// Decade chapters and the family trees of the twenty richest houses.
import fs from 'node:fs';
import path from 'node:path';
import { DAYS_PER_YEAR, type World } from '../../kernel/index.ts';
import { calYear } from '../../kernel/calendar.ts';
import type { EconState } from '../economy/index.ts';
import { type Entry, historyOf } from './index.ts';
import { causeParagraph, dollarsMentioned, joinAnd } from './prose.ts';
import { whole as grouped } from '../player/gamedate.ts';

const econ = (w: World): EconState => w.state.economy as EconState;

const KIND_WEIGHT: Record<string, number> = {
  shock: 80_000_000,
  recession: 60_000_000,
  'bank.fail': 50_000_000,
  'bank.run': 40_000_000,
  failure: 30_000_000,
  takeover: 25_000_000,
  inflation: 15_000_000,
  recovery: 12_000_000,
  inheritance: 8_000_000,
  dynasty: 7_000_000,
  removal: 7_000_000,
  death: 6_000_000,
  fortune: 5_000_000,
  disinflation: 4_000_000,
  listing: 2_000_000,
  succession: 1_000_000,
  record: 500_000,
  founding: 100_000,
  player: 50_000,
};

function storyWeight(e: Entry): number {
  let w = (KIND_WEIGHT[e.kind] ?? 1_000) + dollarsMentioned(e.text);
  if (e.kind === 'founding' && e.text.startsWith('Port Avalon is founded')) w += 500_000_000;
  return w;
}

/** The biggest stories in a decade. The opening of the city stands in for the list of every house. */
export function biggestStories(list: Entry[], n = 3): Entry[] {
  const ranked = [...list].sort((a, b) => storyWeight(b) - storyWeight(a) || a.day - b.day || a.text.localeCompare(b.text));
  const picked: Entry[] = [];
  for (const e of ranked) {
    if (e.kind === 'founding' && !e.text.startsWith('Port Avalon is founded') && ranked.some((x) => x.text.startsWith('Port Avalon is founded'))) continue;
    picked.push(e);
    if (picked.length === n) break;
  }
  return picked.sort((a, b) => a.day - b.day || a.year - b.year || a.text.localeCompare(b.text));
}

function headline(e: Entry): string {
  switch (e.kind) {
    case 'shock': return 'A shock';
    case 'recession': return 'Recession';
    case 'recovery': return 'Recovery';
    case 'inflation': return 'Prices';
    case 'disinflation': return 'Prices ease';
    case 'failure': return 'A failure';
    case 'takeover': return 'A takeover';
    case 'fortune': return 'Fortunes';
    case 'founding': return 'The founding';
    case 'inheritance': return 'An inheritance';
    case 'death': return 'A death';
    case 'dynasty': return 'A dynasty';
    case 'removal': return 'A removal';
    case 'listing': return 'A listing';
    case 'succession': return 'A succession';
    case 'record': return 'The record';
    case 'bank.fail': return 'A bank fails';
    case 'bank.run': return 'A run on a bank';
    default: return 'A story';
  }
}

function expand(e: Entry, all: Entry[]): { text: string; people: string[]; firms: string[] } {
  if (e.kind !== 'founding' || !e.text.startsWith('Port Avalon is founded')) {
    return { text: e.text, people: e.people.filter(Boolean), firms: e.firms.filter(Boolean) };
  }
  const houses = all.filter((x) => x.kind === 'founding' && x !== e);
  const firms = [...new Set(houses.map((h) => h.firms[0]).filter(Boolean))];
  const people = [...new Set(houses.map((h) => h.people[0]).filter(Boolean))];
  const shownF = firms.slice(0, 6);
  const more = firms.length > shownF.length ? ` and ${firms.length - shownF.length} more` : '';
  const named = shownF.length ? `, among them ${shownF.join(', ')}${more}` : '';
  const text = `${e.text} ${houses.length} houses opened with the city${named}.`;
  return {
    text,
    people: (people.length ? people : e.people).filter(Boolean).slice(0, 8),
    firms: (shownF.length ? shownF : e.firms).filter(Boolean),
  };
}

function tell(text: string): string {
  return text
    .replace(/\bbank_(\d+)\b/g, 'Bank $1')
    .replace(/([a-z]):([a-z])/g, '$1: $2');
}

/** Markdown for the chosen stories: the tale, the people, and the cause in sentences. */
export function storyLines(chosen: Entry[], context: Entry[]): string[] {
  const lines: string[] = [];
  if (!chosen.length) return lines;
  const names = ['', 'one', 'two', 'three', 'four', 'five'];
  const word = chosen.length === 1 ? 'The biggest story.' : `The ${names[chosen.length] ?? String(chosen.length)} biggest stories.`;
  lines.push(word, '');
  chosen.forEach((e, n) => {
    const told = expand(e, context);
    const citywide = e.kind === 'shock' || e.kind === 'recession' || e.kind === 'recovery' || e.kind === 'inflation' || e.kind === 'disinflation';
    const people = citywide ? told.people.filter((name) => told.text.includes(name)) : told.people;
    const firms = citywide ? told.firms.filter((name) => told.text.includes(name)) : told.firms;
    lines.push(`### ${n + 1}. ${headline(e)}`, '');
    lines.push(`Year ${e.year}. ${tell(told.text)}`, '');
    if (people.length) lines.push(`People: ${joinAnd([...new Set(people)])}.`);
    if (firms.length) lines.push(`Firms: ${joinAnd([...new Set(firms)])}.`);
    if (people.length || firms.length) lines.push('');
    const cause = causeParagraph(e.cause, told.text);
    lines.push(cause || 'Nothing earlier than this is in the book.');
    lines.push('');
  });
  return lines;
}

function chapters(w: World): string {
  const s = econ(w), h = historyOf(w);
  let alive = 0;
  for (let i = 0; i < s.P.n; i++) if (s.P.alive(i)) alive++;
  const end = Math.max(w.year, ...h.entries.map((e) => e.year));
  const lines: string[] = [
    '# Chronicle of Port Avalon',
    '',
    `Seed ${w.seed}. ${w.year} years have passed. ${s.P.n} people have been born here, and ${alive} are living.`,
    '',
  ];
  const byDecade = new Map<number, Entry[]>();
  for (const e of h.entries) {
    const d = Math.floor((e.year - 1) / 10);
    const list = byDecade.get(d);
    if (list) list.push(e);
    else byDecade.set(d, [e]);
  }
  const decades = [...byDecade.keys()].sort((a, b) => a - b);
  for (const d of decades) {
    const a = d * 10 + 1;
    const b = Math.min(a + 9, end);
    const list = byDecade.get(d) ?? [];
    lines.push(`## Years ${a}–${b}`, '');
    lines.push(...storyLines(biggestStories(list, 3), list));
  }
  return lines.join('\n');
}

function families(w: World): string {
  const s = econ(w), P = s.P, h = historyOf(w);
  const wealth = new Float64Array(P.n);
  // Reuse the last snapshot when it still matches the living; otherwise deposits dominate the ranking less than the decade pass, so sum the saved wealth vector if it is current.
  if (h.wealth.length === P.n) wealth.set(h.wealth);
  else {
    for (let i = 0; i < P.n && i < h.wealth.length; i++) wealth[i] = h.wealth[i];
  }
  const byFam = new Map<number, number>();
  for (let i = 0; i < P.n; i++) if (P.alive(i)) byFam.set(P.family[i], (byFam.get(P.family[i]) ?? 0) + Math.max(0, wealth[i]));
  const top = [...byFam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const weds = new Map<number, { other: number; year: number }[]>();
  for (let i = 0; i < h.wedN; i++) {
    const a = h.wedA[i], b = h.wedB[i], year = h.wedY[i];
    const la = weds.get(a); const row = { other: b, year };
    if (la) la.push(row); else weds.set(a, [row]);
    const back = { other: a, year };
    const lb = weds.get(b); if (lb) lb.push(back); else weds.set(b, [back]);
  }
  const jobs = new Map<number, { firm: string; fromYear: number; toYear: number }[]>();
  for (const c of h.careers) {
    const row = { firm: c.firm, fromYear: c.fromYear, toYear: c.toYear };
    const list = jobs.get(c.person); if (list) list.push(row); else jobs.set(c.person, [row]);
  }
  const got = new Map<string, string[]>();
  for (const e of h.entries) if (e.kind === 'inheritance' && e.people.length > 1) {
    for (const name of e.people.slice(1)) {
      const line = `inherits from ${e.people[0]} in year ${e.year}`;
      const list = got.get(name); if (list) list.push(line); else got.set(name, [line]);
    }
  }
  const money = (cents: number): string => {
    const a = Math.abs(Math.round(cents));
    const sign = cents < 0 ? '-' : '';
    if (a >= 1e8) return `${sign}$${(a / 1e8).toFixed(1)} million`;
    if (a >= 1e5) return `${sign}$${(a / 1e5).toFixed(1)} thousand`;
    return `${sign}${grouped(a)}`;
  };
  const lines: string[] = ['# Family trees', '', `The twenty richest families at the end of year ${w.year}.`, ''];
  for (const [fam, worth] of top) {
    const members = new Set<number>();
    for (let i = 0; i < P.n; i++) if (P.family[i] === fam) members.add(i);
    for (const i of [...members]) for (const wed of weds.get(i) ?? []) members.add(wed.other);
    const ids = [...members].sort((a, b) => P.born[a] - P.born[b] || a - b);
    lines.push(`## The ${P.families[fam]} family`, '', `Worth ${money(worth)} at the end of year ${w.year}. ${ids.length} people in the tree.`, '');
    for (const i of ids) {
      const born = P.born[i] < 0 ? 'before the founding' : `in year ${calYear(P.born[i])}`;
      const bits = [`${P.name(i)} is born ${born}`];
      if (P.parent[i] >= 0) bits.push(`child of ${P.name(P.parent[i])}`);
      for (const wed of weds.get(i) ?? []) bits.push(`marries ${P.name(wed.other)} in year ${wed.year}`);
      for (const c of jobs.get(i) ?? []) bits.push(`chief executive of ${c.firm} from year ${c.fromYear}${c.toYear ? ` to year ${c.toYear}` : ''}`);
      for (const line of got.get(P.name(i)) ?? []) bits.push(line);
      if (h.diedYear[i] > 0) bits.push(`dies in year ${h.diedYear[i]}`);
      else if (P.alive(i)) bits.push('still living');
      lines.push(`- ${bits.join(', ')}.`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function writeHistory(w: World, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const body = chapters(w);
  const trees = families(w);
  fs.writeFileSync(path.join(dir, 'chronicle.md'), `${body}\n${trees}`);
  fs.writeFileSync(path.join(dir, 'families.md'), trees);
  const rows = historyOf(w).entries.map((e) => JSON.stringify({
    year: e.year, kind: e.kind, people: e.people, firms: e.firms, text: e.text, cause: e.cause,
  }));
  fs.writeFileSync(path.join(dir, 'chronicle.jsonl'), rows.join('\n') + '\n');
}
