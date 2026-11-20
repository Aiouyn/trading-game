// The city desk. A few ranked headlines a day, each in one outlet's voice, from events that already happened.
// Same-kind notes from one day or week fold into one roundup. Each paper and each journalist files once or twice, then stops.
// A sensational paper sometimes prints a rumour. A sober paper corrects it when the figures disagree.
// Once the player is large enough, the gossip column names them, and a journalist asks for comment.
import { type World } from '../../kernel/index.ts';
import { type EconState } from '../economy/index.ts';
import { contactsOf, nudgeLink, nudgeStanding } from '../social/index.ts';
import { CITY, money, sectorWord } from '../social/words.ts';
import { discountForNews } from '../markets/index.ts';
import { firmGap } from '../careers/jobs.ts';

export type Fan = (issuer: string, side: number, trust: number, outlet: number, weight: number) => void;

interface Outlet {
  id: string; name: string; readership: number; leaning: number; serious: boolean;
  firm: number; trust: number; journalists: number[]; lastStory: number;
}
interface Desk { person: number; outlet: number; beat: string }
interface Seen { key: string; day: number }
interface Rumour {
  day: number; story: number; fromRate: number; issuer: string; firm: string;
  outlet: number; claim: string; judged: boolean; discounted: boolean;
}
/** A journalist's request for comment. Open until the player answers it or the paper runs out of patience. */
export interface Ask {
  id: number; day: number; until: number; player: number; journalist: number; outlet: number;
  about: string; cause: number; open: boolean;
  stance: string; quote: string; answer: number; followed: boolean;
}
/** The ways a player can answer a request. The stance sets the follow-up story and the player's standing. */
export const STANCES: { id: string; label: string }[] = [
  { id: 'explain', label: 'Explain' },
  { id: 'deny', label: 'Deny' },
  { id: 'nocomment', label: 'No comment' },
  { id: 'attack', label: 'Attack the story' },
];
/** A trade worth this many national wages is worth a question from the business desk. */
const BIG_TRADE = 150;
interface Item {
  key: string; gap: number; score: number; cause: number; beat: string;
  subject: string; detail: string; heat: string; gossip: string; weekly: string;
  player: boolean; person: number; standing: number; link: number; linkDelta: number;
  issuer: string; side: number; weight: number; discount: boolean;
  /** Confirmed news on a name: the weight its shares are marked by (a fraction, negative for bad news). */
  priced?: number;
  outletId: string; force: boolean; tabloid: boolean; causes: number[];
}
interface Wire {
  cursor: number; seen: Seen[]; spouse: Int32Array; desk: Desk[];
  rumours: Rumour[]; asks: Ask[]; pending: Item | null; released: boolean; playerDay: number;
  pricedDay: number; lastOutlet: number; yHead: number; yCorrect: number; yPlayer: number; yAsk: number;
  clusters: Cluster[]; capDay: number; outN: number[]; wrote: number[]; skim: number;
  askSeq: number; logSeen: number;
}
interface Ev { id: number; day: number; kind: string; actor?: string; msg: string; causes: number[] }
interface Firm {
  id: string; idx: number; name: string; sector: string; workers: number; bornWorkers: number; ceo: number;
  closed: boolean; listed: boolean; lastProfit: number;
}
interface Cut { id: string; name: string; cut: number; ev: number }
interface Cluster { week: number; kind: string; cuts: Cut[]; cause: number; published: boolean }
interface People {
  n: number; spouse: Int32Array; employer: Int32Array; slot: Int32Array;
  alive(i: number): boolean; name(i: number): string; id(i: number): string;
}
interface DateRow {
  day: number; kind: string; place: string; who: number[]; title: string;
  invite: number; status: string; eventId: number; host: number;
}

const BEATS: Record<string, string[]> = {
  HERALD: ['rates', 'markets', 'labour', 'companies'],
  MERCURY: ['politics', 'scandal', 'rumours', 'people'],
  LEDGER: ['companies', 'labour', 'markets', 'credit'],
  GAZETTE: ['society', 'people', 'player', 'parties'],
};
const DESK: Record<string, string[]> = {
  rates: ['HERALD', 'LEDGER', 'MERCURY'],
  credit: ['LEDGER', 'HERALD', 'MERCURY'],
  companies: ['LEDGER', 'HERALD', 'MERCURY'],
  markets: ['HERALD', 'LEDGER', 'MERCURY'],
  courts: ['HERALD', 'MERCURY', 'GAZETTE'],
  scandal: ['MERCURY', 'HERALD', 'GAZETTE'],
  politics: ['MERCURY', 'HERALD', 'LEDGER'],
  labour: ['HERALD', 'LEDGER'],
  society: ['GAZETTE', 'MERCURY', 'HERALD'],
  player: ['GAZETTE', 'MERCURY', 'HERALD'],
  rumours: ['MERCURY', 'GAZETTE', 'HERALD'],
};
const OUTLET_CAP = 2;
const JOURNO_CAP = 1;
const NUM = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

function econ(w: World): EconState { return w.state.economy as EconState; }
function people(w: World): People { return econ(w).P as unknown as People; }
function outlets(w: World): Outlet[] {
  return (w.state.media as { outlets?: Outlet[] } | undefined)?.outlets ?? [];
}
function rootOf(w: World): number {
  const root = (w.state.media as { root?: number } | undefined)?.root;
  return root !== undefined && root >= 0 ? root : w.genesis;
}
function blank(): Wire {
  return {
    cursor: -1, seen: [], spouse: new Int32Array(0), desk: [],
    rumours: [], asks: [], pending: null, released: false, playerDay: -1, pricedDay: -1, lastOutlet: -1,
    yHead: 0, yCorrect: 0, yPlayer: 0, yAsk: 0,
    clusters: [], capDay: -1, outN: [], wrote: [], skim: -1,
    askSeq: 0, logSeen: -1,
  };
}
function wireOf(w: World): Wire {
  const b = w.state.media as { wire?: Wire };
  if (!b.wire) b.wire = blank();
  return b.wire;
}
function mix(a: number, b: number, c = 0): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}
function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 3);
  const sp = cut.lastIndexOf(' ');
  return (sp > 40 ? cut.slice(0, sp) : cut) + '...';
}
function styleOf(id: string, serious: boolean): string {
  if (id === 'HERALD') return 'sober';
  if (id === 'MERCURY') return 'tabloid';
  if (id === 'LEDGER') return 'weekly';
  if (id === 'GAZETTE') return 'gossip';
  return serious ? 'sober' : 'tabloid';
}
function playerIndex(w: World): number {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { who?: number }>; who?: number } | undefined;
  if (!st) return -1;
  const key = st.ids?.[0];
  const who = (key && st.seat?.[key]?.who) ?? st.who ?? -1;
  return typeof who === 'number' ? who : -1;
}
function firmById(w: World, id: string): Firm | undefined {
  if (!id) return undefined;
  for (const f of econ(w).firms) if (f.id === id) return f as Firm;
  return undefined;
}
function personIndex(actor: string | undefined): number {
  if (!actor || !actor.startsWith('p_')) return -1;
  const n = +actor.slice(2);
  return Number.isFinite(n) ? n : -1;
}
function listed(w: World, id: string): boolean {
  const stocks = (w.state.markets as { stocks?: { issuer: string }[] } | undefined)?.stocks;
  if (!stocks) return false;
  for (const s of stocks) if (s.issuer === id) return true;
  return false;
}
function curveFull(w: World): string {
  const b = w.state.bonds as { y?: Record<string, number>; spread?: Record<string, number> } | undefined;
  const y = b?.y;
  if (!y || !(y['10y'] > 0)) return '';
  const y3 = y['3m'] ?? 0, y10 = y['10y'], y30 = y['30y'] ?? y10;
  const slope = Math.round((y10 - y3) * 10000);
  const shape = slope > 20 ? 'upward' : slope < -20 ? 'inverted' : 'flat';
  const bbb = b?.spread?.BBB;
  const credit = bbb !== undefined ? ` BBB sits ${Math.round(bbb * 10000)}bp over the five-year.` : '';
  return `The curve is ${shape}: three-month ${(y3 * 100).toFixed(2)}%, ten-year ${(y10 * 100).toFixed(2)}%, thirty-year ${(y30 * 100).toFixed(2)}%.${credit}`;
}
function curveTight(w: World): string {
  const y = (w.state.bonds as { y?: Record<string, number> } | undefined)?.y;
  if (!y || !(y['10y'] > 0)) return '';
  const y3 = y['3m'] ?? 0, y10 = y['10y'], y30 = y['30y'] ?? y10;
  const slope = Math.round((y10 - y3) * 10000);
  const shape = slope > 20 ? 'upward' : slope < -20 ? 'inverted' : 'flat';
  return `The curve is ${shape}: 3-month ${(y3 * 100).toFixed(2)}%, 10-year ${(y10 * 100).toFixed(2)}%, 30-year ${(y30 * 100).toFixed(2)}%.`;
}
function curveShort(w: World): string {
  const y = (w.state.bonds as { y?: Record<string, number> } | undefined)?.y;
  if (!y || !(y['10y'] > 0)) return '';
  const slope = Math.round((y['10y'] - (y['3m'] ?? 0)) * 10000);
  const shape = slope > 20 ? 'steep' : slope < -20 ? 'inverted' : 'flat';
  return `Ten-year ${(y['10y'] * 100).toFixed(2)}%, the curve ${shape}.`;
}
function notables(w: World): Set<number> {
  const set = new Set<number>();
  const soc = w.state.society as { rich?: { person: number }[]; powerful?: { person: number }[] } | undefined;
  for (const r of soc?.rich ?? []) set.add(r.person);
  for (const r of soc?.powerful ?? []) set.add(r.person);
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
  if (pol) for (const k of [pol.leader, pol.finance, pol.governor, pol.regulator]) if (k !== undefined && k >= 0) set.add(k);
  for (const f of econ(w).firms as Firm[]) if (!f.closed && f.ceo >= 0 && f.workers >= 36) set.add(f.ceo);
  return set;
}
function officeOf(w: World, who: number): string {
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
  if (!pol || who < 0) return '';
  if (pol.leader === who) return 'leads the government';
  if (pol.finance === who) return 'holds the finance seat';
  if (pol.governor === who) return 'is governor of the central bank';
  if (pol.regulator === who) return 'holds the regulator\'s seat';
  return '';
}
function fresh(wire: Wire, key: string, day: number, gap: number): boolean {
  for (let i = wire.seen.length - 1; i >= 0; i--) {
    const s = wire.seen[i];
    if (s.key === key && day - s.day < gap) return false;
  }
  return true;
}
function markSeen(wire: Wire, key: string, day: number): void {
  wire.seen.push({ key, day });
  if (wire.seen.length > 280) wire.seen.splice(0, wire.seen.length - 200);
}
function item(part: Partial<Item> & { key: string; cause: number; beat: string; subject: string }): Item {
  return {
    gap: 20, score: 50, detail: '', heat: '', gossip: '', weekly: '',
    player: false, person: -1, standing: 0, link: -1, linkDelta: 0,
    issuer: '', side: 0, weight: 0, discount: false, outletId: '', force: false, tabloid: false, causes: [],
    ...part,
  };
}
function countWord(n: number): string {
  return n >= 0 && n < NUM.length ? NUM[n] : String(n);
}
function shortName(name: string): string {
  const t = name.trim();
  const parts = t.split(/\s+/);
  if (/^the$/i.test(parts[0]) && parts.length > 1) return parts[parts.length - 1];
  if (parts.length > 1 && parts[0].length <= 3) return `${parts[0]} ${parts[1]}`;
  return parts[0] || name;
}
function beatWord(beat: string): string {
  if (beat === 'companies') return 'business';
  return beat;
}
function caps(wire: Wire, day: number): void {
  if (wire.capDay === day && wire.outN) return;
  wire.capDay = day;
  wire.outN = [0, 0, 0, 0, 0, 0, 0, 0];
  wire.wrote = [];
}
function deskOrder(it: Item): string[] {
  if (it.outletId) return [it.outletId];
  const base = DESK[it.beat] ?? DESK.companies;
  if (it.beat !== 'labour') return base;
  const rest = base.filter((id) => id !== 'MERCURY');
  return it.tabloid ? ['MERCURY', ...rest] : rest;
}
function voice(style: string, it: Item): string {
  if (style === 'tabloid') {
    const kick = it.heat || 'City';
    return clip(`${kick}. ${it.gossip || it.subject}`, 220);
  }
  if (style === 'gossip') return clip(it.gossip || it.subject, 220);
  if (style === 'weekly') return clip(it.weekly || (it.detail ? `${it.subject} ${it.detail}` : `${it.subject} The week in review.`), 240);
  const join = it.subject.endsWith('.') || it.subject.endsWith('...') ? ' ' : '. ';
  return clip(it.detail ? `${it.subject}${join}${it.detail}` : it.subject, 240);
}
function seat(w: World, wire: Wire): void {
  const outs = outlets(w);
  const P = people(w);
  const next: Desk[] = [];
  for (let oi = 0; oi < outs.length; oi++) {
    const o = outs[oi];
    const beats = BEATS[o.id] ?? (o.serious ? BEATS.HERALD : BEATS.MERCURY);
    const have = wire.desk.filter((d) => d.outlet === oi && o.journalists.includes(d.person));
    const used = new Set(have.map((d) => d.beat));
    for (const d of have) next.push(d);
    for (const person of o.journalists) {
      if (!P.alive(person) || next.some((d) => d.person === person && d.outlet === oi)) continue;
      let beat = beats.find((b) => !used.has(b)) ?? beats[next.length % beats.length];
      used.add(beat);
      next.push({ person, outlet: oi, beat });
    }
  }
  wire.desk = next;
}
function journalist(wire: Wire, outlet: number, beat: string, force: boolean): Desk | undefined {
  const rows = wire.desk.filter((d) => d.outlet === outlet);
  if (!rows.length) return undefined;
  const nOf = (person: number): number => {
    let n = 0;
    for (const id of wire.wrote) if (id === person) n++;
    return n;
  };
  const free = (d: Desk): boolean => nOf(d.person) < JOURNO_CAP;
  if (beat === 'rumours') {
    const sens = rows.find((d) => d.beat === 'scandal' && free(d));
    if (sens) return sens;
  }
  const match = rows.find((d) => d.beat === beat && free(d));
  if (match) return match;
  const other = rows.find((d) => free(d) && (beat === 'scandal' || beat === 'rumours' || d.beat !== 'scandal'));
  if (other) return other;
  if (!force) return undefined;
  return rows.find((d) => d.beat === beat) ?? rows[0];
}
function emitItem(w: World, wire: Wire, it: Item, fan: Fan): number {
  const outs = outlets(w);
  if (!outs.length) return -1;
  caps(wire, w.day);
  const order = deskOrder(it);
  const ledgerDay = w.day % 7 === 2;
  let outlet = -1;
  let desk: Desk | undefined;
  for (const id of order) {
    const i = outs.findIndex((o) => o.id === id);
    if (i < 0 || !outs[i].journalists.length) continue;
    if (id === 'LEDGER' && !ledgerDay && it.score < 82 && !it.force && it.outletId !== 'LEDGER') continue;
    if ((wire.outN[i] ?? 0) >= OUTLET_CAP && !it.force) continue;
    const picked = journalist(wire, i, it.beat, it.force);
    if (!picked) continue;
    outlet = i;
    desk = picked;
    break;
  }
  if (outlet < 0 || !desk) {
    if (!it.force) return -1;
    for (let i = 0; i < outs.length; i++) {
      if (!outs[i].journalists.length) continue;
      const picked = journalist(wire, i, it.beat, true);
      if (!picked) continue;
      outlet = i;
      desk = picked;
      break;
    }
  }
  if (outlet < 0 || !desk) return -1;
  const o = outs[outlet];
  const P = people(w);
  const style = styleOf(o.id, o.serious);
  const body = voice(style, it);
  const byline = `${P.name(desk.person)}, ${beatWord(it.beat)}`;
  const text = `${o.name}: ${body} — ${byline}`;
  const firms = econ(w).firms;
  const actor = o.firm >= 0 && o.firm < firms.length ? firms[o.firm].id : P.id(desk.person);
  wire.lastOutlet = outlet;
  wire.wrote.push(desk.person);
  wire.outN[outlet] = (wire.outN[outlet] ?? 0) + 1;
  const causes = it.causes.length ? it.causes.slice(0, 6) : [it.cause >= 0 ? it.cause : rootOf(w)];
  const ev = w.events.emit('media.column', text, causes, actor);
  markSeen(wire, it.key, w.day);
  wire.yHead++;
  if (it.player) {
    wire.yPlayer++;
    wire.playerDay = w.day;
    if (it.person >= 0 && it.standing) nudgeStanding(w, it.person, it.standing);
    if (it.link >= 0 && it.linkDelta) nudgeLink(w, it.person, it.link, it.linkDelta);
  } else if (it.person >= 0 && it.standing) {
    nudgeStanding(w, it.person, it.standing);
  }
  // A rumour is priced as a rumour: a few percent, in the direction it points. Its confirmation or correction is priced when it lands.
  if (it.issuer && it.discount && w.state.markets) {
    discountForNews(w, it.issuer, ev, (it.side || -1) * Math.min(0.12, 0.04 * Math.max(0.5, it.weight)));
    wire.pricedDay = w.day;
  }
  if (it.issuer && it.priced && w.state.markets) discountForNews(w, it.issuer, ev, it.priced, it.cause);
  if (it.issuer && it.side && it.weight) fan(it.issuer, it.side, o.trust, outlet, it.weight);
  return ev;
}
/** A journalist asks the player for comment on a story that names them. One open request at a time. */
function askFor(w: World, wire: Wire, it: Item): void {
  if (!it.player || it.person < 0 || it.key.startsWith('comment:')) return;
  if (wire.asks.some((a) => a.open)) return;
  if (!fresh(wire, 'ask:' + it.key, w.day, 45)) return;
  const P = people(w);
  const outs = outlets(w);
  let outlet = -1;
  let desk: Desk | undefined;
  for (const id of deskOrder(it)) {
    const i = outs.findIndex((o) => o.id === id);
    if (i < 0 || !outs[i].journalists.length) continue;
    const picked = journalist(wire, i, it.beat, true);
    if (!picked) continue;
    outlet = i;
    desk = picked;
    break;
  }
  if (outlet < 0 || !desk) return;
  markSeen(wire, 'ask:' + it.key, w.day);
  const o = outs[outlet];
  const about = clip(it.subject, 120);
  const ev = w.events.emit('media.ask',
    `${P.name(desk.person)} of ${o.name} asks ${P.name(it.person)} for comment on ${about}.`,
    [it.cause >= 0 ? it.cause : rootOf(w)], P.id(desk.person));
  wire.askSeq++;
  wire.asks.push({
    id: wire.askSeq, day: w.day, until: w.day + 5, player: it.person, journalist: desk.person, outlet,
    about, cause: ev, open: true, stance: '', quote: '', answer: -1, followed: false,
  });
  wire.yAsk++;
}
/** The player's answer to an open request. It closes the request; the follow-up runs in the next day's close. */
export function answerAsk(w: World, person: number, id: number, stance: string, text: string): { status: 'accepted' | 'rejected'; why?: string; eventId?: number; text?: string } {
  if (!w.state.media) return { status: 'rejected', why: 'no such request' };
  const wire = wireOf(w);
  const ask = wire.asks.find((a) => a.id === id);
  if (!ask || ask.player !== person) return { status: 'rejected', why: 'no such request' };
  if (!ask.open) return { status: 'rejected', why: 'that request is closed' };
  if (w.day > ask.until) return { status: 'rejected', why: 'that request has run out' };
  if (!STANCES.some((s) => s.id === stance)) return { status: 'rejected', why: 'pick deny, explain, no comment or attack' };
  const words = clip(text.replace(/\s+/g, ' ').trim(), 240);
  if (stance !== 'nocomment' && !words) return { status: 'rejected', why: 'say a few words for the paper' };
  const P = people(w);
  const o = outlets(w)[ask.outlet];
  const paper = o?.name ?? 'the paper';
  ask.open = false;
  ask.stance = stance;
  ask.quote = stance === 'nocomment' ? '' : words;
  const said = ask.quote ? `"${ask.quote}"` : 'no comment';
  ask.answer = w.events.emit('media.answer', `${P.name(person)} answers ${paper} (${stance}): ${said}`, [ask.cause], P.id(person));
  return { status: 'accepted', eventId: ask.answer, text: 'the paper has your comment' };
}
/** What a stance says in the paper, and what it does to the player's standing and the paper's trust. */
function followUp(ask: Ask, name: string): { subject: string; heat: string; standing: number; trust: number } {
  const q = ask.quote;
  switch (ask.stance) {
    case 'explain': return { subject: `${name} tells the paper: "${q}"`, heat: 'Comment', standing: 2, trust: 1 };
    case 'deny': return { subject: `${name} denies it: "${q}"`, heat: 'Denial', standing: 1, trust: 0 };
    case 'attack': return { subject: `${name} hits back at the story: "${q}"`, heat: 'Attack', standing: -1, trust: -3 };
    case 'nocomment': return { subject: `${name} gives no comment`, heat: 'No comment', standing: -2, trust: 0 };
    default: return { subject: `${name} declined to comment`, heat: 'No comment', standing: -3, trust: 0 };
  }
}
/** Runs the follow-up for each answered request, and marks a request that ran out of days as declined. */
function resolveAsks(w: World, wire: Wire, fan: Fan): void {
  const P = people(w);
  for (const ask of wire.asks) {
    if (ask.followed) continue;
    if (ask.open) {
      if (w.day <= ask.until) continue;
      ask.open = false;
      ask.stance = 'declined';
    }
    ask.followed = true;
    const o = outlets(w)[ask.outlet];
    const f = followUp(ask, P.name(ask.player));
    if (o && f.trust) o.trust = Math.max(20, Math.min(o.serious ? 90 : 70, o.trust + f.trust));
    const subject = f.subject;
    emitItem(w, wire, item({
      key: 'comment:' + ask.cause, gap: 1, score: 70, cause: ask.answer >= 0 ? ask.answer : ask.cause, beat: 'player',
      subject, detail: ask.about, heat: f.heat,
      gossip: subject, weekly: `${subject} The question was ${ask.about}`,
      player: true, person: ask.player, standing: f.standing, force: true,
      outletId: o?.id ?? 'GAZETTE',
    }), fan);
  }
  if (wire.asks.length > 12) wire.asks = wire.asks.filter((a) => a.open || w.day - a.day < 20);
}
/** What the market expected of the meeting this decision came from, in words. */
function expectWords(w: World, e: Ev): string {
  const last = econ(w).cbLast;
  if (!last || last.ev !== e.id) return '';
  const pct = (r: number): string => (r * 100).toFixed(2);
  const bp = Math.round((last.to - last.expect) * 10000);
  const want = Math.abs(last.expect - last.from) < 1e-6 ? `a hold at ${pct(last.from)}%` : `a move to ${pct(last.expect)}%`;
  return bp === 0 ? `The market expected exactly that (${want}).` : `The market expected ${want}: a surprise of ${bp > 0 ? '+' : ''}${bp} basis points.`;
}
function holdItem(w: World, e: Ev): Item | null {
  const m = /policy rate held at ([\d.]+)%/.exec(e.msg);
  if (!m) return null;
  const a = Number(m[1]);
  return item({
    key: 'rate:' + e.id, gap: 8, score: 78, cause: e.id, beat: 'rates', outletId: 'HERALD', force: true,
    subject: `The central bank holds the policy rate at ${a.toFixed(2)}%`,
    detail: `${expectWords(w, e)} ${curveFull(w)}`.trim(), heat: 'The bank holds',
    gossip: `The bank sat on its hands at ${a.toFixed(2)}%. ${curveShort(w)}`,
    weekly: `A hold at ${a.toFixed(2)}%. ${curveFull(w)}`,
  });
}
function rateItem(w: World, e: Ev): Item | null {
  const m = /policy rate ([\d.]+)% -> ([\d.]+)%/.exec(e.msg);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const expected = expectWords(w, e);
  const verb = b > a + 0.001 ? 'raised' : b < a - 0.001 ? 'cut' : 'held';
  const heat = b > a ? 'Rate shock' : b < a ? 'Rate cut' : 'The bank holds';
  const curve = curveFull(w);
  const short = curveShort(w);
  const who = e.actor ? personIndex(e.actor) : -1;
  const named = who >= 0 ? people(w).name(who) : '';
  return item({
    key: 'rate:' + e.id, gap: 8, score: 80, cause: e.id, beat: 'rates',
    subject: `The central bank ${verb} the policy rate from ${a.toFixed(2)}% to ${b.toFixed(2)}%`,
    detail: `${expected} ${curve}`.trim(), heat, outletId: 'HERALD', force: true,
    gossip: named ? `${named} moves the rate to ${b.toFixed(2)}%. ${short}` : `The bank ${verb} the rate to ${b.toFixed(2)}%. ${short}`,
    weekly: `A ${verb === 'held' ? 'hold' : verb === 'raised' ? 'hike' : 'cut'} to ${b.toFixed(2)}%. ${curve}`,
  });
}
function yieldItem(w: World, e: Ev): Item | null {
  const m = /10-year yield ([\d.]+)% -> ([\d.]+)%/.exec(e.msg);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const bp = Math.round((b - a) * 100);
  if (Math.abs(bp) < 8) return null;
  return item({
    key: 'yield', gap: 12, score: 64 + Math.min(12, Math.abs(bp) / 5), cause: e.id, beat: 'rates',
    subject: `The ten-year yield moved from ${a.toFixed(2)}% to ${b.toFixed(2)}%`,
    detail: curveFull(w), heat: bp > 0 ? 'Yields jump' : 'Yields fall',
    gossip: `The ten-year is ${b.toFixed(2)}%. ${curveShort(w)}`,
    weekly: `Ten-year ${a.toFixed(2)}% to ${b.toFixed(2)}%, ${bp > 0 ? '+' : ''}${bp}bp. ${curveFull(w)}`,
  });
}
function spreadItem(w: World, e: Ev): Item | null {
  const m = /BBB spread (\d+)bp -> (\d+)bp/.exec(e.msg);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  if (Math.abs(b - a) < 8) return null;
  return item({
    key: 'spread', gap: 20, score: 60, cause: e.id, beat: 'credit',
    subject: `The BBB spread moved from ${a}bp to ${b}bp`,
    detail: curveShort(w), heat: b > a ? 'Credit widens' : 'Credit tightens',
    gossip: `Credit ${b > a ? 'widens' : 'tightens'} to ${b}bp for a BBB name`,
    weekly: `BBB ${a}bp to ${b}bp. ${curveFull(w)}`,
  });
}
function earnItem(w: World, e: Ev): Item | null {
  const f = firmById(w, e.actor ?? '');
  if (!f) return null;
  const miss = /\bmiss\b/i.test(e.msg);
  const beat = /\bbeat\b/i.test(e.msg);
  const pct = /([+-]?[\d.]+)%\)/.exec(e.msg);
  const gap = pct ? `${Math.abs(Number(pct[1])).toFixed(1)}%` : '';
  const word = beat ? 'beat' : miss ? 'missed' : 'met';
  const P = people(w);
  const ceo = f.ceo >= 0 && f.ceo < P.n ? P.name(f.ceo) : '';
  const trade = sectorWord(f.sector);
  return item({
    key: 'earn:' + f.id, gap: 40, score: beat || miss ? 76 : 62, cause: e.id, beat: 'companies',
    subject: gap ? `${f.name} ${word} the quarter by ${gap}` : `${f.name} ${word} the quarter`,
    detail: ceo ? `${ceo} is chief of the ${trade} firm` : '',
    heat: beat ? 'Beat' : miss ? 'Miss' : 'In line',
    gossip: ceo ? `${ceo} at ${f.name} ${word} the number` : `${f.name} ${word} the number`,
    weekly: gap ? `${f.name} ${word} consensus by ${gap}. ${ceo ? ceo + ' keeps the seat.' : ''}`.trim() : `${f.name} ${word} the quarter.`,
  });
}
function cutOf(f: Firm | undefined): number {
  if (!f) return 0;
  const born = f.bornWorkers > 0 ? f.bornWorkers : f.workers;
  return Math.max(0, born - f.workers);
}
function humanOf(w: World, f: Firm | undefined, ev: number): string {
  if (!f) return '';
  const P = people(w);
  const last = (econ(w).P as { lastEv?: Int32Array }).lastEv;
  if (!last) return '';
  const me = playerIndex(w);
  if (me >= 0 && me < P.n && last[me] === ev) return P.name(me);
  for (const i of notables(w)) if (i >= 0 && i < P.n && last[i] === ev) return P.name(i);
  return '';
}
function firmNews(w: World, e: Ev): Item | null {
  const f = firmById(w, e.actor ?? '');
  const name = f?.name ?? e.actor ?? 'A firm';
  const trade = f ? sectorWord(f.sector) : '';
  const where = trade ? `${name}, the ${trade} firm in ${CITY}` : `${name} in ${CITY}`;
  if (e.kind === 'firm.layoffs' || e.kind === 'firm.failed') {
    const closed = e.kind === 'firm.failed' || /lays off its staff/i.test(e.msg);
    const cut = cutOf(f);
    const human = humanOf(w, f, e.id);
    // A slow trim is the weekly roundup. The tabloid only gets a shutdown or a named person.
    const tabloid = closed || !!human;
    const who = human ? `${human} is out at ${name}` : closed ? `${name} shuts and sends the staff home` : `${name} is cutting staff`;
    const born = f && f.bornWorkers > 0 ? f.bornWorkers : Math.max(1, (f?.workers ?? 0) + cut);
    const frac = cut / born;
    const weight = closed ? -Math.min(0.4, 0.16 + 0.5 * frac) : -Math.min(0.22, 0.05 + 0.65 * frac);
    return item({
      key: (closed ? 'shut:' : 'layoff:') + (f?.id ?? e.id), gap: 36,
      score: closed ? 86 : 54 + Math.min(18, Math.floor(cut / 4)) + (human ? 12 : 0),
      cause: e.id, beat: 'labour', tabloid,
      subject: closed ? `${name} lays off its staff` : human ? who : `${name} is cutting staff`,
      detail: where, heat: closed ? 'Shutdown' : 'Layoffs',
      gossip: who,
      weekly: `${where} cuts the payroll.`,
      issuer: f?.id ?? '', priced: f?.id ? weight : undefined,
    });
  }
  if (e.kind === 'firm.default' || e.kind === 'bond.default') {
    return item({
      key: 'default:' + (f?.id ?? e.actor ?? e.id), gap: 60, score: 90, cause: e.id, beat: 'credit',
      subject: `${name} defaults`,
      detail: clip(e.msg, 140), heat: 'Default',
      gossip: `${name} cannot pay what it owes`,
      weekly: `${where} defaults. ${curveShort(w)}`,
      issuer: f?.id ?? '', side: -1, weight: 1.2, priced: f?.id ? -0.32 : undefined,
    });
  }
  if (e.kind === 'firm.cashCrunch') {
    return item({
      key: 'crunch:' + (f?.id ?? e.id), gap: 30, score: 66, cause: e.id, beat: 'companies',
      subject: `${name} cannot meet the wage bill`,
      detail: clip(e.msg, 120), heat: 'Wages unpaid',
      gossip: `Wages went short at ${name}`,
      weekly: `${where} paid only part of the wage.`,
      issuer: f?.id ?? '', priced: f?.id ? -0.1 : undefined,
    });
  }
  if (e.kind === 'firm.ceoFired' || e.kind === 'firm.succession') {
    const fired = e.kind === 'firm.ceoFired';
    const who = personIndex(e.actor);
    return item({
      key: (fired ? 'chief:' : 'seat:') + (f?.id ?? e.id), gap: 40,
      score: fired ? 68 : 50, cause: e.id, beat: fired ? 'scandal' : 'companies',
      subject: fired ? `${name} removes its chief` : `${name} names a new chief`,
      detail: clip(e.msg, 140), heat: fired ? 'Chief out' : 'New chief',
      gossip: clip(e.msg, 160),
      weekly: `${where}: ${clip(e.msg, 120)}`,
      person: who,
    });
  }
  if (e.kind === 'firm.takeover' || e.kind === 'firm.bid' || e.kind === 'firm.control') {
    const hot = e.kind !== 'firm.bid';
    return item({
      key: e.kind + ':' + (e.actor ?? e.id), gap: 25, score: hot ? 84 : 70, cause: e.id, beat: 'companies',
      subject: clip(e.msg, 160), detail: '', heat: e.kind === 'firm.bid' ? 'A bid' : 'Takeover',
      gossip: clip(e.msg, 160), weekly: clip(e.msg, 180),
      player: mentionsPlayer(w, e),
    });
  }
  if (e.kind === 'firm.ipo') {
    return item({
      key: 'ipo:' + (f?.id ?? e.id), gap: 60, score: 58, cause: e.id, beat: 'markets',
      subject: `${name} comes to the market`,
      detail: clip(e.msg, 120), heat: 'Listing',
      gossip: `${name} is for sale to the street`,
      weekly: `${where} lists. ${clip(e.msg, 100)}`,
    });
  }
  return null;
}
function lawItem(w: World, e: Ev): Item | null {
  const who = personIndex(e.actor);
  const P = people(w);
  const name = who >= 0 && who < P.n ? P.name(who) : 'A name';
  const player = who >= 0 && who === playerIndex(w);
  const acquit = /acquitted/i.test(e.msg);
  const convict = /convicted/i.test(e.msg);
  const standing = convict ? -8 : acquit ? 3 : e.kind === 'law.charge' ? -6 : -3;
  return item({
    key: 'law:' + (e.actor ?? e.id) + ':' + e.kind, gap: 12,
    score: player ? 94 : 86, cause: e.id, beat: convict || e.kind === 'law.charge' ? 'scandal' : 'courts',
    subject: clip(e.msg, 170), detail: `${name} is named in ${CITY}`,
    heat: convict ? 'Guilty' : acquit ? 'Cleared' : e.kind === 'law.trial' ? 'On trial' : 'Charged',
    gossip: clip(e.msg, 170), weekly: clip(e.msg, 180),
    player, person: who, standing,
  });
}
function politicsItem(w: World, e: Ev): Item | null {
  if (e.kind === 'politics.government' && /stays in office/.test(e.msg)) return null;
  const who = personIndex(e.actor);
  const heat = e.kind === 'politics.election' ? 'The vote splits'
    : e.kind === 'politics.bribe' ? 'A bribe'
    : e.kind === 'politics.bailout' ? 'Bailout'
    : e.kind === 'politics.stimulus' ? 'A fight over the slump'
    : e.kind === 'politics.tax' ? 'Tax fight'
    : 'Politics';
  const score = e.kind === 'politics.election' ? 82
    : e.kind === 'politics.bribe' ? 78
    : e.kind === 'politics.bailout' ? 74
    : e.kind === 'politics.stimulus' ? 64
    : e.kind === 'politics.government' ? 70
    : 56;
  return item({
    key: e.kind === 'politics.tax' ? 'tax' : e.kind === 'politics.subsidy' ? 'subsidy' : e.kind + ':' + e.id,
    gap: e.kind === 'politics.tax' ? 40 : e.kind === 'politics.stimulus' ? 50 : 15,
    score, cause: e.id, beat: 'politics',
    subject: clip(e.msg, 170), detail: '', heat,
    gossip: clip(e.msg, 160), weekly: clip(e.msg, 180),
    person: who, standing: e.kind === 'politics.bribe' ? -6 : 0,
  });
}
function socialItem(w: World, e: Ev, notable: Set<number>): Item | null {
  const msg = e.msg;
  const wedding = /marry|marries/i.test(msg);
  const fall = /fall out/i.test(msg);
  const party = /gala|party|festival/i.test(msg) || e.kind === 'society.gala' || e.kind === 'society.party' || e.kind === 'society.meet';
  const rise = e.kind === 'society.rise' || e.kind === 'society.fall';
  if (!wedding && !fall && !party && !rise) return null;
  if ((e.kind === 'circle.held' || e.kind === 'circle.plan') && !wedding && !fall && !/gala/i.test(msg)) return null;
  const who = personIndex(e.actor);
  const rich = who >= 0 && notable.has(who);
  if ((wedding || fall) && !rich && !mentionsPlayer(w, e)) {
    const names = notableNames(w, notable);
    let hit = false;
    for (const n of names) if (n && msg.includes(n)) { hit = true; break; }
    if (!hit && wedding) return null;
    if (!hit && fall) return null;
  }
  const beat = wedding || party ? 'society' : 'scandal';
  const score = wedding ? 74 : fall ? 64 : rise ? 54 : e.kind === 'society.meet' || /gala/i.test(msg) ? 60 : 52;
  return item({
    key: wedding ? 'wed:' + e.id : fall ? 'fall:' + e.id : rise ? 'rich:' + (e.actor ?? e.id) : 'party:' + e.id,
    gap: wedding ? 30 : rise ? 20 : 8,
    score, cause: e.id, beat,
    subject: clip(msg.replace(/ You are invited\./g, '').replace(/ You stayed away\./g, '').replace(/ You went\./g, ''), 170),
    detail: '', heat: wedding ? 'A wedding' : fall ? 'A falling-out' : /gala/i.test(msg) ? 'Gala' : 'The party',
    gossip: clip(msg.replace(/ You are invited\./g, '').replace(/ You stayed away\./g, '').replace(/ You went\./g, ''), 180),
    weekly: clip(msg, 180),
    player: mentionsPlayer(w, e),
  });
}
function notableNames(w: World, notable: Set<number>): string[] {
  const P = people(w);
  const names: string[] = [];
  for (const i of notable) {
    if (i >= 0 && i < P.n && P.alive(i)) names.push(P.name(i));
    if (names.length >= 40) break;
  }
  return names;
}
function mentionsPlayer(w: World, e: Ev): boolean {
  const me = playerIndex(w);
  if (me < 0) return false;
  if (e.actor === people(w).id(me)) return true;
  const name = people(w).name(me);
  return name.length > 2 && e.msg.includes(name);
}
function shockItem(e: Ev): Item | null {
  const body = e.msg ? e.msg.charAt(0).toUpperCase() + e.msg.slice(1) : 'A shock hits the city';
  return item({
    key: 'shock:' + e.kind, gap: 40, score: 72, cause: e.id, beat: 'markets',
    subject: body, detail: CITY, heat: 'Shock',
    gossip: `${CITY} feels it. ${clip(body, 120)}`,
    weekly: `${CITY}. ${clip(body, 160)}`,
  });
}
function listedName(w: World, e: Ev): string {
  const f = firmById(w, e.actor ?? '');
  if (f) return f.name;
  const instr = /^eq:(\S+)/.exec(e.msg)?.[1] ?? '';
  const g = instr ? firmById(w, instr) : undefined;
  if (g) return g.name;
  if (e.actor === 'bank_1' || instr === 'bank_1') return 'the bank';
  return '';
}
function moveItem(w: World, e: Ev): Item | null {
  const m = /close (\d+) -> (\d+) \(([+-]?[\d.]+)%\)/.exec(e.msg);
  if (!m) return null;
  const pct = Number(m[3]);
  if (Math.abs(pct) < 4) return null;
  const name = listedName(w, e);
  if (!name) return null;
  const label = name === 'the bank' ? 'Bank' : name;
  const verb = pct < 0 ? 'fall' : 'rise';
  const abs = Math.abs(pct).toFixed(1);
  return item({
    key: 'mkt:' + (e.actor || e.id), gap: 8,
    score: 40 + Math.min(24, Math.abs(pct)), cause: e.id, beat: 'markets',
    subject: `${label} shares ${verb} ${abs}% to ${money(Number(m[2]))}`,
    detail: `The close in ${CITY}`, heat: pct < 0 ? 'Slide' : 'Jump',
    gossip: `${label} shares ${verb} hard`,
    weekly: `${label} shares ${verb} ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% on the week of the print.`,
  });
}
function fromEvent(w: World, e: Ev, notable: Set<number>): Item | null {
  if (e.kind.startsWith('media.') || e.kind === 'news.story' || e.kind === 'mkt.news') return null;
  if (e.kind === 'society.standing' || e.kind === 'society.rank' || e.kind === 'society.paper') return null;
  if (e.kind === 'society.holiday') {
    return item({
      key: 'holiday:' + e.id, gap: 300, score: 50, cause: e.id, beat: 'society',
      subject: e.msg, detail: '', heat: 'The city', gossip: e.msg, weekly: e.msg,
    });
  }
  if (e.kind === 'society.earnings') {
    return item({
      key: 'earnseason', gap: 80, score: 62, cause: e.id, beat: 'companies',
      subject: e.msg, detail: `Listed names in ${CITY} report this week`,
      heat: 'Earnings', gossip: e.msg, weekly: e.msg,
    });
  }
  if (e.kind === 'society.meeting') {
    return item({
      key: 'cbmeet', gap: 25, score: 58, cause: e.id, beat: 'rates',
      subject: 'The central bank meets today: the decision is at 14:00', detail: curveFull(w), heat: 'The bank meets',
      gossip: `The bank meets. ${curveShort(w)}`, weekly: `The central bank meets. ${curveFull(w)}`,
    });
  }
  if (e.kind === 'cb.rate') return rateItem(w, e);
  if (e.kind === 'cb.hold') return holdItem(w, e);
  if (e.kind === 'bond.yield') return yieldItem(w, e);
  if (e.kind === 'bond.spread') return spreadItem(w, e);
  if (e.kind === 'earnings.report') return earnItem(w, e);
  if (e.kind.startsWith('firm.') || e.kind === 'bond.default') return firmNews(w, e);
  if (e.kind === 'law.charge' || e.kind === 'law.trial' || e.kind === 'law.judgment' || e.kind === 'law.verdict') return lawItem(w, e);
  if (e.kind.startsWith('politics.')) return politicsItem(w, e);
  if (e.kind.startsWith('society.') || e.kind === 'circle.held' || e.kind === 'circle.plan') return socialItem(w, e, notable);
  if (e.kind.startsWith('shock.')) return shockItem(e);
  if (e.kind === 'mkt.move') return moveItem(w, e);
  if (e.kind === 'court.bankruptcy' || e.kind === 'player.bankrupt') {
    const who = personIndex(e.actor);
    const player = who >= 0 && who === playerIndex(w);
    return item({
      key: 'bust:' + (e.actor ?? e.id), gap: 30, score: player ? 96 : 88, cause: e.id, beat: 'scandal',
      subject: clip(e.msg, 170), detail: '', heat: 'Bankrupt',
      gossip: clip(e.msg, 170), weekly: clip(e.msg, 180),
      player, person: who, standing: -10,
    });
  }
  return null;
}
function clusterOf(wire: Wire, week: number, kind: string, cause: number): Cluster {
  if (!wire.clusters) wire.clusters = [];
  let c: Cluster | undefined;
  for (const row of wire.clusters) if (row.week === week && row.kind === kind) c = row;
  if (!c) {
    c = { week, kind, cuts: [], cause, published: false };
    wire.clusters.push(c);
  }
  if (cause >= 0 && c.cause > cause) c.cause = cause;
  return c;
}
function noteCut(w: World, wire: Wire, it: Item): void {
  const id = it.key.slice(it.key.indexOf(':') + 1);
  const f = firmById(w, id);
  const week = Math.floor(w.day / 7);
  const c = clusterOf(wire, week, 'layoff', it.cause);
  if (c.cuts.some((x) => x.id === id)) return;
  c.cuts.push({ id, name: f?.name ?? 'A firm', cut: cutOf(f), ev: it.cause });
}
/** A weekly roundup is the confirmed story. Price any name the cut itself has not already marked. */
function priceCuts(w: World, c: Cluster): void {
  if (!w.state.markets) return;
  for (const x of c.cuts) {
    if (!x.id) continue;
    const f = firmById(w, x.id);
    const born = f && f.bornWorkers > 0 ? f.bornWorkers : Math.max(1, (f?.workers ?? 0) + x.cut);
    const frac = x.cut / Math.max(1, born);
    const weight = -Math.min(0.22, 0.04 + 0.65 * frac);
    if (weight < -0.02) discountForNews(w, x.id, x.ev >= 0 ? x.ev : c.cause, weight);
  }
}
function roundup(w: World, c: Cluster, first: boolean): Item {
  const cuts = c.cuts.slice().sort((a, b) => b.cut - a.cut || (a.id < b.id ? -1 : 1));
  const show: string[] = [];
  const seenNames = new Set<string>();
  for (const x of cuts) {
    if (show.length >= 4 || !x.name || seenNames.has(x.name)) continue;
    seenNames.add(x.name);
    show.push(x.cut > 0 ? `${x.name} (${x.cut} fewer)` : x.name);
  }
  const more = cuts.length - show.length;
  const tail = more > 0 ? `, and ${more} more` : '';
  const lead = first
    ? `${countWord(cuts.length)} firms cut jobs as the year opens: ${show.join(', ')}${tail}`
    : `${countWord(cuts.length)} firms cut jobs: ${show.join(', ')}${tail}`;
  const hiring = hiringLine(w, new Set(cuts.map((x) => x.id)));
  return item({
    key: 'layoffweek:' + c.week, gap: 6, score: first ? 72 : 56, cause: c.cause, causes: [c.cause],
    beat: 'labour', subject: lead, detail: `Sales are below plan at each. ${hiring}`.trim(),
    heat: 'Layoffs', gossip: lead, weekly: `${lead} Sales are below plan at each. ${hiring}`.trim(),
  });
}
/** Firms that are short of hands this week, each with how many, so a cut and an opening are never mixed up. */
function hiringLine(w: World, not: Set<string>): string {
  const rows: { name: string; seats: number }[] = [];
  for (const f of econ(w).firms as Firm[]) {
    if (f.closed || not.has(f.id)) continue;
    const gap = firmGap(w, f as never);
    if (gap >= 2) rows.push({ name: f.name, seats: Math.floor(gap) });
  }
  rows.sort((a, b) => b.seats - a.seats || (a.name < b.name ? -1 : 1));
  if (!rows.length) return 'No firm is short of hands.';
  const top = rows.slice(0, 3).map((r) => `${r.name} (${r.seats} ${r.seats === 1 ? 'seat' : 'seats'})`);
  return `Taking people on: ${top.join(', ')}${rows.length > 3 ? ` and ${rows.length - 3} more` : ''}.`;
}
function dueRoundups(w: World, wire: Wire): Item[] {
  if (!wire.clusters) return [];
  const week = Math.floor(w.day / 7);
  const out: Item[] = [];
  const prior = wire.clusters.some((c) => c.kind === 'layoff' && c.published);
  for (const c of wire.clusters) {
    if (c.published || c.kind !== 'layoff') continue;
    if (c.week > week || (c.week === week && w.day % 7 !== 6)) continue;
    c.published = true;
    priceCuts(w, c);
    const bar = c.week === 0 ? 3 : 8;
    if (c.cuts.length >= bar) out.push(roundup(w, c, !prior && c.week === 0));
  }
  if (wire.clusters.length > 10) wire.clusters = wire.clusters.filter((c) => !c.published || c.week >= week - 1);
  return out;
}
function absorbLayoffs(w: World, wire: Wire, items: Item[]): Item[] {
  const rest: Item[] = [];
  for (const it of items) {
    if (it.key.startsWith('layoff:')) noteCut(w, wire, it);
    if (it.key.startsWith('layoff:') && !it.tabloid) continue;
    rest.push(it);
  }
  for (const it of dueRoundups(w, wire)) rest.push(it);
  return rest;
}
function earnLabel(subject: string): string {
  const i = subject.search(/ (beat|missed|met) /);
  return i > 0 ? subject.slice(0, i) : subject;
}
function foldDay(items: Item[]): Item[] {
  const earn: Item[] = [];
  const rest: Item[] = [];
  for (const it of items) (it.key.startsWith('earn:') ? earn : rest).push(it);
  if (!earn.length) return rest;
  if (earn.length === 1) { rest.push(earn[0]); return rest; }
  earn.sort((a, b) => b.score - a.score || a.cause - b.cause);
  const best = earn[0];
  const names: string[] = [];
  for (const it of earn) {
    const n = earnLabel(it.subject);
    if (!names.includes(n)) names.push(n);
  }
  const show = names.slice(0, 4);
  const tail = names.length > show.length ? ` and ${names.length - show.length} more` : '';
  rest.push(item({
    ...best, key: 'earnweek:' + best.cause, score: best.score + 4,
    subject: `${countWord(earn.length)} firms report: ${show.join(', ')}${tail}`,
    detail: best.subject, weekly: `${countWord(earn.length)} firms report: ${show.join(', ')}${tail} ${best.subject}`,
    causes: earn.slice(0, 6).map((it) => it.cause),
  }));
  return rest;
}
function thin(items: Item[]): Item[] {
  let bestMkt: Item | null = null;
  let bestRich: Item | null = null;
  for (const it of items) {
    if (it.key.startsWith('mkt:') && (!bestMkt || it.score > bestMkt.score)) bestMkt = it;
    if (it.key.startsWith('rich:') && (!bestRich || it.score > bestRich.score)) bestRich = it;
  }
  let layoffs = 0;
  const out: Item[] = [];
  const keys = new Set<string>();
  for (const it of items) {
    if (it.key.startsWith('mkt:') && it !== bestMkt) continue;
    if (it.key.startsWith('rich:') && it !== bestRich) continue;
    if ((it.beat === 'labour' || it.beat === 'layoffs') && !it.key.startsWith('shut:') && !it.key.startsWith('layoffweek:')) {
      if (layoffs >= 1) continue;
      layoffs++;
    }
    if (keys.has(it.key)) continue;
    keys.add(it.key);
    out.push(it);
  }
  return out;
}
function pull(w: World, wire: Wire): Ev[] {
  const out: Ev[] = [];
  const tip = w.events.count - 1;
  if (wire.cursor < 0) wire.cursor = tip;
  let id = wire.cursor + 1;
  if (tip - id > 12000) id = tip - 12000;
  for (; id <= tip; id++) {
    const e = w.events.get(id);
    if (e) out.push(e);
  }
  wire.cursor = tip;
  return out;
}
function growSpouse(wire: Wire, n: number): void {
  if (wire.spouse.length >= n) return;
  const a = new Int32Array(Math.max(n, wire.spouse.length * 2, 16));
  a.fill(-2);
  a.set(wire.spouse);
  wire.spouse = a;
}
function weddings(w: World, wire: Wire, notable: Set<number>): Item[] {
  const P = people(w);
  growSpouse(wire, P.n);
  const out: Item[] = [];
  for (let i = 0; i < P.n; i++) {
    const now = P.alive(i) ? P.spouse[i] : -1;
    const was = wire.spouse[i];
    wire.spouse[i] = now;
    if (was === -2 || was >= 0 || now < 0 || now === i || i > now) continue;
    if (!P.alive(now)) continue;
    if (!notable.has(i) && !notable.has(now) && i !== playerIndex(w) && now !== playerIndex(w)) continue;
    const cause = P.spouse[i] >= 0 ? (w.events.last('life.tally') ?? rootOf(w)) : rootOf(w);
    out.push(item({
      key: 'wedpair:' + i + ':' + now, gap: 60, score: 74, cause, beat: 'society',
      subject: `${P.name(i)} marries ${P.name(now)}`,
      detail: `A wedding on the list in ${CITY}`, heat: 'A wedding',
      gossip: `${P.name(i)} and ${P.name(now)} marry`,
      weekly: `${P.name(i)} marries ${P.name(now)}. The rich list will notice.`,
      player: i === playerIndex(w) || now === playerIndex(w),
      person: i, standing: 2,
    }));
  }
  return out;
}
function pickFirm(w: World, salt: number): Firm | undefined {
  const pool: Firm[] = [];
  for (const f of econ(w).firms as Firm[]) {
    if (f.closed || !f.listed || !listed(w, f.id)) continue;
    pool.push(f);
  }
  if (!pool.length) return undefined;
  return pool[mix(w.day, salt, pool.length) % pool.length];
}
function rumourItem(w: World, wire: Wire): Item | null {
  if (w.day < 20 || w.day % 60 !== 20) return null;
  if (wire.rumours.some((r) => !r.judged)) return null;
  const f = pickFirm(w, 9);
  if (!f) return null;
  const hike = Math.floor(w.day / 60) % 2 === 0;
  const short = curveShort(w);
  const claim = hike ? 'hike half a point' : 'cut a quarter point';
  return item({
    key: 'rumour:rate:' + w.day, gap: 50, score: 84, cause: w.events.last('cb.rate') ?? econ(w).rateEv ?? rootOf(w),
    beat: 'rumours', force: true,
    subject: `Sources say the bank will ${claim}, and ${f.name} is the share to sell`,
    detail: `One source, unchecked. ${short}`,
    heat: 'Rumour',
    gossip: `A whisper that the bank will ${hike ? 'hike' : 'cut'}, and ${f.name} will pay for it`,
    weekly: `An unchecked line: the bank will ${claim}, with ${f.name} the name to sell. ${curveFull(w)}`,
    issuer: f.id, side: hike ? -1 : 1, weight: 1.6, discount: true,
  });
}
function rememberRumour(w: World, wire: Wire, it: Item, story: number, outlet: number): void {
  const f = firmById(w, it.issuer);
  const hike = it.subject.includes('hike');
  wire.rumours.push({
    day: w.day, story, fromRate: econ(w).policyRate, issuer: it.issuer,
    firm: f?.name ?? it.issuer, outlet: outlet >= 0 ? outlet : 0, claim: hike ? 'hike' : 'cut',
    judged: false, discounted: it.discount,
  });
  if (wire.rumours.length > 12) wire.rumours = wire.rumours.filter((r) => !r.judged || w.day - r.day < 40);
}
function knownLink(w: World, me: number, prefer: number): number {
  const rows = contactsOf(w, me);
  if (prefer >= 0 && rows.some((c) => c.who === prefer)) return prefer;
  return rows.length ? rows[0].who : prefer;
}
function playerPiece(w: World): Item | null {
  const me = playerIndex(w);
  if (me < 0) return null;
  const P = people(w);
  if (!P.alive(me)) return null;
  const name = P.name(me);
  const dates = (w.state.society as { dates?: DateRow[] } | undefined)?.dates ?? [];
  let party: DateRow | undefined;
  for (const d of dates) {
    if (!d.invite || d.status === 'gone' || !d.who.includes(me)) continue;
    if (d.kind === 'gala') { party = d; break; }
    if (!party) party = d;
  }
  if (party) {
    const guests: string[] = [];
    for (const i of party.who) {
      if (i === me || i < 0 || i >= P.n || !P.alive(i)) continue;
      guests.push(P.name(i));
      if (guests.length >= 3) break;
    }
    const gala = party.kind === 'gala';
    const beside = guests.length ? ` Beside ${guests.join(', ')}.` : '';
    const subject = `${name} is on the list for ${gala ? 'the charity gala' : 'a society party'} at ${party.place}.${beside}`;
    return item({
      key: 'player:' + party.kind + ':' + party.eventId, gap: 40, score: 88,
      cause: party.eventId >= 0 ? party.eventId : rootOf(w), beat: 'player',
      subject, detail: '', heat: gala ? 'Gala' : 'The list', gossip: subject,
      weekly: subject, player: true, person: me, standing: 4,
      link: knownLink(w, me, party.host), linkDelta: 3, force: true, outletId: 'GAZETTE',
    });
  }
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const c of contactsOf(w, me)) if (!seen.has(c.who)) { seen.add(c.who); ids.push(c.who); }
  const bonds = (w.state.circle as { bonds?: { who: number }[] } | undefined)?.bonds ?? [];
  for (const b of bonds) if (!seen.has(b.who)) { seen.add(b.who); ids.push(b.who); }
  let friend = -1, role = '', best = -1;
  for (const who of ids) {
    if (who < 0 || who >= P.n || !P.alive(who)) continue;
    const seat = officeOf(w, who);
    if (seat) { friend = who; role = seat; break; }
    for (const f of econ(w).firms as Firm[]) {
      if (f.closed || f.ceo !== who) continue;
      const sc = f.workers + (f.listed ? 30 : 0);
      if (sc > best) { best = sc; friend = who; role = `chief of ${f.name}`; }
    }
  }
  if (friend >= 0 && role) {
    const subject = `${name} is close to ${P.name(friend)}, ${role}`;
    return item({
      key: 'player:friend', gap: 50, score: 80, cause: w.events.last('player.arrive') ?? rootOf(w),
      beat: 'player', subject, detail: `The quay has started to notice`, heat: 'A famous friend',
      gossip: subject, weekly: `${subject}. That is how a name gets into the column.`,
      player: true, person: me, standing: 3, link: friend, linkDelta: 4, force: true, outletId: 'GAZETTE',
    });
  }
  const rank = rankItem(w);
  if (rank) return rank;
  const stocks = (w.state.markets as { stocks?: { instr: string; issuer: string; last: number }[] } | undefined)?.stocks ?? [];
  let stake = 0, hold = '', qty = 0;
  for (const st of stocks) {
    const q = Math.floor(w.ledger.balS(P.slot[me], st.instr));
    if (q < 1 || st.last < 1) continue;
    const v = q * st.last;
    if (v > stake) {
      stake = v; qty = q;
      hold = firmById(w, st.issuer)?.name ?? st.issuer;
    }
  }
  if (stake >= econ(w).wage * 400 && hold) {
    const subject = `${name} holds ${qty} ${hold}, ${money(stake)} at the close`;
    return item({
      key: 'player:stake', gap: 40, score: 82, cause: w.events.last('mkt.move') ?? rootOf(w),
      beat: 'player', subject, detail: 'A position the street can see', heat: 'A big position',
      gossip: subject, weekly: subject, player: true, person: me, standing: 3, force: true, outletId: 'LEDGER',
    });
  }
  return null;
}
/** The player on the household rich list: a rank in the top 150. */
function rankItem(w: World): Item | null {
  const me = playerIndex(w);
  const soc = w.state.society as { rank?: number; worth?: number; households?: number; rankEvent?: number } | undefined;
  if (me < 0 || !soc?.rank || soc.rank <= 0 || soc.rank > 150) return null;
  const subject = `${people(w).name(me)} ranks ${soc.rank} of ${soc.households ?? 0} households, worth ${money(soc.worth ?? 0)}`;
  return item({
    key: 'player:rank', gap: 40, score: 78, cause: soc.rankEvent && soc.rankEvent >= 0 ? soc.rankEvent : rootOf(w),
    beat: 'player', subject, detail: '', heat: 'The list', gossip: subject,
    weekly: subject, player: true, person: me, standing: 2, force: true, outletId: 'HERALD',
  });
}
/** A large order by the player, read from their own log since the last day it was looked at. */
function tradeItem(w: World, wire: Wire): Item | null {
  const log = (w.state.player as { log?: { day: number; status: string; cmd?: { kind?: string; side?: string; instr?: string; qty?: number } }[] } | undefined)?.log ?? [];
  if (wire.logSeen < 0) { wire.logSeen = log.length; return null; }
  const me = playerIndex(w);
  const from = wire.logSeen;
  wire.logSeen = log.length;
  if (me < 0) return null;
  const stocks = (w.state.markets as { stocks?: { instr: string; issuer: string; last: number }[] } | undefined)?.stocks ?? [];
  const big = econ(w).wage * BIG_TRADE;
  let best: Item | null = null, bestValue = 0;
  for (let i = from; i < log.length; i++) {
    const row = log[i];
    const cmd = row.cmd;
    if (row.status !== 'accepted' || !cmd || cmd.kind !== 'order') continue;
    const qty = cmd.qty ?? 0;
    const st = stocks.find((s) => s.instr === cmd.instr);
    if (!st || qty < 1 || st.last < 1) continue;
    const value = qty * st.last;
    if (value < big || value <= bestValue) continue;
    bestValue = value;
    const firm = firmById(w, st.issuer)?.name ?? (st.issuer === 'bank_1' ? 'the bank' : st.issuer);
    const verb = cmd.side === 'sell' ? 'sells' : cmd.side === 'short' ? 'shorts' : 'buys';
    const subject = `${people(w).name(me)} ${verb} ${qty} shares of ${firm}, ${money(value)} at the close`;
    best = item({
      key: 'player:trade:' + i, gap: 40, score: 80, cause: rootOf(w),
      beat: 'markets', subject, detail: 'A large order on the tape', heat: 'A big trade',
      gossip: subject, weekly: subject, player: true, person: me, force: true, outletId: 'LEDGER',
    });
  }
  return best;
}
function judge(w: World, wire: Wire, fan: Fan): void {
  const rate = econ(w).policyRate;
  for (const r of wire.rumours) {
    if (r.judged) continue;
    if (w.day < r.day + 6 && (w.day + 1) % 30 !== 0) continue;
    r.judged = true;
    const hike = r.claim !== 'cut';
    const right = hike ? rate >= r.fromRate + 0.0049 : rate <= r.fromRate - 0.0024;
    const o = outlets(w)[r.outlet];
    const tabloid = o?.name ?? 'The paper';
    const said = hike ? 'hike half a point' : 'cut a quarter point';
    if (!right) {
      if (o) o.trust = Math.max(22, o.trust - 6);
      const it = item({
        key: 'correction:' + r.story, gap: 1, score: 92, cause: r.story, beat: 'rates', force: true, outletId: 'HERALD',
        subject: `Correction. ${tabloid} was wrong to say the bank would ${said}`,
        detail: `The policy rate is ${(rate * 100).toFixed(2)}%. ${curveTight(w)} The line on ${r.firm} is withdrawn.`,
        heat: 'Correction',
        gossip: `Correction. The rate story was wrong. The rate is ${(rate * 100).toFixed(2)}%`,
        weekly: `Correction. ${tabloid} said the bank would ${said}. It did not. ${curveFull(w)}`,
        issuer: r.issuer, side: hike ? 1 : -1, weight: 1.1, priced: hike ? 0.05 : -0.04,
      });
      emitItem(w, wire, it, fan);
      wire.yCorrect++;
    } else {
      if (o) o.trust = Math.min(o.serious ? 90 : 70, o.trust + 2);
      emitItem(w, wire, item({
        key: 'confirm:' + r.story, gap: 1, score: 70, cause: r.story, causes: [r.story, econ(w).rateEv].filter((x) => x >= 0), beat: 'rates', force: true, outletId: 'HERALD',
        subject: `${tabloid}'s rumour was right. The bank did ${said}. The policy rate is ${(rate * 100).toFixed(2)}%`,
        detail: curveFull(w), heat: 'Confirmed',
        gossip: `The whisper was right. The bank moved`,
        weekly: `The rumour stood. The rate is ${(rate * 100).toFixed(2)}%. ${curveFull(w)}`,
        issuer: r.issuer, priced: hike ? -0.1 : 0.08,
      }), fan);
    }
    if (!wire.released) {
      wire.released = true;
      const piece = wire.pending ?? playerPiece(w);
      wire.pending = null;
      if (piece && fresh(wire, piece.key, w.day, 8)) emitItem(w, wire, piece, fan);
    }
  }
}
function held(wire: Wire, it: Item): boolean {
  if (it.player && !it.force && !wire.released && it.score < 90) {
    if (!wire.pending || it.score > wire.pending.score) wire.pending = it;
    return true;
  }
  return false;
}
function publish(w: World, wire: Wire, items: Item[], fan: Fan, cap: number): void {
  const ranked = items.filter((it) => fresh(wire, it.key, w.day, it.gap));
  ranked.sort((a, b) => b.score - a.score || a.cause - b.cause || (a.key < b.key ? -1 : 1));
  const rumour = ranked.find((it) => it.key.startsWith('rumour:'));
  const page: Item[] = [];
  const seen = new Set<string>();
  for (const it of ranked) {
    if (page.length >= cap) break;
    if (held(wire, it) || seen.has(it.beat)) continue;
    seen.add(it.beat);
    page.push(it);
  }
  for (const it of ranked) {
    if (page.length >= cap) break;
    if (page.includes(it) || held(wire, it)) continue;
    page.push(it);
  }
  if (rumour && !page.includes(rumour) && !held(wire, rumour)) {
    if (page.length >= cap) page.pop();
    page.push(rumour);
  }
  page.sort((a, b) => b.score - a.score || a.cause - b.cause);
  for (const it of page) {
    const ev = emitItem(w, wire, it, fan);
    if (ev >= 0 && it.key.startsWith('rumour:')) rememberRumour(w, wire, it, ev, wire.lastOutlet);
  }
}

/** The bank's decision goes on the wire the minute it lands, not at the day's close. */
export function wireFlash(w: World, fan: Fan): void {
  const last = econ(w).cbLast;
  if (!last || last.day !== w.day) return;
  const wire = wireOf(w);
  if ((wire as { flashed?: number }).flashed === last.ev || wire.cursor < 0) return;
  (wire as { flashed?: number }).flashed = last.ev;
  const e = w.events.get(last.ev);
  if (!e) return;
  const it = e.kind === 'cb.rate' ? rateItem(w, e) : holdItem(w, e);
  if (it && fresh(wire, it.key, w.day, it.gap)) emitItem(w, wire, it, fan);
}

/** Tomorrow's meeting, for the evening wire: what the market expects. */
function previewItem(w: World): Item | null {
  const next = econ(w).cbNext;
  if (!next || next.day !== w.day + 1) return null;
  const pct = (r: number): string => (r * 100).toFixed(2);
  const move = Math.round((next.expect - next.from) * 10000);
  const want = move === 0 ? `a hold at ${pct(next.from)}%` : `a ${Math.abs(move)} basis point ${move > 0 ? 'hike' : 'cut'} to ${pct(next.expect)}%`;
  return item({
    key: 'cbpreview:' + next.day, gap: 20, score: 76, cause: next.causes[0] ?? econ(w).rateEv, beat: 'rates', outletId: 'HERALD', force: true,
    subject: `The central bank decides tomorrow at 14:00. The market expects ${want}`,
    detail: `Inflation and jobs set the rule: unemployment is ${(econ(w).unemployment * 100).toFixed(1)}%. Shares that live on credit (builders, furniture, cars) move most on a surprise; the bank's own shares the other way. ${curveShort(w)}`,
    heat: 'Rate day', gossip: `Tomorrow the bank meets. They expect ${want}`, weekly: `The bank meets tomorrow: ${want} expected.`,
  });
}

export function wireDay(w: World, fan: Fan): void {
  if (!w.state.media) return;
  const wire = wireOf(w);
  seat(w, wire);
  if (wire.cursor < 0) {
    wire.cursor = w.events.count - 1;
    wire.skim = wire.cursor;
    growSpouse(wire, people(w).n);
    const P = people(w);
    for (let i = 0; i < P.n; i++) wire.spouse[i] = P.alive(i) ? P.spouse[i] : -1;
    return;
  }
  resolveAsks(w, wire, fan);
  const notable = notables(w);
  const items: Item[] = [];
  if (wire.skim >= 0) {
    const stop = wire.skim;
    wire.skim = -1;
    for (let id = 0; id <= stop; id++) {
      const e = w.events.get(id);
      if (!e) continue;
      if (e.kind !== 'firm.layoffs' && e.kind !== 'firm.failed' && e.kind !== 'politics.government' && e.kind !== 'society.holiday' && e.kind !== 'society.earnings') continue;
      const it = fromEvent(w, e, notable);
      if (it) items.push(it);
    }
  }
  for (const e of pull(w, wire)) {
    const it = fromEvent(w, e, notable);
    if (it) items.push(it);
  }
  for (const it of weddings(w, wire, notable)) items.push(it);
  const rum = rumourItem(w, wire);
  if (rum) items.push(rum);
  const pre = previewItem(w);
  if (pre) items.push(pre);
  // A journalist asks for comment as soon as a story names the player, whether or not the paper runs it.
  for (const it of items) askFor(w, wire, it);
  const rich = rankItem(w);
  if (rich) askFor(w, wire, rich);
  const big = tradeItem(w, wire);
  if (big) askFor(w, wire, big);
  const cap = (w.day + 1) % 30 === 0 ? 2 : 3;
  publish(w, wire, thin(foldDay(absorbLayoffs(w, wire, items))), fan, cap);
}
export function wireMonth(w: World, fan: Fan): void {
  if (!w.state.media) return;
  const wire = wireOf(w);
  if (!wire.released && !wire.pending) wire.pending = playerPiece(w);
  judge(w, wire, fan);
  if (!wire.released && !wire.rumours.some((r) => !r.judged) && w.day >= 29) {
    wire.released = true;
    const piece = wire.pending ?? playerPiece(w);
    wire.pending = null;
    if (piece) emitItem(w, wire, piece, fan);
  }
}
export function wireStats(w: World): Record<string, number> {
  const wire = (w.state.media as { wire?: Wire } | undefined)?.wire;
  if (!wire) return { headlines: 0, corrections: 0, playerNews: 0 };
  const out = { headlines: wire.yHead, corrections: wire.yCorrect, playerNews: wire.yPlayer, asks: wire.yAsk };
  wire.yHead = 0; wire.yCorrect = 0; wire.yPlayer = 0; wire.yAsk = 0;
  return out;
}
