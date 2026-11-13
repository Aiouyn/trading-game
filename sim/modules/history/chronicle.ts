// Decade chapters and the family trees of the twenty richest houses.
import fs from 'node:fs';
import path from 'node:path';
import { DAYS_PER_YEAR, type World } from '../../kernel/index.ts';
import type { EconState } from '../economy/index.ts';
import { type Entry, historyOf } from './index.ts';

const econ = (w: World): EconState => w.state.economy as EconState;

function because(cause: string): string {
  const line = cause.split('\n')[1];
  if (!line) return '';
  const msg = line.split(': ').slice(1).join(': ').replace(/\s+\(outside shock\)\s*$/, '').replace(/\s+\(see above\)\s*$/, '');
  if (!msg) return '';
  return ` This followed: ${msg.length > 180 ? msg.slice(0, 177) + '...' : msg}`;
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
    lines.push(`## Years ${a}–${b}`, '');
    const list = byDecade.get(d) ?? [];
    let i = 0;
    while (i < list.length) {
      const e = list[i];
      if (e.kind !== 'founding') {
        lines.push(`Year ${e.year}. ${e.text}${because(e.cause)}`, '');
        i++;
        continue;
      }
      const year = e.year;
      lines.push(`Year ${year}. These are the houses and firms that opened the city.`, '');
      while (i < list.length && list[i].kind === 'founding' && list[i].year === year) {
        lines.push(`- ${list[i].text}`);
        i++;
      }
      lines.push('');
    }
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
    return `${sign}$${(a / 100).toFixed(0)}`;
  };
  const lines: string[] = ['# Family trees', '', `The twenty richest families at the end of year ${w.year}.`, ''];
  for (const [fam, worth] of top) {
    const members = new Set<number>();
    for (let i = 0; i < P.n; i++) if (P.family[i] === fam) members.add(i);
    for (const i of [...members]) for (const wed of weds.get(i) ?? []) members.add(wed.other);
    const ids = [...members].sort((a, b) => P.born[a] - P.born[b] || a - b);
    lines.push(`## The ${P.families[fam]} family`, '', `Worth ${money(worth)} at the end of year ${w.year}. ${ids.length} people in the tree.`, '');
    for (const i of ids) {
      const born = P.born[i] < 0 ? 'before the founding' : `in year ${Math.floor(P.born[i] / DAYS_PER_YEAR) + 1}`;
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
