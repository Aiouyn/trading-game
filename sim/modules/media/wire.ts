// The city desk. A few ranked headlines a day, each in one outlet's voice, from events that already happened.
// A sensational paper sometimes prints a rumour. A sober paper corrects it when the figures disagree.
// Once the player is large enough, the gossip column names them, and a journalist asks for comment.
import { type World } from '../../kernel/index.ts';
import { type EconState } from '../economy/index.ts';
import { contactsOf, nudgeLink, nudgeStanding } from '../social/index.ts';
import { CITY, money, sectorWord } from '../social/words.ts';
import { discountForNews } from '../markets/index.ts';

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
interface Ask {
  day: number; until: number; player: number; journalist: number; outlet: number;
  about: string; cause: number; open: boolean;
}
interface Item {
  key: string; gap: number; score: number; cause: number; beat: string;
  subject: string; detail: string; heat: string; gossip: string; weekly: string;
  player: boolean; person: number; standing: number; link: number; linkDelta: number;
  issuer: string; side: number; weight: number; discount: boolean;
  outletId: string; force: boolean;
}
interface Wire {
  cursor: number; seen: Seen[]; spouse: Int32Array; desk: Desk[];
  rumours: Rumour[]; asks: Ask[]; pending: Item | null; released: boolean; playerDay: number;
  pricedDay: number; lastOutlet: number; yHead: number; yCorrect: number; yPlayer: number; yAsk: number;
}
interface Ev { id: number; day: number; kind: string; actor?: string; msg: string; causes: number[] }
interface Firm {
  id: string; idx: number; name: string; sector: string; workers: number; ceo: number;
  closed: boolean; listed: boolean; lastProfit: number;
}
interface People {
  n: number; spouse: Int32Array; employer: Int32Array; slot: Int32Array;
  alive(i: number): boolean; name(i: number): string; id(i: number): string;
}
interface DateRow {
  day: number; kind: string; place: string; who: number[]; title: string;
  invite: number; status: string; eventId: number; host: number;
}

const BEATS: Record<string, string[]> = {
  HERALD: ['rates', 'markets', 'courts', 'companies'],
  MERCURY: ['scandal', 'politics', 'layoffs', 'rumours'],
  LEDGER: ['companies', 'rates', 'markets', 'credit'],
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
  layoffs: ['MERCURY', 'HERALD', 'LEDGER'],
  society: ['GAZETTE', 'MERCURY', 'HERALD'],
  player: ['GAZETTE', 'MERCURY', 'HERALD'],
  rumours: ['MERCURY', 'GAZETTE', 'HERALD'],
};

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
    issuer: '', side: 0, weight: 0, discount: false, outletId: '', force: false,
    ...part,
  };
}
function voice(style: string, it: Item): string {
  if (style === 'tabloid') {
    const kick = it.heat || 'City';
    return clip(`${kick}. ${it.gossip || it.subject}`, 220);
  }
  if (style === 'gossip') return clip(it.gossip || it.subject, 220);
  if (style === 'weekly') return clip(it.weekly || (it.detail ? `${it.subject} ${it.detail}` : `${it.subject} The week in review.`), 240);
  return clip(it.detail ? `${it.subject}. ${it.detail}` : it.subject, 240);
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
function journalist(wire: Wire, outlet: number, beat: string): Desk | undefined {
  const rows = wire.desk.filter((d) => d.outlet === outlet);
  return rows.find((d) => d.beat === beat) ?? rows[0];
}
function emitItem(w: World, wire: Wire, it: Item, fan: Fan): number {
  const outs = outlets(w);
  if (!outs.length) return -1;
  const want = it.outletId ? outs.findIndex((o) => o.id === it.outletId) : -1;
  const order = want >= 0 ? [outs[want].id] : (DESK[it.beat] ?? DESK.companies);
  const ledgerDay = w.day % 7 === 2;
  let outlet = -1;
  for (const id of order) {
    const i = outs.findIndex((o) => o.id === id);
    if (i < 0 || !outs[i].journalists.length) continue;
    if (id === 'LEDGER' && !ledgerDay && it.score < 82 && !it.force && it.outletId !== 'LEDGER') continue;
    outlet = i;
    break;
  }
  if (outlet < 0) {
    for (let i = 0; i < outs.length; i++) if (outs[i].journalists.length) { outlet = i; break; }
  }
  if (outlet < 0) return -1;
  const desk = journalist(wire, outlet, it.beat);
  if (!desk) return -1;
  const o = outs[outlet];
  const P = people(w);
  const style = styleOf(o.id, o.serious);
  const body = voice(style, it);
  const byline = `${P.name(desk.person)}, ${desk.beat}`;
  const text = `${o.name}: ${body} — ${byline}`;
  const firms = econ(w).firms;
  const actor = o.firm >= 0 && o.firm < firms.length ? firms[o.firm].id : P.id(desk.person);
  wire.lastOutlet = outlet;
  const ev = w.events.emit('media.column', text, [it.cause >= 0 ? it.cause : rootOf(w)], actor);
  markSeen(wire, it.key, w.day);
  wire.yHead++;
  if (it.player) {
    wire.yPlayer++;
    wire.playerDay = w.day;
    if (it.person >= 0 && it.standing) nudgeStanding(w, it.person, it.standing);
    if (it.link >= 0 && it.linkDelta) nudgeLink(w, it.person, it.link, it.linkDelta);
    if (!it.key.startsWith('comment:')) fileAsk(w, wire, it, outlet, desk.person, ev);
  } else if (it.person >= 0 && it.standing) {
    nudgeStanding(w, it.person, it.standing);
  }
  if (it.issuer && it.discount && (wire.pricedDay < 0 || w.day - wire.pricedDay >= 360) && w.state.markets) {
    discountForNews(w, it.issuer, ev);
    wire.pricedDay = w.day;
  }
  if (it.issuer && it.side && it.weight) fan(it.issuer, it.side, o.trust, outlet, it.weight);
  return ev;
}
function fileAsk(w: World, wire: Wire, it: Item, outlet: number, journalist: number, cause: number): void {
  if (wire.asks.some((a) => a.open)) return;
  const P = people(w);
  const o = outlets(w)[outlet];
  if (!o || journalist < 0 || it.person < 0) return;
  const about = clip(it.subject, 120);
  const ev = w.events.emit('media.ask',
    `${P.name(journalist)} of ${o.name} asks ${P.name(it.person)} for comment on ${about}. A reply, a tip, or a talk is the comment.`,
    [cause], P.id(journalist));
  wire.asks.push({
    day: w.day, until: w.day + 5, player: it.person, journalist, outlet,
    about, cause: ev, open: true,
  });
  wire.yAsk++;
}
function quoteOf(w: World, ask: Ask): string {
  const P = people(w);
  const pid = P.id(ask.player);
  const log = (w.state.player as { log?: { day: number; cmd: { kind?: string; text?: string }; status: string }[] } | undefined)?.log ?? [];
  let quote = '';
  const from = Math.max(0, log.length - 40);
  for (let i = log.length - 1; i >= from; i--) {
    const row = log[i];
    if (row.day < ask.day) break;
    const kind = row.cmd?.kind;
    if (kind === 'reply' && row.cmd.text) { quote = row.cmd.text; break; }
    if (kind === 'tip') { quote = 'handed the paper a fact'; break; }
    if (kind === 'talk') { quote = 'spoke, and asked that it stay off the record'; break; }
  }
  if (quote) return clip(quote, 160);
  const n = w.events.count;
  for (let id = n - 1; id >= 0; id--) {
    const e = w.events.get(id);
    if (!e) continue;
    if (e.day < ask.day) break;
    if (e.actor !== pid) continue;
    if (e.kind === 'circle.reply') {
      const i = e.msg.indexOf('replies:');
      return clip(i >= 0 ? e.msg.slice(i + 8) : e.msg, 160);
    }
    if (e.kind === 'player.tip') return 'handed the paper a fact';
  }
  return '';
}
function resolveAsks(w: World, wire: Wire, fan: Fan): void {
  for (const ask of wire.asks) {
    if (!ask.open) continue;
    const quote = quoteOf(w, ask);
    const late = w.day > ask.until;
    if (!quote && !late) continue;
    ask.open = false;
    const P = people(w);
    const o = outlets(w)[ask.outlet];
    const journo = P.name(ask.journalist);
    const name = P.name(ask.player);
    const paper = o?.name ?? 'The paper';
    const subject = quote
      ? `${name} tells ${paper}: "${quote}"`
      : `${name} declined to comment`;
    const it = item({
      key: 'comment:' + ask.cause, gap: 1, score: 70, cause: ask.cause, beat: 'player',
      subject, detail: ask.about, heat: quote ? 'Comment' : 'No comment',
      gossip: subject, weekly: `${subject} The question was ${ask.about}`,
      player: true, person: ask.player, standing: quote ? 2 : -3, force: true,
      outletId: o?.id ?? 'GAZETTE',
    });
    emitItem(w, wire, it, fan);
  }
  if (wire.asks.length > 12) wire.asks = wire.asks.filter((a) => a.open || w.day - a.day < 20);
}
function rateItem(w: World, e: Ev): Item | null {
  const m = /policy rate ([\d.]+)% -> ([\d.]+)%/.exec(e.msg);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const verb = b > a + 0.001 ? 'raised' : b < a - 0.001 ? 'cut' : 'held';
  const heat = b > a ? 'Rate shock' : b < a ? 'Rate cut' : 'The bank holds';
  const curve = curveFull(w);
  const short = curveShort(w);
  const who = e.actor ? personIndex(e.actor) : -1;
  const named = who >= 0 ? people(w).name(who) : '';
  return item({
    key: 'rate:' + e.id, gap: 8, score: 80, cause: e.id, beat: 'rates',
    subject: `The central bank ${verb} the policy rate from ${a.toFixed(2)}% to ${b.toFixed(2)}%`,
    detail: curve, heat,
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
  const gap = pct ? `${pct[1]}% from consensus` : 'the street\'s number';
  const word = beat ? 'beat' : miss ? 'missed' : 'met';
  const P = people(w);
  const ceo = f.ceo >= 0 && f.ceo < P.n ? P.name(f.ceo) : '';
  const trade = sectorWord(f.sector);
  return item({
    key: 'earn:' + f.id, gap: 40, score: beat || miss ? 76 : 62, cause: e.id, beat: 'companies',
    subject: `${f.name} ${word} the quarter, ${gap}`,
    detail: ceo ? `${ceo} is chief of the ${trade} firm` : '',
    heat: beat ? 'Beat' : miss ? 'Miss' : 'In line',
    gossip: ceo ? `${ceo} at ${f.name} ${word} the number` : `${f.name} ${word} the number`,
    weekly: `${f.name} ${word} consensus by ${gap}. ${ceo ? ceo + ' keeps the seat.' : ''}`.trim(),
  });
}
function firmNews(w: World, e: Ev): Item | null {
  const f = firmById(w, e.actor ?? '');
  const name = f?.name ?? e.actor ?? 'A firm';
  const trade = f ? sectorWord(f.sector) : '';
  const where = trade ? `${name}, the ${trade} firm in ${CITY}` : `${name} in ${CITY}`;
  if (e.kind === 'firm.layoffs' || e.kind === 'firm.failed') {
    const closed = e.kind === 'firm.failed' || /lays off its staff/i.test(e.msg);
    return item({
      key: (closed ? 'shut:' : 'layoff:') + (f?.id ?? e.id), gap: 36,
      score: closed ? 86 : 60 + Math.min(16, Math.floor((f?.workers ?? 0) / 20)),
      cause: e.id, beat: 'layoffs',
      subject: closed ? `${name} lays off its staff` : `${name} is cutting staff`,
      detail: where, heat: closed ? 'Shutdown' : 'Layoffs',
      gossip: `${name} is letting people go`,
      weekly: `${where} cuts the payroll.`,
    });
  }
  if (e.kind === 'firm.default' || e.kind === 'bond.default') {
    return item({
      key: 'default:' + (f?.id ?? e.actor ?? e.id), gap: 60, score: 90, cause: e.id, beat: 'credit',
      subject: `${name} defaults`,
      detail: clip(e.msg, 140), heat: 'Default',
      gossip: `${name} cannot pay what it owes`,
      weekly: `${where} defaults. ${curveShort(w)}`,
      issuer: f?.id ?? '', side: -1, weight: 1.2,
    });
  }
  if (e.kind === 'firm.cashCrunch') {
    return item({
      key: 'crunch:' + (f?.id ?? e.id), gap: 30, score: 66, cause: e.id, beat: 'companies',
      subject: `${name} cannot meet the wage bill`,
      detail: clip(e.msg, 120), heat: 'Wages unpaid',
      gossip: `Wages went short at ${name}`,
      weekly: `${where} paid only part of the wage.`,
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
function moveItem(w: World, e: Ev): Item | null {
  const m = /close (\d+) -> (\d+) \(([+-]?[\d.]+)%\)/.exec(e.msg);
  if (!m) return null;
  const pct = Number(m[3]);
  if (Math.abs(pct) < 4) return null;
  const f = firmById(w, e.actor ?? '');
  const name = f?.name ?? 'A listed name';
  const verb = pct < 0 ? 'fall' : 'rise';
  const abs = Math.abs(pct).toFixed(1);
  return item({
    key: 'mkt:' + (f?.id ?? e.actor ?? e.id), gap: 8,
    score: 40 + Math.min(24, Math.abs(pct)), cause: e.id, beat: 'markets',
    subject: `${name} shares ${verb} ${abs}% to ${money(Number(m[2]))}`,
    detail: `The close in ${CITY}`, heat: pct < 0 ? 'Slide' : 'Jump',
    gossip: `${name} ${verb}s hard`,
    weekly: `${name} ${verb}s ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% on the week of the print.`,
  });
}
function fromEvent(w: World, e: Ev, notable: Set<number>): Item | null {
  if (e.kind.startsWith('media.') || e.kind === 'news.story' || e.kind === 'mkt.news') return null;
  if (e.kind === 'society.standing' || e.kind === 'society.rank' || e.kind === 'society.paper') return null;
  if (e.kind === 'cb.rate') return rateItem(w, e);
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
    if (it.beat === 'layoffs' && !it.key.startsWith('shut:')) {
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
  const soc = w.state.society as { rank?: number; worth?: number; households?: number; rankEvent?: number } | undefined;
  if (soc?.rank && soc.rank > 0 && soc.rank <= 150) {
    const subject = `${name} ranks ${soc.rank} of ${soc.households ?? 0} households, worth ${money(soc.worth ?? 0)}`;
    return item({
      key: 'player:rank', gap: 40, score: 78, cause: soc.rankEvent && soc.rankEvent >= 0 ? soc.rankEvent : rootOf(w),
      beat: 'player', subject, detail: '', heat: 'The list', gossip: subject,
      weekly: subject, player: true, person: me, standing: 2, force: true, outletId: 'HERALD',
    });
  }
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
        issuer: r.issuer, side: hike ? 1 : -1, weight: 1.1,
      });
      emitItem(w, wire, it, fan);
      wire.yCorrect++;
    } else {
      if (o) o.trust = Math.min(o.serious ? 90 : 70, o.trust + 2);
      emitItem(w, wire, item({
        key: 'confirm:' + r.story, gap: 1, score: 70, cause: r.story, beat: 'rates', force: true, outletId: 'HERALD',
        subject: `${tabloid}'s rumour was right. The bank did ${said}. The policy rate is ${(rate * 100).toFixed(2)}%`,
        detail: curveFull(w), heat: 'Confirmed',
        gossip: `The whisper was right. The bank moved`,
        weekly: `The rumour stood. The rate is ${(rate * 100).toFixed(2)}%. ${curveFull(w)}`,
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
function publish(w: World, wire: Wire, items: Item[], fan: Fan, cap: number): void {
  const ranked = items.filter((it) => fresh(wire, it.key, w.day, it.gap));
  ranked.sort((a, b) => b.score - a.score || a.cause - b.cause || (a.key < b.key ? -1 : 1));
  const rumour = ranked.find((it) => it.key.startsWith('rumour:'));
  const page: Item[] = [];
  for (const it of ranked) {
    if (page.length >= cap) break;
    if (it.player && !it.force && !wire.released && it.score < 90) {
      if (!wire.pending || it.score > wire.pending.score) wire.pending = it;
      continue;
    }
    page.push(it);
  }
  if (rumour && !page.includes(rumour)) {
    if (page.length >= cap) page.pop();
    page.push(rumour);
  }
  page.sort((a, b) => b.score - a.score || a.cause - b.cause);
  for (const it of page) {
    const ev = emitItem(w, wire, it, fan);
    if (ev >= 0 && it.key.startsWith('rumour:')) rememberRumour(w, wire, it, ev, wire.lastOutlet);
  }
}

export function wireDay(w: World, fan: Fan): void {
  if (!w.state.media) return;
  const wire = wireOf(w);
  seat(w, wire);
  if (wire.cursor < 0) {
    wire.cursor = w.events.count - 1;
    growSpouse(wire, people(w).n);
    const P = people(w);
    for (let i = 0; i < P.n; i++) wire.spouse[i] = P.alive(i) ? P.spouse[i] : -1;
    return;
  }
  resolveAsks(w, wire, fan);
  const notable = notables(w);
  const items: Item[] = [];
  for (const e of pull(w, wire)) {
    const it = fromEvent(w, e, notable);
    if (it) items.push(it);
  }
  for (const it of weddings(w, wire, notable)) items.push(it);
  const rum = rumourItem(w, wire);
  if (rum) items.push(rum);
  const cap = (w.day + 1) % 30 === 0 ? 2 : 3;
  publish(w, wire, thin(items), fan, cap);
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
  const out = { headlines: wire.yHead, corrections: wire.yCorrect, playerNews: wire.yPlayer };
  wire.yHead = 0; wire.yCorrect = 0; wire.yPlayer = 0; wire.yAsk = 0;
  return out;
}
