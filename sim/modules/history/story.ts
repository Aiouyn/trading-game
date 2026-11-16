// The player's chronicle: five events that moved money, family, health or freedom,
// the family tree, the firms, and the city's stories during that life.
import fs from 'node:fs';
import path from 'node:path';
import type { World } from '../../kernel/index.ts';
import type { Ev } from '../../kernel/events.ts';
import { GOODS } from '../economy/content.ts';
import { DEP, type EconState, type Firm } from '../economy/index.ts';
import { PRISON } from '../economy/people.ts';
import { biggestStories, storyLines } from './chronicle.ts';
import { historyOf, type Entry } from './index.ts';
import { causeParagraph, dollarsMentioned, joinAnd, money, plainText, softenIds, when } from './prose.ts';

const econ = (w: World): EconState => w.state.economy as EconState;

interface Scene {
  id?: string;
  name?: string;
  story?: string[];
  outcome?: 'win' | 'loss';
  reason?: string;
  worthAtStart?: number;
  begun?: number;
  who?: number;
}

interface PlayerBits {
  who: number;
  line?: number[];
  generation?: number;
  arrived?: number;
  final?: string;
}

type Axis = 'money' | 'family' | 'health' | 'freedom';

interface Beat {
  day: number;
  kind: string;
  axis: Axis;
  weight: number;
  title: string;
  text: string;
  cause: string;
  people: string[];
  /** Repeated events of one kind at one firm collapse into a single telling. */
  group?: string;
  days?: number[];
}

const BASE: Record<string, number> = {
  'player.arrive': 300_000,
  'player.wed': 1_500_000,
  'player.birth': 2_000_000,
  'player.died': 8_000_000,
  'person.died': 6_000_000,
  'player.heir': 3_000_000,
  'player.health': 800_000,
  'player.court': 80_000,
  'player.will': 200_000,
  'player.retire': 600_000,
  'player.school': 150_000,
  'player.hand': 700_000,
  'player.report': 120_000,
  'player.tip': 80_000,
  'player.option': 100_000,
  'player.home': 200_000,
  'law.verdict': 5_000_000,
  'law.judgment': 5_000_000,
  'person.breakdown': 900_000,
  'person.condition': 700_000,
  'health.injury': 1_200_000,
  'health.debt': 400_000,
  'firm.layoffs': 700_000,
  'firm.cashCrunch': 900_000,
  'firm.failed': 4_000_000,
  'firm.default': 4_000_000,
  'firm.ceoFired': 1_500_000,
  'firm.succession': 800_000,
  'firm.takeover': 2_000_000,
  'property.repossess': 3_000_000,
  'property.evict': 2_000_000,
  'property.sale': 200_000,
  'property.mortgage': 200_000,
};

const FIRM_KINDS = new Set(['firm.layoffs', 'firm.cashCrunch', 'firm.failed', 'firm.default', 'firm.ceoFired', 'firm.succession', 'firm.takeover']);

function sceneOf(w: World): Scene | undefined {
  const sc = w.state.scenario as Scene | undefined;
  if (!sc || typeof sc.id !== 'string') return;
  return sc;
}

function playerOf(w: World): PlayerBits | undefined {
  const st = w.state.player as PlayerBits | undefined;
  if (!st || st.who === undefined || st.who < 0) return;
  return st;
}

function nameOf(w: World): (id: string) => string | undefined {
  const s = econ(w);
  return (id: string): string | undefined => {
    if (id.startsWith('p_')) {
      const i = Number(id.slice(2));
      return i >= 0 && i < s.P.n ? s.P.name(i) : undefined;
    }
    const f = s.firms.find((x) => x.id === id);
    return f?.name;
  };
}

function soften(w: World, text: string): string {
  return softenIds(text, nameOf(w));
}

function axisOf(kind: string): Axis {
  if (kind === 'player.wed' || kind === 'player.birth' || kind === 'player.court' || kind === 'player.will' || kind === 'player.heir' || kind === 'player.school') return 'family';
  if (kind === 'player.health' || kind.startsWith('health.') || kind === 'person.breakdown' || kind === 'person.condition') return 'health';
  if (kind.startsWith('law.') || kind === 'player.arrive' || kind === 'player.retire' || kind === 'player.hand' || kind === 'player.died' || kind === 'person.died' || kind === 'firm.layoffs' || kind === 'firm.ceoFired') return 'freedom';
  return 'money';
}

function titleOf(kind: string, axis: Axis): string {
  switch (kind) {
    case 'player.arrive': return 'The first job';
    case 'player.wed': return 'A marriage';
    case 'player.birth': return 'A child';
    case 'player.died':
    case 'person.died': return 'A death';
    case 'player.heir': return 'The heir';
    case 'player.health': return 'Health';
    case 'player.court': return 'A courtship';
    case 'player.will': return 'A will';
    case 'player.retire': return 'Retirement';
    case 'player.school': return 'School';
    case 'player.hand': return 'The seat';
    case 'player.home': return 'A home';
    case 'money.arc': return 'The savings book';
    case 'scenario.end': return 'The aim';
    case 'firm.layoffs': return 'Layoffs';
    case 'firm.cashCrunch': return 'A cash crunch';
    case 'firm.failed':
    case 'firm.default': return 'A failure';
    case 'law.verdict':
    case 'law.judgment': return 'The law';
    case 'health.injury': return 'An injury';
    case 'person.breakdown': return 'A breakdown';
    case 'property.repossess': return 'A repossession';
    case 'property.evict': return 'An eviction';
    default: return axis === 'money' ? 'Money' : axis === 'family' ? 'The family' : axis === 'health' ? 'Health' : 'Freedom';
  }
}

function houseIds(w: World, who: number, line: number[]): number[] {
  const P = econ(w).P;
  const out = new Set<number>();
  const add = (i: number): void => { if (i >= 0 && i < P.n) out.add(i); };
  for (const i of [who, ...line]) {
    add(i);
    if (i < 0 || i >= P.n) continue;
    add(P.spouse[i]);
    add(P.parent[i]);
    if (P.parent[i] >= 0) {
      add(P.spouse[P.parent[i]]);
      for (const sib of P.kids(P.parent[i])) add(sib);
    }
    const gp = P.parent[i] >= 0 ? P.parent[P.parent[i]] : -1;
    add(gp);
    for (const k of P.kids(i)) {
      add(k);
      for (const g of P.kids(k)) add(g);
    }
  }
  return [...out];
}

function controls(w: World, person: number, f: Firm): boolean {
  if (f.closed || person < 0) return false;
  if (f.ceo === person) return true;
  const issued = w.ledger.issued.get('eq:' + f.id) ?? 0;
  if (issued <= 0) return false;
  return w.ledger.balance(econ(w).P.id(person), 'eq:' + f.id) * 2 > issued;
}

function healthWord(n: number): string {
  if (n >= 80) return 'in good health';
  if (n >= 60) return 'in fair health';
  if (n >= 40) return 'unwell';
  return 'in poor health';
}

function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function third(reason: string, name: string): string {
  return reason
    .replace(/^You are /g, `${name} is `)
    .replace(/^You have not /g, `${name} did not `)
    .replace(/^You have /g, `${name} has `)
    .replace(/^You did not /g, `${name} did not `)
    .replace(/^You never /g, `${name} never `)
    .replace(/^You /g, `${name} `)
    .replace(/\byour\b/g, `${name}'s`)
    .replace(/\byou\b/g, name);
}

function beatFromEvent(w: World, e: Ev, ids: Set<string>, firms: Set<string>, names: string[], selfId: string): Beat | undefined {
  if (e.kind === 'player.scenario' || e.kind === 'news.story' || e.kind.startsWith('macro.')) return;
  const own = !!e.actor && ids.has(e.actor);
  const firm = !!e.actor && firms.has(e.actor);
  const named = names.some((n) => n.length > 3 && e.msg.includes(n));
  if (!own && !(firm && FIRM_KINDS.has(e.kind)) && !(named && (e.kind.startsWith('player.') || e.kind.startsWith('law.') || e.kind.startsWith('health.') || e.kind.startsWith('person.') || e.kind.startsWith('property.')))) return;
  if (firm && !own && !FIRM_KINDS.has(e.kind)) return;
  let axis = axisOf(e.kind);
  let weight = (BASE[e.kind] ?? 40_000) + dollarsMentioned(e.msg);
  const firmName = firm && e.actor ? nameOf(w)(e.actor) : undefined;
  const msg = soften(w, e.msg).replace(/\bbank_\d+\b/g, 'the bank');
  let title = titleOf(e.kind, axis);
  let text = `${when(e.day)}. ${sentence(msg)}`;
  if (e.kind === 'firm.layoffs' && firmName) text = `${when(e.day)}. ${firmName} laid off staff because sales were below plan.`;
  else if (e.kind === 'firm.cashCrunch' && firmName) text = `${when(e.day)}. ${firmName} ran short of cash and cut wages. ${sentence(msg)}`;
  else if (e.kind === 'loan.grant') {
    const sum = / of (\d+)/.exec(msg);
    const cents = sum ? Number(sum[1]) * 100 : 0;
    const told = msg.replace(/ of \d+/, sum ? ` of ${money(cents)}` : '');
    text = `${when(e.day)}. ${sentence(told)}`;
    title = /mortgage/.test(msg) ? 'A mortgage' : 'A loan';
    if (e.actor && e.actor !== selfId) { axis = 'family'; weight = Math.max(weight, cents); }
    else weight += cents;
  } else if (firm && firmName && !msg.includes(firmName)) text = `${when(e.day)}. ${firmName}. ${sentence(msg)}`;
  const people = names.filter((n) => text.includes(n)).slice(0, 6);
  const grouped = firmName && (e.kind === 'firm.layoffs' || e.kind === 'firm.cashCrunch');
  return {
    day: e.day,
    kind: e.kind,
    axis,
    weight,
    title,
    text,
    cause: causeParagraph(w.events.explain(e.id, 6).join('\n'), text),
    people,
    group: grouped ? `${e.kind}|${firmName}` : undefined,
    days: grouped ? [e.day] : undefined,
  };
}

function mergeRepeats(beats: Beat[]): Beat[] {
  const out: Beat[] = [];
  const grouped = new Map<string, Beat>();
  for (const b of beats) {
    if (!b.group) { out.push(b); continue; }
    const prev = grouped.get(b.group);
    if (!prev) {
      const copy = { ...b, days: b.days ? [...b.days] : undefined };
      grouped.set(b.group, copy);
      out.push(copy);
      continue;
    }
    prev.weight = Math.max(prev.weight, b.weight);
    if (b.days) prev.days = [...(prev.days ?? []), ...b.days];
    if ((b.cause?.length ?? 0) > (prev.cause?.length ?? 0)) prev.cause = b.cause;
  }
  for (const b of out) {
    if (!b.group || !b.days || b.days.length < 2) continue;
    const firm = b.group.split('|').slice(1).join('|');
    const times = [...new Set(b.days)].sort((a, c) => a - c).map((d) => when(d).replace(/^Year/, 'year'));
    b.day = Math.min(...b.days);
    const count = times.length === 2 ? 'twice' : `${times.length} times`;
    if (b.kind === 'firm.layoffs') b.text = `${firm} laid off staff ${count}, on ${joinAnd(times)}, because sales were below plan.`;
    else b.text = `${firm} ran short of cash ${count}, on ${joinAnd(times)}.`;
  }
  return out;
}

function pickBeats(beats: Beat[]): Beat[] {
  const ranked = [...beats].sort((a, b) => b.weight - a.weight || a.day - b.day);
  const picked: Beat[] = [];
  const seen = new Set<string>();
  const take = (b: Beat): void => {
    const key = `${b.kind}|${b.day}|${b.text.slice(0, 48)}`;
    if (seen.has(key) || picked.length >= 5) return;
    seen.add(key);
    picked.push(b);
  };
  const axes: Axis[] = ['money', 'family', 'health', 'freedom'];
  for (const axis of axes) {
    const best = ranked.find((b) => b.axis === axis);
    if (best) take(best);
  }
  for (const b of ranked) take(b);
  const last = (b: Beat): number => b.kind === 'scenario.end' ? 1 : 0;
  return picked.sort((a, b) => last(a) - last(b) || a.day - b.day || a.title.localeCompare(b.title));
}

function lifeBeats(w: World, who: number, ids: number[], worthNow: number): Beat[] {
  const s = econ(w), P = s.P, sc = sceneOf(w);
  const st = playerOf(w);
  const idSet = new Set(ids.filter((i) => i >= 0 && i < P.n).map((i) => P.id(i)));
  const names = ids.filter((i) => i >= 0 && i < P.n).map((i) => P.name(i));
  const employer = who >= 0 && who < P.n && P.employer[who] >= 0 ? s.firms[P.employer[who]] : undefined;
  const firmIds = new Set<string>();
  if (employer) firmIds.add(employer.id);
  for (const f of s.firms) if (ids.some((i) => i === f.founder || i === f.ceo || controls(w, i, f))) firmIds.add(f.id);
  const fromDay = sc?.begun ?? (who >= 0 && P.born[who] > 0 ? P.born[who] : 0);
  const beats: Beat[] = [];
  for (let id = w.events.count - 1; id >= 0; id--) {
    const e = w.events.get(id);
    if (!e) break;
    if (e.day < fromDay) break;
    const b = beatFromEvent(w, e, idSet, firmIds, names, who >= 0 ? P.id(who) : '');
    if (b && b.weight > 0) beats.push(b);
  }
  const h = w.state.history ? historyOf(w) : undefined;
  if (h) {
    for (const e of h.entries) {
      if (e.kind !== 'player' || e.day < fromDay) continue;
      if (!names.some((n) => e.people.includes(n) || e.text.includes(n))) continue;
      if (beats.some((b) => b.day === e.day && b.text.includes(e.text.slice(0, 24)))) continue;
      const axis: Axis = /marry|born|child|will|heir/i.test(e.text) ? 'family' : /health/i.test(e.text) ? 'health' : /retir|board|prison|convict|dies|died/i.test(e.text) ? 'freedom' : 'money';
      const text = `${when(e.day)}. ${soften(w, e.text)}`;
      beats.push({
        day: e.day, kind: 'history.player', axis, weight: 60_000 + dollarsMentioned(e.text),
        title: titleOf(axis === 'family' ? 'player.wed' : axis === 'health' ? 'player.health' : 'player.arrive', axis),
        text, cause: causeParagraph(e.cause, text), people: e.people,
      });
    }
  }
  const start = sc?.worthAtStart ?? worthNow;
  const delta = worthNow - start;
  if (Math.abs(delta) >= 100 && who >= 0) {
    const name = P.name(who);
    const begun = sc?.begun ?? (st?.arrived !== undefined && st.arrived >= 0 ? w.events.get(st.arrived)?.day ?? 0 : 0);
    const where = employer ? ` ${name} was at ${employer.name}.` : '';
    const text = `From ${when(begun).replace(/^Year/, 'year')} to ${when(w.day).replace(/^Year/, 'year')}, ${name}'s net worth moved from ${money(start)} to ${money(worthNow)}, ${delta >= 0 ? 'up' : 'down'} ${money(Math.abs(delta))}.${where}`;
    const causeId = st?.arrived !== undefined && st.arrived >= 0 ? st.arrived : s.wageEv;
    const raw = causeId >= 0 ? w.events.explain(causeId, 6).join('\n') : '';
    const pay = employer ? `The pay came from ${employer.name}.` : '';
    const chain = causeParagraph(raw, text);
    beats.push({
      day: w.day, kind: 'money.arc', axis: 'money', weight: Math.abs(delta),
      title: 'The savings book', text, cause: [pay, chain].filter(Boolean).join(' '), people: [name],
    });
  }
  if (sc?.outcome && who >= 0) {
    const name = P.name(who);
    const reason = third(sc.reason ?? '', name);
    const text = `${when(w.day)}. ${reason || (sc.outcome === 'win' ? `${name} met the aim.` : `${name} missed the aim.`)}`;
    const begun = when(sc.begun ?? 0);
    beats.push({
      day: w.day, kind: 'scenario.end', axis: sc.outcome === 'win' ? 'money' : 'freedom',
      weight: 2_000_000, title: 'The aim', text,
      cause: `This followed from the clock set when ${name} began ${sc.name ?? 'the scenario'} on ${begun}.`,
      people: [name],
    });
  }
  return pickBeats(mergeRepeats(beats));
}

function familyLines(w: World, ids: number[]): string[] {
  const P = econ(w).P;
  const lines = ['## The family', ''];
  const sorted = [...ids].sort((a, b) => P.born[a] - P.born[b] || a - b);
  if (!sorted.length) {
    lines.push('No one in the house is on the books.', '');
    return lines;
  }
  for (const i of sorted) {
    const born = P.born[i] < 0 ? 'before the founding' : `in ${when(P.born[i])}`;
    const bits = [`${P.name(i)} is born ${born}`];
    if (P.parent[i] >= 0 && P.parent[i] < P.n) {
      const a = P.parent[i];
      const b = P.spouse[a];
      bits.push(b >= 0 && b < P.n ? `child of ${P.name(a)} and ${P.name(b)}` : `child of ${P.name(a)}`);
    }
    const sp = P.spouse[i];
    if (sp >= 0 && sp < P.n) bits.push(sp > i ? `marries ${P.name(sp)}` : `spouse of ${P.name(sp)}`);
    const kids = P.kids(i);
    if (kids.length) bits.push(`parent of ${joinAnd(kids.map((k) => P.name(k)))}`);
    if ((P.flags[i] & PRISON) !== 0 && P.alive(i)) bits.push('in prison');
    else if (!P.alive(i)) bits.push('has died');
    else bits.push('still living');
    lines.push(`- ${bits.join(', ')}.`);
  }
  lines.push('');
  return lines;
}

function firmLines(w: World, ids: number[]): string[] {
  const P = econ(w).P;
  const lines = ['## Firms', ''];
  const rows: string[] = [];
  for (const f of econ(w).firms) {
    const founders = ids.filter((i) => i === f.founder);
    const chiefs = ids.filter((i) => !f.closed && i === f.ceo);
    const holders = ids.filter((i) => controls(w, i, f) && i !== f.ceo);
    if (!founders.length && !chiefs.length && !holders.length) continue;
    const who = founders[0] ?? chiefs[0] ?? holders[0];
    const how = [
      founders.length ? `founded ${f.name}` : '',
      chiefs.length ? `ran ${f.name} as chief` : '',
      holders.length ? `held control of ${f.name}` : '',
    ].filter(Boolean);
    const good = GOODS[f.good]?.name ?? f.good;
    const closed = f.closed ? ' The firm has closed.' : '';
    rows.push(`- ${P.name(who)} ${joinAnd(how)}, which makes ${good}.${closed}`);
  }
  if (!rows.length) lines.push('The house founded no firm and controlled none.', '');
  else lines.push(...rows, '');
  return lines;
}

function cityLines(w: World, fromDay: number): string[] {
  if (!w.state.history) return [];
  const h = historyOf(w);
  const fromYear = Math.floor(Math.max(0, fromDay) / 360) + 1;
  const toYear = Math.floor(w.day / 360) + 1;
  const lines = ['## The city during this life', ''];
  const mine = h.entries.filter((e) => e.kind !== 'player' && e.year >= fromYear && e.year <= toYear);
  if (!mine.length) {
    lines.push('The city kept no larger story in these years.', '');
    return lines;
  }
  const byDecade = new Map<number, Entry[]>();
  for (const e of mine) {
    const d = Math.floor((e.year - 1) / 10);
    const list = byDecade.get(d);
    if (list) list.push(e);
    else byDecade.set(d, [e]);
  }
  for (const d of [...byDecade.keys()].sort((a, b) => a - b)) {
    const list = byDecade.get(d) ?? [];
    const a = d * 10 + 1;
    const b = Math.min(a + 9, toYear);
    lines.push(`### Years ${a}–${b}`, '');
    lines.push(...storyLines(biggestStories(list, 3), list));
  }
  return lines;
}

export function playerChronicle(w: World, worthNow: number): { markdown: string; text: string } {
  const s = econ(w), P = s.P;
  const st = playerOf(w);
  const sc = sceneOf(w);
  const who = st?.who ?? -1;
  if (who < 0 || who >= P.n) {
    const markdown = '# A life\n\nNo player is on the books.\n';
    return { markdown, text: plainText(markdown) };
  }
  const ids = houseIds(w, who, st?.line ?? []);
  const name = P.name(who);
  const employer = P.employer[who] >= 0 ? s.firms[P.employer[who]] : undefined;
  const lines: string[] = [`# ${name}`, ''];
  if (sc?.name) lines.push(`${sc.name}. Seed ${w.seed}.`, '');
  else lines.push(`A life in Port Avalon. Seed ${w.seed}.`, '');
  for (const bit of sc?.story ?? []) lines.push(third(bit, name), '');
  const job = employer ? `works at ${employer.name}` : (P.retired(who) ? 'has retired' : 'has no job');
  const held = (P.flags[who] & PRISON) !== 0 ? ', and is in prison' : '';
  lines.push(`${name} is ${P.age(w, who)}, of the ${P.families[P.family[who]]} family, ${healthWord(P.health[who])}, and ${job}${held}. Net worth at the end of this account: ${money(worthNow)}. Cash on the book: ${money(Math.floor(w.ledger.balance(P.id(who), DEP)))}.`, '');
  if (sc?.outcome) {
    const word = sc.outcome === 'win' ? 'The aim was met.' : 'The aim was missed.';
    lines.push(`${word} ${third(sc.reason ?? '', name)}`, '');
  }
  if (st?.final && !sc?.outcome) lines.push(st.final, '');
  const beats = lifeBeats(w, who, ids, worthNow);
  lines.push('## What mattered', '');
  if (!beats.length) lines.push('Nothing in the book moved this life enough to tell.', '');
  beats.forEach((b, n) => {
    lines.push(`### ${n + 1}. ${b.title}`, '');
    lines.push(b.text, '');
    if (b.people.length) lines.push(`People: ${joinAnd([...new Set(b.people)])}.`);
    if (b.cause) lines.push('', b.cause);
    lines.push('');
  });
  lines.push(...familyLines(w, ids));
  lines.push(...firmLines(w, ids));
  const fromDay = sc?.begun ?? (P.born[who] > 0 ? P.born[who] : 0);
  lines.push(...cityLines(w, fromDay));
  const markdown = `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
  return { markdown, text: plainText(markdown) };
}

export function writePlayerChronicle(w: World, worthNow: number, dir: string): { markdown: string; text: string } {
  const story = playerChronicle(w, worthNow);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'chronicle.md'), story.markdown);
  fs.writeFileSync(path.join(dir, 'chronicle.txt'), story.text);
  return story;
}
