// The daily papers. The Daily Herald comes out each morning with the business and the city's affairs; the Evening Gazette
// comes out each evening with people, society and the courts. Each edition is built from what really happened since the
// last one: results, hires and cuts (by firm, with the pay), the markets, the bank, deals, promotions, scandals, the port.
// Coin launches are a column, never a story. Every story keeps the ids of the events behind it.
import { moveReason } from '../markets/index.ts';
import type { World } from '../../kernel/index.ts';
import { curveShape } from '../bonds/index.ts';
import { tradingDay } from '../markets/noise.ts';
import type { EconState, Firm } from '../economy/index.ts';
import { CITY, money, sectorWord } from '../social/words.ts';
import { firmGap } from '../careers/jobs.ts';
import { nightOut } from '../venues/world.ts';

export interface Story {
  id: number; section: string; kicker: string; headline: string; body: string;
  names: string[]; firms: string[]; eventIds: number[]; score: number; you: boolean;
}
export interface Edition {
  id: number; day: number; outletId: string; outlet: string; edition: 'morning' | 'evening'; minute: number;
  headline: string; stories: Story[]; column: { title: string; lines: string[] } | null; eventId: number;
}
interface Hist { day: number; n: number[] }
interface Desk {
  editions: Edition[]; cursor: number; hist: Hist[]; seq: number; printed: Record<string, number>;
}
interface Ev { id: number; day: number; kind: string; actor?: string; msg: string; causes: number[] }
interface OutletRow { id: string; name: string; journalists: number[] }

const econ = (w: World): EconState => w.state.economy as EconState;
function desk(w: World): Desk {
  const b = w.state.media as { paper?: Desk };
  if (!b.paper) b.paper = { editions: [], cursor: -1, hist: [], seq: 1, printed: {} };
  return b.paper;
}
function mix(a: number, b: number, c = 0): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}
const pick = <T>(list: T[], salt: number): T => list[salt % list.length];
function playerIndex(w: World): number {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { who?: number }>; who?: number } | undefined;
  if (!st) return -1;
  const key = st.ids?.[0];
  const who = (key && st.seat?.[key]?.who) ?? st.who ?? -1;
  return typeof who === 'number' ? who : -1;
}
function firmOf(w: World, actor: string | undefined): Firm | undefined {
  if (!actor) return undefined;
  for (const f of econ(w).firms) if (f.id === actor) return f;
  return undefined;
}
function firmNamed(w: World, name: string): Firm | undefined {
  for (const f of econ(w).firms) if (f.name === name) return f;
  return undefined;
}
function personName(w: World, actor: string | undefined): string {
  if (!actor || !actor.startsWith('p_')) return '';
  const n = +actor.slice(2);
  const P = econ(w).P;
  return Number.isInteger(n) && n >= 0 && n < P.n ? P.name(n) : '';
}
function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function an(word: string): string { return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`; }
function nWord(n: number, one: string, many: string): string { return `${n} ${n === 1 ? one : many}`; }

/** What a firm pays an average hand a week: the national wage, the average skill on its floor and its house rate. */
function weeklyPay(w: World, f: Firm): number {
  const s = econ(w);
  const n = f.staff.length;
  if (!n) return 0;
  const prem = (w.state.labour as { prem?: ArrayLike<number> } | undefined)?.prem;
  const m = prem && f.idx < prem.length && prem[f.idx] > 0 ? prem[f.idx] : 1;
  return Math.round((f.eff / n) * s.wage * 7 * m);
}

function firmGapOf(w: World, f: Firm): number { return firmGap(w, f); }

function story(part: Partial<Story> & { section: string; headline: string; eventIds: number[] }): Story {
  return {
    id: 0, kicker: '', body: '', names: [], firms: [], score: 50, you: false,
    ...part,
  };
}

// ---------------------------------------------------------------- builders

function parseCents(token: string): number {
  const m = /^(-?)\$?(-?)([\d,]+(?:\.\d+)?)([kMB]?)$/.exec(token.trim());
  if (!m) return 0;
  const sign = m[1] || m[2] ? -1 : 1;
  const mult = m[4] === 'k' ? 1e3 : m[4] === 'M' ? 1e6 : m[4] === 'B' ? 1e9 : 1;
  return sign * Math.round(parseFloat(m[3].replace(/,/g, '')) * mult * 100);
}

function earnings(w: World, e: Ev): Story | null {
  const f = firmOf(w, e.actor);
  if (!f) return null;
  const rev = /revenue (\S+?),/.exec(e.msg)?.[1] ?? '';
  const profit = /profit (-?\$?-?[\d.,]+[kMB]?),/.exec(e.msg)?.[1] ?? '';
  const eps = /EPS (-?\$?-?[\d.,]+)/.exec(e.msg)?.[1] ?? '';
  const verdict = /\((beat|miss|met|in line)\s*([+-]?[\d.]+)?%?\)/.exec(e.msg);
  const guide = /guides (\S+) next quarter/.exec(e.msg)?.[1] ?? '';
  const pct = verdict?.[2] ? Math.abs(Number(verdict[2])) : 0;
  const word = verdict?.[1] === 'beat' ? 'beat' : verdict?.[1] === 'miss' ? 'missed' : 'met';
  const loss = parseCents(profit) < 0;
  const salt = mix(e.id, 5);
  const trade = sectorWord(f.sector);
  const head = word === 'beat'
    ? pick([`${f.name} beats the street`, `${f.name} clears the bar`, `${f.name} reports a stronger quarter than expected`], salt)
    : word === 'missed'
      ? pick([`${f.name} misses the street`, `${f.name} falls short of the number`, `${f.name} disappoints with its quarter`], salt)
      : `${f.name} reports in line`;
  const ceo = f.ceo >= 0 ? personName(w, econ(w).P.id(f.ceo)) : '';
  const body = [
    `${loss ? 'A loss of' : 'Profit of'} ${profit.replace('-', '')} on ${rev} of sales${eps ? `, ${eps} a share` : ''}${pct ? `, ${pct.toFixed(1)}% ${word === 'beat' ? 'above' : word === 'missed' ? 'below' : 'off'} what the street expected` : ''}.`,
    guide ? `The ${trade} firm guides to ${guide} next quarter.` : '',
    ceo ? `${ceo} holds the chief's seat.` : '',
  ].filter(Boolean).join(' ');
  return story({
    section: 'companies', kicker: 'Results', headline: head, body, firms: [f.name], names: ceo ? [ceo] : [],
    eventIds: [e.id], score: 70 + Math.min(14, pct / 2) + (f.listed ? 4 : 0),
  });
}

function marketMove(w: World, e: Ev): Story | null {
  const m = /close (\d+) -> (\d+) \(([+-]?[\d.]+)%\)/.exec(e.msg);
  if (!m) return null;
  const pct = Number(m[3]);
  if (Math.abs(pct) < 4) return null;
  const instr = /^eq:(\S+)/.exec(e.msg)?.[1] ?? '';
  const f = firmOf(w, instr) ?? firmOf(w, e.actor);
  const name = f?.name ?? (instr === 'bank_1' ? 'the bank' : '');
  if (!name) return null;
  const up = pct > 0;
  const head = up ? `${cap(name)} shares jump ${Math.abs(pct).toFixed(1)}%` : `${cap(name)} shares drop ${Math.abs(pct).toFixed(1)}%`;
  return story({
    section: 'markets', kicker: 'Markets', headline: head,
    body: `The stock closed at ${money(Number(m[2]))}, from ${money(Number(m[1]))} the day before.`,
    firms: [name], eventIds: [e.id], score: 48 + Math.min(26, Math.abs(pct)),
  });
}

function rateMove(w: World, e: Ev): Story | null {
  const m = /policy rate ([\d.]+)% -> ([\d.]+)%/.exec(e.msg) ?? /policy rate held at ([\d.]+)%/.exec(e.msg);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2] ?? m[1]);
  const who = personName(w, e.actor);
  const s = econ(w);
  const verb = b > a ? 'raises' : b < a ? 'cuts' : 'holds';
  const last = s.cbLast && s.cbLast.ev === e.id ? s.cbLast : undefined;
  const exp = last ? (Math.abs(last.expect - last.to) < 1e-6 ? ' The market had expected it.' : ` The market had expected ${(last.expect * 100).toFixed(2)}%, so the decision was a surprise.`) : '';
  const idx = (w.state.markets as { index?: number; stocks?: unknown[] } | undefined)?.index;
  return story({
    section: 'bank', kicker: 'The bank', headline: verb === 'holds' ? `The central bank holds its rate at ${b.toFixed(2)}%` : `The central bank ${verb} its rate to ${b.toFixed(2)}%`,
    body: `${verb === 'holds' ? `The policy rate stays at ${a.toFixed(2)}%.` : `The policy rate was ${a.toFixed(2)}%.`} The decision came at 14:00.${exp} Unemployment stands at ${(s.unemployment * 100).toFixed(1)}%${who ? `, and ${who} signed the decision` : ''}.${idx ? ` The index closed at ${idx.toFixed(1)}.` : ''}`,
    eventIds: [e.id], names: who ? [who] : [], score: 86,
  });
}

/** The morning of a meeting: what the bank is expected to do, and when. */
function ratePreview(w: World): Story | null {
  const next = econ(w).cbNext;
  if (!next || next.day !== w.day + 1) return null;
  const pct = (r: number): string => (r * 100).toFixed(2);
  const move = Math.round((next.expect - next.from) * 10000);
  const want = move === 0 ? `to hold at ${pct(next.from)}%` : `a ${Math.abs(move)} basis point ${move > 0 ? 'hike' : 'cut'}, to ${pct(next.expect)}%`;
  const ids = next.causes.length ? next.causes.slice(0, 2) : [econ(w).rateEv];
  return story({
    section: 'bank', kicker: 'Rate day', headline: `The central bank decides at 14:00 today; the market expects ${want}`,
    body: `The policy rate is ${pct(next.from)}%. Unemployment is ${(econ(w).unemployment * 100).toFixed(1)}%. A surprise moves shares that live on credit most: builders, furniture, cars. The decision goes on the wire at 14:00.`,
    eventIds: ids, names: [], score: 95,
  });
}

function spreadMove(e: Ev): Story | null {
  const m = /BBB spread (\d+)bp -> (\d+)bp/.exec(e.msg);
  if (!m || Math.abs(+m[2] - +m[1]) < 15) return null;
  const wider = +m[2] > +m[1];
  return story({
    section: 'bank', kicker: 'Credit', headline: wider ? 'Lending to firms gets dearer' : 'Credit eases for firms',
    body: `A firm with a middling credit pays ${m[2]} basis points over the government now, from ${m[1]}.`,
    eventIds: [e.id], score: 58,
  });
}

function peopleMoves(w: World, e: Ev): Story | null {
  const m = /^(.+?) is promoted from (.+?) to (.+?) at (.+)$/.exec(e.msg);
  if (!m) return null;
  return story({
    section: 'people', kicker: 'Promoted', headline: `${m[1]} moves up at ${m[4]}`,
    body: `${m[1]} goes from ${m[2]} to ${m[3]} at ${m[4]}.`, names: [m[1]], firms: [m[4]], eventIds: [e.id], score: 44,
  });
}

function chiefNews(w: World, e: Ev): Story | null {
  const f = firmOf(w, e.actor);
  const name = f?.name ?? '';
  if (e.kind === 'firm.ceoFired') {
    const who = /^(.+?) removed/.exec(e.msg)?.[1] ?? '';
    const months = /after (\d+) losing months/.exec(e.msg)?.[1] ?? '';
    return story({
      section: 'companies', kicker: 'The seat', headline: `${name || 'A firm'} removes its chief`,
      body: `${who ? `${who} is out` : 'The chief is out'}${months ? ` after ${months} losing months` : ''}.`,
      names: who ? [who] : [], firms: name ? [name] : [], eventIds: [e.id], score: 72,
    });
  }
  if (e.kind === 'firm.succession') {
    const who = /^(.+?) \(\d+\) becomes chief executive of (.+?),/.exec(e.msg);
    if (!who) return null;
    return story({
      section: 'companies', kicker: 'The seat', headline: `${who[1]} takes over at ${who[2]}`,
      body: e.msg.replace(/\(\d+\)\s/, ''), names: [who[1]], firms: [who[2]], eventIds: [e.id], score: 56,
    });
  }
  if (e.kind === 'firm.founded') {
    return story({ section: 'companies', kicker: 'New firm', headline: e.msg.replace(/^(.+?) founds (.+?),.*$/, '$1 founds $2'), body: e.msg + '.', eventIds: [e.id], score: 60 });
  }
  if (e.kind === 'firm.default' || e.kind === 'bond.default') {
    return story({
      section: 'bank', kicker: 'Default', headline: `${name || e.msg.replace(/ bond defaults.*/, '')} cannot service its debt`,
      body: e.msg.replace(/^could not service debt; /, 'The bank '), firms: name ? [name] : [], eventIds: [e.id], score: 84,
    });
  }
  if (e.kind === 'firm.split') {
    return story({ section: 'markets', kicker: 'Shares', headline: e.msg.replace(/ because.*$/, ''), body: `${e.msg}.`, eventIds: [e.id], score: 52 });
  }
  return null;
}

function trouble(w: World, e: Ev): Story | null {
  if (e.kind === 'energy.outage') {
    const m = /^(.+?) (\w+) plant at (.+?) is down for (\d+) days/.exec(e.msg);
    return story({
      section: 'industry', kicker: 'Power', headline: m ? `${m[1] === m[3] ? m[1] : `${m[1]} at ${m[3]}`} loses its ${m[2]} plant for ${m[4]} days` : cap(e.msg),
      body: `${m ? `The ${m[2]} plant${m[1] === m[3] ? ` at ${m[1]}` : ` at ${m[3]}`} is out of service for ${m[4]} days` : cap(e.msg)}. The grid leans on other plants meanwhile and wholesale power ${(w.state.energy as { price?: number } | undefined)?.price ? 'is dearer' : 'is watched closely'}.`,
      eventIds: [e.id], score: 55,
    });
  }
  if (e.kind === 'firm.stockout' || e.kind === 'firm.inputShort') {
    const f = firmOf(w, e.actor);
    if (!f) return null;
    return story({
      section: 'industry', kicker: 'Supply', headline: e.kind === 'firm.stockout' ? `${f.name} sells out` : `${f.name} cannot find its inputs`,
      body: e.kind === 'firm.stockout' ? `The ${sectorWord(f.sector)} firm ran out of ${e.msg.replace(/^sold out of /, '').replace(/; demand unmet/, '')} and turned customers away.` : `The ${sectorWord(f.sector)} firm ${e.msg.replace(/^could not/i, "could not").replace(/; output cut.?$/, "")}, so it made less this week.`,
      firms: [f.name], eventIds: [e.id], score: 46,
    });
  }
  if (e.kind === 'futures.move') {
    return story({ section: 'markets', kicker: 'Commodities', headline: cap(e.msg.replace(/ \(.*$/, '')), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 50 });
  }
  if (e.kind.startsWith('shock.')) {
    return story({ section: 'city', kicker: CITY, headline: cap(e.msg.split(':')[0]).slice(0, 110), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 78 });
  }
  if (e.kind === 'health.quarantine' || e.kind === 'health.arrive') {
    return story({ section: 'city', kicker: 'Health', headline: cap(e.msg).slice(0, 110), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 80 });
  }
  if (e.kind.startsWith('port.') && e.kind !== 'port.open' && e.kind !== 'port.tariff') {
    return story({ section: 'port', kicker: 'The quay', headline: cap(e.msg).slice(0, 110), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 62 });
  }
  return null;
}

function courts(w: World, e: Ev): Story | null {
  if (!e.kind.startsWith('law.') && e.kind !== 'crime.arrest' && !e.kind.startsWith('court.')) return null;
  if (e.kind === 'law.budget' || e.kind === 'law.trade' || e.kind === 'law.offence' || e.kind === 'law.investigation') return null;
  const who = personName(w, e.actor);
  return story({
    section: 'courts', kicker: e.kind === 'law.verdict' ? 'Verdict' : e.kind === 'law.charge' ? 'Charged' : e.kind === 'law.judgment' ? 'Cleared' : 'In court',
    headline: cap(e.msg.replace(/\.\s.*$/, '')).slice(0, 120), body: `${cap(e.msg)}.`,
    names: who ? [who] : [], eventIds: [e.id], score: 80, you: who !== '' && who === personName(w, econ(w).P.id(Math.max(0, playerIndex(w)))),
  });
}

function politics(e: Ev): Story | null {
  if (!e.kind.startsWith('politics.') || e.kind === 'politics.donation') return null;
  if (e.kind === 'politics.government' && /stays in office/.test(e.msg)) return null;
  return story({ section: 'politics', kicker: 'Politics', headline: cap(e.msg.replace(/\.\s.*$/, '')).slice(0, 120), body: `${cap(e.msg)}.`, eventIds: [e.id], score: e.kind === 'politics.subsidy' ? 48 : 70 });
}

function fortunes(e: Ev): Story | null {
  const m = /^(.+?) (gained|lost) (\$[\d.,]+(?: million| billion)?) in a month, on (.+)$/.exec(e.msg);
  if (!m) return null;
  const up = m[2] === 'gained';
  const on = m[4];
  return story({
    section: 'society', kicker: up ? 'Fortunes' : 'Losses', headline: up ? `${m[1]} adds ${m[3]} in a month` : `${m[1]} is ${m[3]} poorer for the month`,
    body: up ? `${m[1]}'s gain came ${on.startsWith('saved') ? 'from' : 'on'} ${on}.` : `The loss came ${on.startsWith('saved') ? 'from' : 'on'} ${on}.`,
    names: [m[1]], eventIds: [e.id], score: up ? 52 : 58,
  });
}

function socialPage(w: World, e: Ev): Story | null {
  if (e.kind === 'society.held' || e.kind === 'society.gala' || e.kind === 'society.festival' || e.kind === 'society.meet' || e.kind === 'society.plan') {
    const head = cap(e.msg.split('.')[0]);
    return story({ section: 'society', kicker: 'Society', headline: head.slice(0, 110), body: `${cap(e.msg.replace(/ You (are invited|went|stayed away)\.?/g, ''))}`.slice(0, 300), eventIds: [e.id], score: 54 });
  }
  if (e.kind === 'society.holiday') return story({ section: 'city', kicker: CITY, headline: cap(e.msg.split('.')[0]), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 40 });
  if (e.kind === 'person.died') {
    const m = /^(.+?) died aged (\d+)/.exec(e.msg);
    if (!m || +m[2] < 40) return null;
    return story({ section: 'people', kicker: 'Obituary', headline: `${m[1]} dies at ${m[2]}`, body: `${cap(e.msg)}.`, names: [m[1]], eventIds: [e.id], score: 50 });
  }
  if (e.kind === 'circle.held') {
    const me = playerIndex(w);
    const name = me >= 0 ? econ(w).P.name(me) : '';
    if (!name || !e.msg.includes(name)) return null;
    return story({ section: 'society', kicker: 'About town', headline: e.msg.split('. ')[0].slice(0, 120), body: e.msg, names: [name], eventIds: [e.id], score: 66, you: true });
  }
  return null;
}

function streets(w: World, evs: Ev[]): Story | null {
  const rows = evs.filter((e) => e.kind === 'property.evict');
  if (!rows.length) return null;
  const where = new Map<string, number>();
  for (const e of rows) {
    const d = /evicted in (.+)$/.exec(e.msg)?.[1];
    if (d) where.set(d, (where.get(d) ?? 0) + 1);
  }
  const top = [...where.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (!top.length) return null;
  const first = /^(.+?) is evicted/.exec(rows[0].msg)?.[1] ?? '';
  return story({
    section: 'streets', kicker: 'Rent', headline: `${nWord(rows.length, 'household', 'households')} evicted for unpaid rent`,
    body: `${top.map(([d, n]) => `${n} in ${d}`).join(' and ')}${first ? `, among them ${first}` : ''}. The landlords were owed more than the rooms could earn.`,
    names: first ? [first] : [], eventIds: rows.slice(0, 5).map((r) => r.id), score: 50,
  });
}

function propertyPage(w: World, evs: Ev[]): Story | null {
  let best: { name: string; price: number; where: string; e: Ev } | null = null;
  for (const e of evs) {
    if (e.kind !== 'property.sale') continue;
    const m = /^(.+?) pays (\$[\d,.]+) for an? (.+?) home$/.exec(e.msg);
    if (!m || m[1].startsWith('fund_')) continue;
    const price = parseCents(m[2]);
    if (!best || price > best.price) best = { name: m[1], price, where: m[3], e };
  }
  if (!best) return null;
  return story({
    section: 'property', kicker: 'Property', headline: `${best.name} buys in ${best.where}`,
    body: `The sale went through at ${money(best.price)}, the dearest private sale in ${CITY} that day.`,
    names: [best.name], eventIds: [best.e.id], score: 47,
  });
}

function cryptoColumn(evs: Ev[]): { title: string; lines: string[] } | null {
  const launches = evs.filter((e) => e.kind === 'crypto.launch');
  const rugs = evs.filter((e) => e.kind === 'crypto.rug');
  const manias = evs.filter((e) => e.kind === 'crypto.mania');
  const crashes = evs.filter((e) => e.kind === 'crypto.crash');
  if (!launches.length && !rugs.length && !manias.length && !crashes.length) return null;
  const lines: string[] = [];
  if (launches.length) {
    const named = launches.slice(0, 3).map((e) => /launched (.+? \(\w+\))/.exec(e.msg)?.[1]).filter(Boolean);
    lines.push(`${nWord(launches.length, 'new coin', 'new coins')} launched${named.length ? `, among them ${named.join(', ')}` : ''}.`);
  }
  for (const e of manias.slice(0, 2)) lines.push(cap(e.msg) + '.');
  for (const e of rugs.slice(0, 2)) lines.push(cap(e.msg) + '.');
  for (const e of crashes.slice(0, 1)) lines.push(cap(e.msg) + '.');
  return { title: 'The Launchpad', lines };
}

// ---------------------------------------------------------------- hires and cuts

function snapshot(w: World, d: Desk): void {
  const n = econ(w).firms.map((f) => f.staff.length);
  const last = d.hist[d.hist.length - 1];
  if (last && last.day === w.day) return;
  d.hist.push({ day: w.day, n });
  if (d.hist.length > 8) d.hist.shift();
}

function lastLayoffReason(w: World, f: Firm, evs: Ev[]): { text: string; id: number } {
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.actor !== f.id) continue;
    if (e.kind === 'firm.layoffs') return { text: e.msg.replace(/: laying off staff.*$/, '').replace(/^sales of (.+) below plan$/, 'sales of $1 ran below plan'), id: e.id };
    if (e.kind === 'firm.cashCrunch') return { text: 'the till could not cover the wage bill', id: e.id };
  }
  return { text: '', id: -1 };
}

function jobsStories(w: World, d: Desk, evs: Ev[]): Story[] {
  const out: Story[] = [];
  const old = d.hist.length >= 2 ? d.hist[0] : undefined;
  if (!old) return out;
  const s = econ(w);
  const rows: { f: Firm; was: number; now: number }[] = [];
  for (const f of s.firms) {
    if (f.closed || f.idx >= old.n.length) continue;
    const was = old.n[f.idx], now = f.staff.length;
    if (was >= 8 && Math.abs(now - was) >= Math.max(2, Math.ceil(was * 0.015))) rows.push({ f, was, now });
  }
  const cuts = rows.filter((r) => r.now < r.was).sort((a, b) => (a.now - a.was) - (b.now - b.was));
  const adds = rows.filter((r) => r.now > r.was).sort((a, b) => (b.now - b.was) - (a.now - a.was));
  for (const r of cuts.slice(0, 2)) {
    if (d.printed['cut:' + r.f.id] !== undefined && w.day - d.printed['cut:' + r.f.id] < 14) continue;
    d.printed['cut:' + r.f.id] = w.day;
    const why = lastLayoffReason(w, r.f, evs);
    const lost = r.was - r.now;
    const pay = weeklyPay(w, r.f);
    out.push(story({
      section: 'labour', kicker: 'Jobs',
      headline: pick([`${r.f.name} cuts ${lost} jobs`, `${r.f.name} sheds ${lost} workers`, `${lost} fewer people at ${r.f.name}`], mix(r.f.idx, w.day)),
      body: `The ${sectorWord(r.f.sector)} firm is down to ${r.now} on the payroll from ${r.was} a week ago${why.text ? `: ${why.text}` : ''}. It pays about ${money(pay)} a week on average.`,
      firms: [r.f.name], eventIds: why.id >= 0 ? [why.id] : [], score: 58 + Math.min(16, lost),
    }));
  }
  for (const r of adds.slice(0, 2)) {
    if (d.printed['add:' + r.f.id] !== undefined && w.day - d.printed['add:' + r.f.id] < 14) continue;
    d.printed['add:' + r.f.id] = w.day;
    const gained = r.now - r.was;
    const pay = weeklyPay(w, r.f);
    out.push(story({
      section: 'labour', kicker: 'Hiring',
      headline: pick([`${r.f.name} takes on ${gained}`, `${r.f.name} is hiring: ${gained} more hands`, `${gained} new jobs at ${r.f.name}`], mix(r.f.idx, w.day, 2)),
      body: `The ${sectorWord(r.f.sector)} firm now has ${r.now} people, up from ${r.was}. Pay averages about ${money(pay)} a week.`,
      firms: [r.f.name], eventIds: [], score: 56 + Math.min(14, gained),
    }));
  }
  return out;
}

// ---------------------------------------------------------------- fillers from the state of the city

function numbers(w: World): Story {
  const s = econ(w);
  const hiring: { name: string; gap: number }[] = [];
  const ind = (w.state.markets as { index?: number } | undefined)?.index;
  void ind;
  const rows = s.firms.filter((f) => !f.closed && f.staff.length >= 8);
  rows.sort((a, b) => b.workers - a.workers);
  void hiring;
  const rate = s.policyRate * 100;
  return story({
    section: 'economy', kicker: 'The numbers', headline: `Unemployment ${(s.unemployment * 100).toFixed(1)}%, policy rate ${rate.toFixed(2)}%`,
    body: `The city wage is ${money(s.wage)} a day and the central bank's rate stands at ${rate.toFixed(2)}%.`,
    eventIds: [s.macroEv >= 0 ? s.macroEv : w.genesis], score: 30,
  });
}

function quayFiller(w: World): Story | null {
  const p = w.state.port as { name?: string; berthed?: number; closedUntil?: number; berths?: number; ships?: { name: string; way: string; eta: number }[]; root?: number } | undefined;
  if (!p?.ships) return null;
  const inbound = p.ships.filter((x) => x.way === 'in').sort((a, b) => a.eta - b.eta);
  const closed = (p.closedUntil ?? 0) > w.day;
  const next = inbound[0];
  return story({
    section: 'port', kicker: 'The quay',
    headline: closed ? `${p.name ?? CITY} stays shut to ships` : `${nWord(p.berthed ?? 0, 'ship is', 'ships are')} alongside at ${p.name ?? 'the port'}`,
    body: closed ? `The harbour reopens on day ${p.closedUntil}.` : `${next ? `${next.name} is due in ${Math.max(0, next.eta - w.day)} ${next.eta - w.day === 1 ? 'day' : 'days'}.` : 'Nothing is due in the next few days.'} The cranes are working ${p.berths ?? 0} berths.`,
    eventIds: [p.root ?? w.genesis], score: 36,
  });
}

function hiringFiller(w: World): Story | null {
  const s = econ(w);
  const rows = s.firms.filter((f) => !f.closed && f.staff.length >= 8 && f.eff > 0).map((f) => ({ f, pay: weeklyPay(w, f) })).sort((a, b) => b.pay - a.pay);
  if (rows.length < 3) return null;
  const hi = rows[0], lo = rows[rows.length - 1];
  return story({
    section: 'labour', kicker: 'Pay', headline: `${hi.f.name} pays best: about ${money(hi.pay)} a week`,
    body: `At the other end, ${lo.f.name} averages ${money(lo.pay)}. Firms pay what a hand earns for them and how their last month went, so the same job is worth less where sales are thin.`,
    firms: [hi.f.name, lo.f.name], eventIds: [s.macroEv >= 0 ? s.macroEv : w.genesis], score: 32,
  });
}

function richFiller(w: World, shift = 0): Story | null {
  const soc = w.state.society as { rich?: { person: number; worth: number; change: number; why?: string; eventId: number }[] } | undefined;
  const rows = (soc?.rich ?? []).slice(0, 6);
  if (!rows.length) return null;
  const P = econ(w).P;
  const k = (mix(w.day, 77) + shift) % rows.length;
  const top = rows[k];
  const name = P.name(top.person);
  const rose = top.change > 0;
  const e = P.employer[top.person];
  const firm = e >= 0 ? econ(w).firms[e] : undefined;
  return story({
    section: 'society', kicker: 'The list', headline: k === 0 ? `${name} still tops the rich list` : `${name}, number ${k + 1} on the rich list`,
    body: `${name}${firm ? `, ${firm.ceo === top.person ? 'who runs' : 'of'} ${firm.name},` : ''} is worth ${money(top.worth)}, ${rose ? 'up' : 'down'} ${money(Math.abs(top.change))} on the month${top.why ? `: ${top.why}` : ''}.`,
    names: [name], firms: firm ? [firm.name] : [], eventIds: [top.eventId >= 0 ? top.eventId : w.genesis], score: 34,
  });
}

function townFiller(w: World): Story | null {
  const cal = w.state.society as { dates?: { day: number; kind: string; title: string; status: string; eventId: number }[] } | undefined;
  const next = (cal?.dates ?? []).filter((x) => x.day >= w.day && x.day < w.day + 10 && x.status !== 'gone').sort((a, b) => a.day - b.day)[0];
  if (!next) return null;
  const left = next.day - w.day;
  return story({
    section: 'society', kicker: 'Next up', headline: cap(next.title.replace(/ You are invited\.?/, '').split('.')[0]).slice(0, 110),
    body: `${left <= 0 ? 'Tonight.' : left === 1 ? 'Tomorrow.' : `In ${left} days.`} ${cap(next.title.replace(/ You are invited\.?/, ''))}`.slice(0, 300),
    eventIds: [next.eventId >= 0 ? next.eventId : w.genesis], score: 33,
  });
}

/** The events behind one stock's own close, never the latest move of some other name. */
function ownMove(w: World, x: { issuer: string; moveEv?: number }): number[] {
  const ev = x.moveEv !== undefined && x.moveEv >= 0 ? w.events.get(x.moveEv) : undefined;
  if (ev && w.day - ev.day <= 1 && (ev.actor === x.issuer || ev.causes.length)) return [ev.id];
  const why = moveReason(w, x.issuer);
  return why.length ? why : [w.genesis];
}

function movers(w: World): Story[] {
  if (!tradingDay(w.day)) return [];
  const stocks = (w.state.markets as { stocks?: { instr: string; issuer: string; last: number; prev: number; moveEv?: number; hist?: { c: number; v: number; src?: string }[] }[] } | undefined)?.stocks ?? [];
  const rows = stocks.filter((x) => {
    const bar = x.hist?.[x.hist.length - 1];
    return x.prev > 0 && x.last > 0 && x.issuer !== 'bank_1' && bar && bar.v > 0 && bar.src !== 'indicative';
  }).map((x) => ({ x, pct: (x.last / x.prev - 1) * 100, f: firmOf(w, x.issuer) })).filter((r) => r.f);
  rows.sort((a, b) => b.pct - a.pct);
  const out: Story[] = [];
  const up = rows[0], down = rows[rows.length - 1];
  if (up && up.pct >= 1.5) out.push(story({ section: 'markets', kicker: 'Markets', headline: `${up.f!.name} leads the board, up ${up.pct.toFixed(1)}%`, body: `The shares closed at ${money(up.x.last)}. ${up.f!.name} is the ${sectorWord(up.f!.sector)} firm with ${up.f!.staff.length} on the payroll.`, firms: [up.f!.name], eventIds: ownMove(w, up.x), score: 42 }));
  if (down && down.pct <= -1.5) out.push(story({ section: 'markets', kicker: 'Markets', headline: `${down.f!.name} trails, down ${Math.abs(down.pct).toFixed(1)}%`, body: `The shares closed at ${money(down.x.last)}, ${money(down.x.prev - down.x.last)} lower on the day.`, firms: [down.f!.name], eventIds: ownMove(w, down.x), score: 41 }));
  return out;
}

function monthly(w: World, evs: Ev[]): Story[] {
  const out: Story[] = [];
  const profits = evs.filter((e) => e.kind === 'firm.profit');
  if (profits.length >= 4) {
    const rows = profits.map((e) => {
      const name = /at (.+)$/.exec(e.msg)?.[1] ?? '';
      return { e, f: firmNamed(w, name), cents: parseCents(/profit of (\S+)/.exec(e.msg)?.[1] ?? '') };
    }).filter((r) => r.f);
    rows.sort((a, b) => b.cents - a.cents);
    const best = rows[0], worst = rows[rows.length - 1];
    if (best) out.push(story({
      section: 'companies', kicker: 'Month end', headline: `${best.f!.name} led the month with ${money(best.cents)}`,
      body: worst && worst.cents < 0 ? `At the other end, ${worst.f!.name} lost ${money(-worst.cents)}.` : worst ? `The smallest of the month's profits was ${money(worst.cents)}, at ${worst.f!.name}.` : '',
      firms: [best.f!.name], eventIds: [best.e.id], score: 60,
    }));
  }
  const jobs = evs.find((e) => e.kind === 'macro.jobs');
  if (jobs) {
    const s = econ(w);
    out.push(story({ section: 'economy', kicker: 'Jobs', headline: `Unemployment is ${(s.unemployment * 100).toFixed(1)}%`, body: `${cap(jobs.msg)}. The city wage is ${money(s.wage)} a day.`, eventIds: [jobs.id], score: 62 }));
  }
  const fx = evs.find((e) => e.kind === 'fx.rate');
  if (fx) out.push(story({ section: 'markets', kicker: 'Currency', headline: cap(fx.msg.replace(/, the price that cleared.*$/, '')), body: `${cap(fx.msg)}.`, eventIds: [fx.id], score: 48 }));
  const yld = evs.find((e) => e.kind === 'bond.yield');
  if (yld) out.push(story({ section: 'bank', kicker: 'Bonds', headline: cap(yld.msg), body: `${cap(yld.msg)}. Borrowing costs follow.`, eventIds: [yld.id], score: 56 }));
  const en = evs.find((e) => e.kind === 'energy.price');
  if (en) out.push(story({ section: 'industry', kicker: 'Power', headline: cap(en.msg.split(', set by')[0]), body: `${cap(en.msg)}.`, eventIds: [en.id], score: 44 }));
  return out;
}

function firmProfile(w: World, d: Desk): Story | null {
  const s = econ(w);
  const rows = s.firms.filter((f) => !f.closed && f.staff.length >= 20);
  if (!rows.length) return null;
  for (let t = 0; t < 12; t++) {
    const f = rows[mix(w.day, 31, t) % rows.length];
    const key = 'prof:' + f.id;
    if (d.printed[key] !== undefined && w.day - d.printed[key] < 20) continue;
    d.printed[key] = w.day;
    const pay = weeklyPay(w, f);
    const ceo = f.ceo >= 0 && f.ceo < s.P.n ? s.P.name(f.ceo) : '';
    const margin = f.lastProfit > 0 ? `made ${money(f.lastProfit)} last month` : f.lastProfit < 0 ? `lost ${money(-f.lastProfit)} last month` : w.day < 30 ? 'has not closed its first month of the year yet' : 'broke even last month';
    const gap = firmGapOf(w, f);
    const hire = gap >= 2 ? ` It is short of ${Math.floor(gap)} hands.` : gap <= -2 ? ' It is carrying more people than its sales need.' : '';
    return story({
      section: 'companies', kicker: 'Firm profile', headline: `${f.name}: ${nWord(f.staff.length, 'person', 'people')}, about ${money(pay)} a week`,
      body: `The ${sectorWord(f.sector)} firm ${margin}${ceo ? ` under ${ceo}` : ''}.${hire}`,
      firms: [f.name], names: ceo ? [ceo] : [], eventIds: [f.profitEv ?? s.macroEv], score: 38,
    });
  }
  return null;
}

function personProfile(w: World, d: Desk): Story | null {
  const s = econ(w), P = s.P;
  const chiefs = s.firms.filter((f) => !f.closed && f.ceo >= 0 && f.ceo < P.n && P.alive(f.ceo) && f.staff.length >= 30);
  if (!chiefs.length) return null;
  for (let t = 0; t < 12; t++) {
    const f = chiefs[mix(w.day, 53, t) % chiefs.length];
    const key = 'pp:' + f.ceo;
    if (d.printed[key] !== undefined && w.day - d.printed[key] < 25) continue;
    d.printed[key] = w.day;
    const name = P.name(f.ceo);
    const mood = P.mood[f.ceo] > 70 ? 'in good spirits' : P.stress[f.ceo] > 110 ? 'looking worn down' : 'keeping their own counsel';
    const gap = firmGapOf(w, f);
    return story({
      section: 'people', kicker: 'Who runs it', headline: `${name}, ${P.age(w, f.ceo)}, runs ${f.name}`,
      body: `${name} is ${mood}. ${f.name} employs ${f.staff.length}${f.lastProfit > 0 ? ` and made ${money(f.lastProfit)} last month` : f.lastProfit < 0 ? ` and lost ${money(-f.lastProfit)} last month` : ''}${gap >= 2 ? `, and is hiring for ${Math.floor(gap)} seats` : ''}.${chiefLine(w, f.ceo)}`,
      names: [name], firms: [f.name], eventIds: [f.ceoEv ?? f.profitEv ?? s.macroEv], score: 36,
    });
  }
  return null;
}

/** A line about the chief as a person: family, home, what they own. */
function chiefLine(w: World, i: number): string {
  const P = econ(w).P;
  const bits: string[] = [];
  const kids = P.nkids[i];
  if (P.spouse[i] >= 0 && P.alive(P.spouse[i])) bits.push(`married to ${P.name(P.spouse[i])}`);
  if (kids > 0) bits.push(nWord(kids, 'child', 'children'));
  if (!bits.length) return '';
  return ` Away from the office: ${bits.join(', ')}.`;
}

/** The share index on the day, and how many names rose. */
/** The index is the sum of its names: cite the biggest movers' own events. */
function indexCauses(w: World): number[] {
  const rows = (w.state.markets as { stocks?: { issuer: string; last: number; prev: number; moveEv?: number }[] } | undefined)?.stocks ?? [];
  const big = rows.filter((x) => x.prev > 0 && x.moveEv !== undefined && x.moveEv >= 0 && (w.events.get(x.moveEv)?.day ?? -9) >= w.day - 1)
    .sort((a, b) => Math.abs(b.last / b.prev - 1) - Math.abs(a.last / a.prev - 1)).slice(0, 3).map((x) => x.moveEv as number);
  return big.length ? big : [w.genesis];
}

function indexStory(w: World, d: Desk): Story | null {
  const m = w.state.markets as { index?: number; stocks?: { last: number; prev: number; issuer: string }[] } | undefined;
  if (!m?.index || !m.stocks?.length) return null;
  const now = Math.round(m.index * 100);
  const was = d.printed['idxv'];
  d.printed['idxv'] = now;
  const up = m.stocks.filter((x) => x.prev > 0 && x.last > x.prev).length;
  const down = m.stocks.filter((x) => x.prev > 0 && x.last < x.prev).length;
  const pct = was ? (now / was - 1) * 100 : 0;
  return story({
    section: 'markets', kicker: 'The board',
    headline: was && Math.abs(pct) >= 0.05 ? `The index ${pct > 0 ? 'gains' : 'loses'} ${Math.abs(pct).toFixed(1)}% to ${(now / 100).toFixed(1)}` : `The index holds at ${(now / 100).toFixed(1)}`,
    body: `${up + down > 0 ? `${up} shares rose and ${down} fell at the last close. ` : ''}The index started the city's year at 100${now >= 10000 ? `, so it stands ${((now / 100) - 100).toFixed(1)} points up on the year` : `, so it stands ${(100 - now / 100).toFixed(1)} points down on the year`}.`,
    eventIds: indexCauses(w), score: 37,
  });
}

/** A standing feature runs at most once in this many days. */
function due(w: World, d: Desk, key: string, gap: number): boolean {
  const k = 'feat:' + key;
  if (d.printed[k] !== undefined && w.day - d.printed[k] < gap) return false;
  d.printed[k] = w.day;
  return true;
}

function jobsBoard(w: World, d: Desk): Story | null {
  if (!due(w, d, 'jobs', 2)) return null;
  const s = econ(w);
  const old = d.hist.length >= 2 ? d.hist[0] : undefined;
  const open: { f: Firm; seats: number }[] = [];
  for (const f of s.firms) {
    if (f.closed) continue;
    const gap = firmGapOf(w, f);
    if (gap >= 2) open.push({ f, seats: Math.floor(gap) });
  }
  open.sort((a, b) => b.seats - a.seats || (a.f.name < b.f.name ? -1 : 1));
  const cuts: { f: Firm; n: number }[] = [];
  if (old) for (const f of s.firms) {
    if (f.closed || f.idx >= old.n.length) continue;
    const lost = old.n[f.idx] - f.staff.length;
    if (lost >= 2) cuts.push({ f, n: lost });
  }
  cuts.sort((a, b) => b.n - a.n || (a.f.name < b.f.name ? -1 : 1));
  if (!open.length && !cuts.length) return null;
  const hire = open.slice(0, 3).map((r) => `${r.f.name} (${nWord(r.seats, 'seat', 'seats')}, about ${money(weeklyPay(w, r.f))} a week)`);
  const cut = cuts.slice(0, 3).map((r) => `${r.f.name} (${r.n} fewer)`);
  const head = open.length
    ? `${nWord(open.length, 'firm is', 'firms are')} short of hands${cuts.length ? `, ${nWord(cuts.length, 'firm is', 'firms are')} trimming` : ''}`
    : `${nWord(cuts.length, 'firm trims', 'firms trim')} its payroll; nobody is short of hands`;
  return story({
    section: 'labour', kicker: 'Jobs board', headline: head,
    body: `${hire.length ? `Taking people on: ${hire.join('; ')}${open.length > 3 ? `; ${open.length - 3} more` : ''}.` : ''} ${cut.length ? `Cutting this week: ${cut.join('; ')}${cuts.length > 3 ? `; ${cuts.length - 3} more` : ''}.` : ''}`.trim(),
    firms: [...open.slice(0, 3).map((r) => r.f.name), ...cuts.slice(0, 3).map((r) => r.f.name)],
    eventIds: [s.macroEv >= 0 ? s.macroEv : w.genesis], score: 53,
  });
}

function pitsStory(w: World): Story | null {
  const books = (w.state.commodities as { books?: { good: string; name: string; lot: number; tenors: { month: number; px: number; prev: number }[] }[]; root?: number } | undefined)?.books;
  if (!books?.length) return null;
  const rows = books.map((b) => {
    const t = b.tenors.find((x) => x.month === w.month) ?? b.tenors[0];
    return { b, t, pct: t.prev > 0 ? (t.px / t.prev - 1) * 100 : 0 };
  });
  rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const unit: Record<string, string> = { CRUDE_OIL: 'barrel', NATURAL_GAS: 'MMBtu', COAL: 'ton', IRON_ORE: 'ton', COPPER: '10 kg', LITHIUM: 'kg', GRAIN: 'quintal', LIVESTOCK: 'cwt' };
  const line = (r: typeof rows[number]): string => `${r.b.name} ${money(r.t.px)} a ${unit[r.b.good] ?? 'unit'}${Math.abs(r.pct) >= 0.1 ? ` (${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%)` : ''}`;
  const lead = rows[0];
  return story({
    section: 'markets', kicker: 'The pits', headline: Math.abs(lead.pct) >= 0.5 ? `${cap(lead.b.name)} ${lead.pct > 0 ? 'firms' : 'slips'} to ${money(lead.t.px)} a ${unit[lead.b.good] ?? 'unit'}` : 'Commodities hold their ground',
    body: `Front-month futures: ${rows.slice(0, 4).map(line).join('; ')}.`,
    eventIds: [(w.state.commodities as { root?: number }).root ?? w.genesis], score: 43,
  });
}

function rateFiller(w: World): Story | null {
  const b = w.state.bonds as { y?: Record<string, number>; spread?: Record<string, number> } | undefined;
  const y = b?.y;
  if (!y || !(y['10y'] > 0)) return null;
  const s = econ(w);
  const shape = curveShape(y).shape;
  return story({
    section: 'bank', kicker: 'Rates', headline: `Ten-year at ${(y['10y'] * 100).toFixed(2)}%, the curve ${shape}`,
    body: `Three-month bills pay ${((y['3m'] ?? 0) * 100).toFixed(2)}% and the thirty-year ${((y['30y'] ?? y['10y']) * 100).toFixed(2)}%. The central bank's rate is ${(s.policyRate * 100).toFixed(2)}%.${b?.spread?.BBB !== undefined ? ` A middling borrower pays ${Math.round(b.spread.BBB * 10000)}bp over.` : ''}`,
    eventIds: [s.rateEv >= 0 ? s.rateEv : w.genesis], score: 35,
  });
}

function nightStory(w: World): Story | null {
  const rows = nightOut(w);
  const busy = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  if (!busy.length) return null;
  const top = busy[0];
  const small = busy[busy.length - 1];
  const names = busy.flatMap((r) => r.names).slice(0, 3);
  return story({
    section: 'nightlife', kicker: 'Out last night',
    headline: `${top.venue} fills with ${top.words.replace(/^mostly /, '')}`,
    body: `About ${top.count} were in at ${top.venue}, ${top.where}. ${small !== top ? `${small.venue} had ${small.count}, ${small.words}.` : ''}${names.length ? ` Seen about: ${names.join('; ')}.` : ''}`,
    names: names.map((n) => n.split(' of ')[0]), eventIds: [w.events.last('venue.go') ?? w.genesis], score: 45,
  });
}

function plansAhead(w: World): Story | null {
  const dates = (w.state.society as { dates?: { day: number; kind: string; title: string; status: string; eventId: number }[] } | undefined)?.dates ?? [];
  const rows = dates.filter((x) => x.day >= w.day && x.day < w.day + 12 && x.status !== 'gone').sort((a, b) => a.day - b.day).slice(0, 3);
  if (rows.length < 2) return null;
  const clean = (t: string): string => t.replace(/\s*You are invited\.?/g, '').replace(/\s*I'll get this one\.?/g, '').replace(/\.$/, '');
  return story({
    section: 'society', kicker: 'The diary', headline: `${nWord(rows.length, 'date', 'dates')} on the town's diary`,
    body: rows.map((r) => `${r.day - w.day <= 0 ? 'Tonight' : r.day - w.day === 1 ? 'Tomorrow' : `In ${r.day - w.day} days`}: ${clean(r.title)}`).join('. ') + '.',
    eventIds: [rows[0].eventId >= 0 ? rows[0].eventId : w.genesis], score: 41,
  });
}

function hardTimes(w: World, evs: Ev[]): Story[] {
  const P = econ(w).P;
  const rows: { e: Ev; score: number }[] = [];
  for (const e of evs) {
    if (e.kind !== 'person.breakdown') continue;
    const i = e.actor && e.actor.startsWith('p_') ? +e.actor.slice(2) : -1;
    if (i < 0 || i >= P.n) continue;
    const emp = P.employer[i];
    const staff = emp >= 0 ? econ(w).firms[emp].staff.length : 0;
    rows.push({ e, score: (P.age(w, i) >= 40 ? 2 : 0) + (staff >= 200 ? 2 : 0) + (mix(e.id, 8) % 3) });
  }
  rows.sort((a, b) => b.score - a.score || a.e.id - b.e.id);
  const out: Story[] = [];
  // One story per cause: when a rug or a crash breaks several people, the paper names the others in the same piece.
  const byCause = new Map<string, string[]>();
  for (const r of rows) {
    const m = /^(.+?) \((\d+)\) .+? after (.+)$/.exec(r.e.msg);
    if (m) byCause.set(m[3], [...(byCause.get(m[3]) ?? []), m[1]]);
  }
  const usedCause = new Set<string>();
  for (const r of rows) {
    if (out.length >= 2) break;
    const m = /^(.+?) \((\d+)\) (.+?) after (.+)$/.exec(r.e.msg);
    if (!m || usedCause.has(m[4])) continue;
    usedCause.add(m[4]);
    const others = (byCause.get(m[4]) ?? []).filter((n) => n !== m[1]);
    const also = others.length ? ` ${others.slice(0, 2).join(' and ')}${others.length > 2 ? ` and ${others.length - 2} others` : ''} broke under the same blow.` : '';
    m[3] = m[3].replace(/eq:(frm_[a-z0-9_]+)/g, (_x, id: string) => { const n = firmOf(w, id)?.name; return n ? n + ' shares' : 'a share'; }).replace(/^puts part of their savings into/, 'gambles part of their savings on').replace(/^wants to gamble but cannot buy/, 'wants to gamble on');
    const quits = /^quits (.+)$/.exec(m[3]);
    const stops = /^stops working at (.+?) for sixty days$/.exec(m[3]);
    const what = m[4].replace(/^lost money/, 'losing money');
    const head = quits ? `${m[1]} walks out of ${quits[1]}` : stops ? `${m[1]} takes sixty days off from ${stops[1]}` : `${m[1]} ${m[3].startsWith('gambles') ? 'takes a gamble after a loss' : 'cracks'}`;
    out.push(story({
      section: 'people', kicker: 'Hard times', headline: head,
      body: `${m[1]}, ${m[2]}, ${quits ? `left ${quits[1]}` : stops ? `stopped work at ${stops[1]}` : m[3]} after ${what}. The strain had been building for weeks.${also}`,
      names: [m[1]], firms: quits ? [quits[1]] : stops ? [stops[1]] : [], eventIds: [r.e.id], score: 46 + r.score,
    }));
  }
  return out;
}

function scandals(evs: Ev[]): Story[] {
  const out: Story[] = [];
  for (const e of evs) {
    if (e.kind === 'crypto.rug') {
      const m = /^(.+?) pulled the (.+?) pool and kept (\$[\d,]+(?:\.\d+)?)/.exec(e.msg);
      // A rug is a scandal worth a story, once a day at most; the rest of the coin world stays in the column.
      if (m && !out.some((x) => x.kicker === 'The rug')) out.push(story({ section: 'scandal', kicker: 'The rug', headline: `${m[1]} pulls the ${m[2]} pool`, body: `${m[1]} walked away with ${m[3]}. Anyone still holding ${m[2]} coins has nowhere to sell.`, names: [m[1]], eventIds: [e.id], score: 47 }));
    } else if (e.kind === 'career.retrain') {
      out.push(story({ section: 'labour', kicker: 'Retraining', headline: cap(e.msg.replace(/, where firms are short$/, '')), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 45 }));
    } else if (e.kind.startsWith('fund.') && ['fund.campaign', 'fund.stake', 'fund.report', 'fund.vote', 'fund.dividend', 'fund.squeeze', 'fund.denial'].includes(e.kind)) {
      out.push(story({ section: 'companies', kicker: 'The investors', headline: cap(e.msg).slice(0, 120), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 57 }));
    } else if (e.kind === 'credit.tighten') {
      out.push(story({ section: 'bank', kicker: 'Credit', headline: 'Lenders tighten up', body: `${cap(e.msg)}.`, eventIds: [e.id], score: 66 }));
    } else if (e.kind === 'property.price') {
      out.push(story({ section: 'property', kicker: 'Property', headline: 'The housing market this month', body: `${cap(e.msg)}.`, eventIds: [e.id], score: 44 }));
    } else if (e.kind === 'property.repossess') {
      out.push(story({ section: 'streets', kicker: 'Repossessed', headline: cap(e.msg).slice(0, 110), body: `${cap(e.msg)}.`, eventIds: [e.id], score: 55 }));
    }
  }
  return out;
}

function payByTrade(w: World): Story | null {
  const s = econ(w);
  const by = new Map<string, { sum: number; n: number }>();
  for (const f of s.firms) {
    if (f.closed || f.staff.length < 5) continue;
    const pay = weeklyPay(w, f);
    const cur = by.get(f.sector) ?? { sum: 0, n: 0 };
    cur.sum += pay * f.staff.length;
    cur.n += f.staff.length;
    by.set(f.sector, cur);
  }
  const rows = [...by.entries()].map(([sector, v]) => ({ sector, pay: Math.round(v.sum / v.n) })).sort((a, b) => b.pay - a.pay);
  if (rows.length < 4) return null;
  const hi = rows[0], lo = rows[rows.length - 1];
  const mid = rows[Math.floor(rows.length / 2)];
  return story({
    section: 'labour', kicker: 'The pay packet', headline: `${cap(sectorWord(hi.sector))} pays most at ${money(hi.pay)} a week, ${sectorWord(lo.sector)} least`,
    body: `A week's pay averages ${money(hi.pay)} in ${sectorWord(hi.sector)}, ${money(mid.pay)} in ${sectorWord(mid.sector)} and ${money(lo.pay)} in ${sectorWord(lo.sector)}. The firm, the seat and the hand all move it.`,
    eventIds: [s.macroEv >= 0 ? s.macroEv : w.genesis], score: 31,
  });
}

// ---------------------------------------------------------------- the editions

function journalistOf(w: World, o: OutletRow, salt: number): string {
  const P = econ(w).P;
  const live = o.journalists.filter((i) => i >= 0 && i < P.n && P.alive(i));
  return live.length ? P.name(live[salt % live.length]) : '';
}

function collect(w: World, d: Desk): Ev[] {
  const tip = w.events.count - 1;
  if (d.cursor < 0) { d.cursor = tip; return []; }
  const out: Ev[] = [];
  let id = d.cursor + 1;
  if (tip - id > 20000) id = tip - 20000;
  for (; id <= tip; id++) {
    const e = w.events.get(id);
    if (e) out.push(e);
  }
  d.cursor = tip;
  return out;
}

function uniqueByHead(list: Story[]): Story[] {
  const seen = new Set<string>();
  const out: Story[] = [];
  for (const st of list) {
    const key = st.headline.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(st);
  }
  return out;
}

function build(w: World, d: Desk, outlet: OutletRow, edition: 'morning' | 'evening', pool: Story[], fillers: Story[], column: Edition['column'], day: number, size: number, least: number): Edition | null {
  const chosen: Story[] = [];
  const sorted = uniqueByHead(pool).sort((a, b) => b.score - a.score || a.eventIds[0] - b.eventIds[0]);
  const perSection = new Map<string, number>();
  for (const st of sorted) {
    if (chosen.length >= size) break;
    const n = perSection.get(st.section) ?? 0;
    if (n >= 2) continue;
    perSection.set(st.section, n + 1);
    chosen.push(st);
  }
  for (const st of fillers) {
    if (chosen.length >= least) break;
    if (!st || chosen.some((c) => c.headline === st.headline)) continue;
    const key = 'fill:' + st.headline;
    if (d.printed[key] !== undefined && w.day - d.printed[key] < 3) continue;
    d.printed[key] = w.day;
    chosen.push(st);
  }
  if (!chosen.length) return null;
  chosen.sort((a, b) => b.score - a.score);
  chosen.forEach((st, k) => { st.id = d.seq * 10 + k; });
  const causes = [...new Set(chosen.flatMap((st) => st.eventIds))].slice(0, 6);
  if (!causes.length) causes.push(w.genesis);
  const lead = chosen[0];
  const ev = w.events.emit('media.edition', `${outlet.name}, ${edition} edition: ${lead.headline}`, causes);
  const ed: Edition = {
    id: d.seq++, day, outletId: outlet.id, outlet: outlet.name, edition, minute: edition === 'morning' ? 420 : 1080,
    headline: lead.headline, stories: chosen, column, eventId: ev,
  };
  d.editions.push(ed);
  if (d.editions.length > 14) d.editions.splice(0, d.editions.length - 14);
  // The press panel reads columns: put the first few stories there in the paper's own voice.
  chosen.slice(0, 3).forEach((st, k) => {
    const by = journalistOf(w, outlet, mix(day, k, st.eventIds[0] ?? 0));
    const text = `${outlet.name}: ${st.headline}. ${st.body.split('. ')[0].replace(/\.$/, '')}.${by ? ` — ${by}, ${st.section === 'companies' || st.section === 'markets' ? 'business' : st.section}` : ''}`;
    w.events.emit('media.column', text, st.eventIds.length ? st.eventIds.slice(0, 4) : [ev]);
  });
  return ed;
}

/** One pass a day: collect what happened since the last pass, and print tomorrow's morning Herald and tonight's Gazette. */
export function paperDay(w: World): void {
  if (!w.state.media) return;
  const d = desk(w);
  snapshot(w, d);
  const evs = collect(w, d);
  if (!evs.length && d.editions.length) return;
  const book = w.state.media as { outlets?: OutletRow[] };
  const herald = book.outlets?.find((o) => o.id === 'HERALD');
  const gazette = book.outlets?.find((o) => o.id === 'GAZETTE');
  if (!herald && !gazette) return;
  const day = w.day + 1;
  const biz: Story[] = [];
  const people: Story[] = [];
  const both: Story[] = [];
  for (const e of evs) {
    if (e.kind.startsWith('media.') || e.kind === 'news.story' || e.kind === 'signals.story' || e.kind === 'society.paper') continue;
    let st: Story | null = null;
    if (e.kind === 'earnings.report') { st = earnings(w, e); if (st) biz.push(st); continue; }
    if (e.kind === 'mkt.move') { st = marketMove(w, e); if (st) biz.push(st); continue; }
    if (e.kind === 'cb.rate' || e.kind === 'cb.hold') { st = rateMove(w, e); if (st) biz.push(st); continue; }
    if (e.kind === 'bond.spread') { st = spreadMove(e); if (st) biz.push(st); continue; }
    if (e.kind === 'career.promotion') { st = peopleMoves(w, e); if (st) people.push(st); continue; }
    if (e.kind.startsWith('firm.') || e.kind === 'bond.default') {
      st = chiefNews(w, e) ?? trouble(w, e);
      if (st) (st.section === 'industry' ? biz : both).push(st);
      continue;
    }
    if (e.kind.startsWith('law.') || e.kind.startsWith('court.') || e.kind === 'crime.arrest') { st = courts(w, e); if (st) people.push(st); continue; }
    if (e.kind.startsWith('politics.')) { st = politics(e); if (st) both.push(st); continue; }
    if (e.kind === 'society.fall' || e.kind === 'society.rise') { st = fortunes(e); if (st) people.push(st); continue; }
    if (e.kind.startsWith('society.') || e.kind === 'person.died' || e.kind === 'circle.held') { st = socialPage(w, e); if (st) people.push(st); continue; }
    st = trouble(w, e);
    if (st) (st.section === 'markets' || st.section === 'industry' ? biz : both).push(st);
  }
  const preview = ratePreview(w);
  if (preview) biz.unshift(preview);
  const jobs = jobsStories(w, d, evs);
  biz.push(...jobs, ...movers(w), ...monthly(w, evs));
  const street = streets(w, evs);
  if (street) people.push(street);
  const prop = propertyPage(w, evs);
  if (prop) people.push(prop);
  const column = cryptoColumn(evs);
  const prof = firmProfile(w, d);
  if (prof) biz.push(prof);
  const who = personProfile(w, d);
  if (who) people.push(who);
  for (const st of [jobsBoard(w, d), due(w, d, 'pits', 2) ? pitsStory(w) : null, due(w, d, 'rates', 6) ? rateFiller(w) : null]) if (st) biz.push(st);
  for (const st of [nightStory(w), due(w, d, 'diary', 4) ? plansAhead(w) : null, ...hardTimes(w, evs)]) if (st) people.push(st);
  for (const st of scandals(evs)) (['companies', 'bank', 'labour'].includes(st.section) ? biz : people).push(st);
  const fillersH = [indexStory(w, d), due(w, d, 'paytrade', 9) ? payByTrade(w) : null, due(w, d, 'paybest', 9) ? hiringFiller(w) : null, quayFiller(w), firmProfile(w, d), pitsStory(w), firmProfile(w, d), rateFiller(w), numbers(w)].filter((x): x is Story => !!x);
  const fillersG = [townFiller(w), personProfile(w, d), richFiller(w), nightStory(w), personProfile(w, d), richFiller(w, 2), due(w, d, 'diary2', 2) ? plansAhead(w) : null, firmProfile(w, d), due(w, d, 'paytrade2', 9) ? payByTrade(w) : null, quayFiller(w)].filter((x): x is Story => !!x);
  if (herald) build(w, d, herald, 'morning', [...biz, ...both.map((s) => ({ ...s }))], fillersH, null, day, 7, 5);
  if (gazette) build(w, d, gazette, 'evening', [...people, ...both.map((s) => ({ ...s, kicker: s.kicker }))], fillersG, column, day, 6, 5);
}

/** The latest editions the reader can hold by this minute of the day: a morning paper after 07:00, an evening paper after 18:00. */
export function editionsFor(w: World, minute: number, n = 6): Edition[] {
  const d = (w.state.media as { paper?: Desk } | undefined)?.paper;
  if (!d) return [];
  const out = d.editions.filter((e) => e.day < w.day || (e.day === w.day && e.minute <= minute));
  return out.slice(-n).reverse();
}
export function paperStats(w: World): Record<string, number> {
  const d = (w.state.media as { paper?: Desk } | undefined)?.paper;
  if (!d) return { editions: 0 };
  let stories = 0;
  for (const e of d.editions) stories += e.stories.length;
  return { editions: d.seq - 1, storiesPerEdition: d.editions.length ? +(stories / d.editions.length).toFixed(1) : 0 };
}
