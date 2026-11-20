// An accepted invitation, played as an evening. On the day and at the hour, the dinner, the drinks, the business lunch
// or the party opens like a night at a venue: the host and the guests are at the table, you talk to whom you like,
// listen to the table, take or turn down what is put to you, and leave. What happens there changes things: the host
// and the guests think better or worse of you, the guests become people you know, a host can offer a seat at their firm,
// and a business lunch carries a real deal (a block of shares, a seat, a loan) that moves on the ledger if you say yes.
import type { World } from '../../kernel/index.ts';
import { DEP, pay, type EconState } from '../economy/index.ts';
import { acceptedPlans, type DueScene } from '../circle/plans.ts';
import { bondWord, circleHosted, circleMeet, circleMinute, circleRegard, circleTouch } from '../circle/index.ts';
import { nudgeLink, nudgeStanding } from '../social/index.ts';
import { notify } from '../circle/notices.ts';
import { seatOffer, takeSeat } from '../careers/jobs.ts';
import { quietFact } from '../social/index.ts';
import { clockText, dateText, usd } from '../player/gamedate.ts';
import { officeLine } from '../politics/index.ts';
import { lookOf, overheardOf } from './faces.ts';
import {
  absNow, CLOSE_AT, jobLine, leaveVenue, liveTable, relOf, seatBook, whoOf,
  type FaceView, type Res, type Table,
} from './world.ts';

export interface Deal {
  kind: 'shares' | 'seat' | 'loan'; text: string; from: number; firm: number;
  instr?: string; qty?: number; px?: number; cents?: number; occ?: number; wage?: number; role?: string;
  answer?: 'yes' | 'no' | 'failed'; result?: string;
}
export interface Scene {
  key: string; kind: string; what: string; place: string; title: string; host: number; start: number;
  eventId: number; deal?: Deal; ended?: boolean; notes: string[]; summary?: string; hosted?: boolean;
}

const econ = (w: World): EconState => w.state.economy as EconState;
const no = (text: string): Res => ({ ok: false, text });
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}
const an = (w: string): string => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
const first = (w: World, i: number): string => econ(w).P.name(i).split(' ')[0];

const WHAT: Record<string, string> = {
  dinner: 'dinner', drinks: 'drinks', deal: 'a business lunch', birthday: 'a birthday', leaving: 'leaving drinks',
  wedding: 'a wedding', party: 'a party', gala: 'the charity gala', firstday: 'your first day',
};
/** Which of the six rooms prices a round at this kind of evening. */
const PRICE_ROOM: Record<string, number> = { firstday: 1, dinner: 2, wedding: 2, gala: 2, party: 2, deal: 1, drinks: 0, birthday: 0, leaving: 0 };

function clockNow(w: World): number { return absNow(w) % 1440; }
function played(w: World, seat: string): Record<string, number> { return (seatBook(w, seat).played ??= {}); }

/** Today's accepted invitations the player has not yet sat down to. */
export function dueScenes(w: World, seat: string): DueScene[] {
  const done = played(w, seat);
  return acceptedPlans(w, w.day, w.day).filter((x) => done[x.key] === undefined);
}

function arrival(w: World, sc: Scene, host: number): string {
  const s = econ(w), P = s.P;
  if (sc.hosted) {
    return sc.kind === 'gala'
      ? 'The room you booked is lit and the band is tuning. Your guests come up the stairs in twos, and every one of them looks for you first.'
      : 'The table you booked is laid for your guests, and the first of them is already shaking off the rain at the door.';
  }
  if (sc.kind === 'firstday') {
    const fi = host >= 0 ? P.employer[host] : -1;
    const name = fi >= 0 ? s.firms[fi].name : sc.place;
    const office = officeLine(w, host);
    return office
      ? `${first(w, host)} ${office} and still meets new people at the door. A pass with your name on it is waiting, and so is a desk.`
      : fi >= 0 && s.firms[fi].ceo === host
        ? `${first(w, host)} runs ${name} and still meets new people at the door. A pass with your name on it is waiting, and so is a desk.`
        : `${first(w, host)}, your manager, meets you at the front of ${name} with a pass that already has your name on it.`;
  }
  if (sc.kind === 'party' && /hill/.test(sc.place)) return `The drive up to ${sc.place} is lined with cars. ${first(w, host)} is on the terrace, receiving people as if it were a small court.`;
  const h = first(w, host);
  const e = host >= 0 && host < P.n ? P.employer[host] : -1;
  const firm = e >= 0 ? s.firms[e].name : '';
  switch (sc.kind) {
    case 'dinner': return `${h} has the table by the window and stands to greet you.`;
    case 'drinks': return `${h} waves you over from the corner and has already ordered for you.`;
    case 'deal': return `${h} is at a quiet table with a folder that stays shut until the coffee comes.`;
    case 'birthday': return `${h} is the one being sung to, and pulls you into the circle at the door.`;
    case 'leaving': return `${h} is on the last day${firm ? ` at ${firm}` : ''}, and the table is loud with it.`;
    case 'wedding': return `The chairs are in rows and ${h} is too nervous to sit in one.`;
    default: return `The rooms are full and warm. ${h} is working the room and catches your eye.`;
  }
}

/** What a host can put on the table at a business lunch: a seat, a block of their shares, or a loan. */
function makeDeal(w: World, me: number, host: number): Deal | undefined {
  const s = econ(w), P = s.P, L = w.ledger;
  if (host < 0 || host >= P.n || !P.alive(host)) return undefined;
  const h = first(w, host);
  const he = P.employer[host];
  const prem = (w.state.labour as { prem?: ArrayLike<number> } | undefined)?.prem;
  const mine = P.employer[me] >= 0 ? Math.round(P.skill[me] * s.wage * 7 * (prem && prem[P.employer[me]] > 0 ? prem[P.employer[me]] : 1)) : 0;
  if (he >= 0) {
    const o = seatOffer(w, me, he);
    if (o && (P.employer[me] < 0 || o.wage > mine * 1.05)) {
      const f = s.firms[he];
      return {
        kind: 'seat', from: host, firm: he, occ: o.occ, wage: o.wage, role: o.role,
        text: `${h} opens the folder. "${f.name} needs ${an(o.role)}, and I would rather it were someone I have eaten with. ${usd(o.wage)} a week${mine ? `, against the ${usd(mine)} you make now` : ''}. Start when you like."`,
      };
    }
  }
  const stocks = (w.state.markets as { stocks?: { instr: string; issuer: string; last: number }[] } | undefined)?.stocks ?? [];
  let best: { instr: string; issuer: string; last: number; qty: number } | undefined;
  for (const st of stocks) {
    if (!(st.last > 0) || st.issuer === 'bank_1') continue;
    const qty = Math.floor(L.balance(P.id(host), st.instr));
    if (qty < 10) continue;
    if (!best || qty * st.last > best.qty * best.last) best = { ...st, qty };
  }
  const cash = Math.floor(L.balance(P.id(me), DEP));
  if (best) {
    const px = Math.max(1, Math.round(best.last * 0.95));
    const budget = Math.min(cash * 0.5, s.wage * 7 * 30);
    const qty = Math.min(Math.floor(best.qty * 0.3), Math.floor(budget / px));
    const f = s.firms.find((x) => x.id === best!.issuer);
    if (qty >= 5 && f) {
      const hostCash = Math.floor(L.balance(P.id(host), DEP));
      const why = hostCash < s.wage * 30 ? 'They need the cash more than the shares this month.' : 'They want part of the stake in friendly hands.';
      return {
        kind: 'shares', from: host, firm: f.idx, instr: best.instr, qty, px,
        text: `${h} gets to the point over coffee. "I am selling part of my stake in ${f.name}: ${qty} shares at ${usd(px)} each, five per cent under the last trade of ${usd(best.last)}. That is ${usd(qty * px)}, settled tonight, no broker." ${why}`,
      };
    }
  }
  const hostCash = Math.floor(L.balance(P.id(host), DEP));
  const give = Math.min(Math.floor(hostCash * 0.2), Math.round(s.wage * 7 * 6));
  if (give >= 20000) {
    return {
      kind: 'loan', from: host, firm: -1, cents: give,
      text: `${h} taps the table. "If you are short of working money, I can lend you ${usd(give)} for six months, with four per cent on top at the end. Cheaper than the bank, and I do not send letters."`,
    };
  }
  return undefined;
}

/** Sit down to an accepted invitation. `arg` picks one by number when there are two today. */
export function attend(w: World, seat: string, arg = ''): Res {
  const me = whoOf(w, seat);
  const s = econ(w), P = s.P;
  if (me < 0 || !P.alive(me)) return no('nobody is going anywhere');
  const list = dueScenes(w, seat);
  if (!list.length) {
    const next = acceptedPlans(w, w.day + 1, w.day + 40)[0];
    return no(next ? `you have nothing to go to today. Next is ${WHAT[next.kind] ?? next.kind} at ${next.place} on ${dateText(next.day)} at ${clockText(next.minute)}` : 'you have no accepted invitation for today. Say yes to one in your messages first');
  }
  const n = Number(arg);
  const pick = Number.isInteger(n) && n >= 1 && n <= list.length ? list[n - 1] : list[0];
  const now = clockNow(w);
  const what = pick.hosted ? `your ${pick.kind === 'gala' ? 'gala' : 'dinner'}` : WHAT[pick.kind] ?? pick.kind;
  if (now < pick.minute - 90) return no(`${what} at ${pick.place} starts at ${clockText(pick.minute)}. It is ${clockText(now)} now; you can go from an hour and a half before`);
  if (now > pick.minute + 240) return no(`${what} at ${pick.place} is over: it started at ${clockText(pick.minute)}`);
  const sb = seatBook(w, seat);
  let before = '';
  if (liveTable(w, sb)) {
    const r = leaveVenue(w, seat);
    before = r.ok ? ` ${r.text}` : '';
  }
  const faces: number[] = [];
  for (const i of pick.hosted ? pick.who : [pick.host, ...pick.who]) {
    if (i === me || i < 0 || i >= P.n || !P.alive(i) || faces.includes(i)) continue;
    faces.push(i);
    if (faces.length >= 7) break;
  }
  if (!faces.length) return no(`nobody came to ${what} at ${pick.place}`);
  const open = absNow(w);
  const nextClose = (Math.floor(open / 1440) + (open % 1440 >= CLOSE_AT ? 1 : 0)) * 1440 + CLOSE_AT;
  const closeAbs = Math.min(nextClose, open + 210);
  const sc: Scene = { key: pick.key, kind: pick.kind, what, place: pick.place, title: pick.title, host: pick.host, start: pick.minute, eventId: pick.eventId, notes: [], hosted: !!pick.hosted };
  const t: Table = {
    day: w.day, venue: PRICE_ROOM[pick.kind] ?? 2, faces, asked: [], rounds: 0, listened: false, spent: 0,
    open: true, openAbs: open, closeAbs, tonight: {}, minutes: 0, scene: sc,
  };
  played(w, seat)[pick.key] = w.day;
  sb.table = t;
  sb.lastOut = w.day;
  if (pick.kind === 'deal') sc.deal = makeDeal(w, me, pick.host);
  const guests = faces.filter((i) => i !== pick.host).map((i) => P.name(i));
  const ev = pick.hosted ? w.events.emit('scene.open', `${P.name(me)} hosts ${what.replace(/^your /, 'a ')} at ${pick.place} for ${guests.join(', ')}`, [pick.eventId >= 0 ? pick.eventId : w.genesis], P.id(me)) : w.events.emit('scene.open', `${P.name(me)} arrives at ${pick.place} for ${what} with ${P.name(pick.host)}${guests.length ? `, ${guests.slice(0, 3).join(', ')}${guests.length > 3 ? ` and ${guests.length - 3} more` : ''}` : ''}`, [pick.eventId >= 0 ? pick.eventId : w.genesis], P.id(me));
  sc.eventId = ev;
  const views = sceneFaces(w, seat, t);
  const lines = [
    ...views.map((f) => `  ${f.n}. ${f.text}.`),
    sc.deal ? `On the table: ${sc.deal.text} Say deal yes or deal no.` : '',
    'Talk to someone by number, listen to the table, or leave when you are ready. The clock waits while you are here.',
  ].filter(Boolean);
  const text = `${dateText(w.day)}, ${clockText(open % 1440)}.${before} You arrive at ${pick.place} for ${what}${pick.treat && pick.kind !== 'firstday' && !pick.hosted ? `, on ${first(w, pick.host)}` : ''}. ${arrival(w, sc, pick.host)}`;
  notify(w, {
    kind: 'scene', title: `${what.charAt(0).toUpperCase()}${what.slice(1)} at ${pick.place} has begun`,
    text: `${arrival(w, sc, pick.host)} At the table: ${faces.map((i) => P.name(i)).join(', ')}.${sc.deal ? ` ${sc.deal.text}` : ''}`,
    reason: pick.hosted ? `You booked it for ${dateText(pick.day)} at ${clockText(pick.minute)}, and ${faces.length} said they would come.` : pick.kind === 'firstday' ? 'You accepted the seat, and today is the start date.' : `You said yes to ${P.name(pick.host)}'s invitation for ${dateText(pick.day)} at ${clockText(pick.minute)}.`,
    cause: ev, from: pick.hosted ? faces[0] : pick.host, urgent: true,
    actions: [{ label: `Talk to ${first(w, pick.hosted ? faces[0] : pick.host)}`, line: 'talk 1' }, ...(sc.deal ? [{ label: 'Take the deal', line: 'deal yes' }] : []), { label: 'Listen to the table', line: 'listen' }, { label: 'Leave', line: 'leave' }],
  });
  return { ok: true, pause: true, eventId: ev, minutes: 5, text, lines };
}

/** The people at an invitation's table: the host introduces everyone, so every face has a name. */
export function sceneFaces(w: World, seat: string, t: Table): FaceView[] {
  const sc = t.scene!;
  const P = econ(w).P;
  const sb = seatBook(w, seat);
  return t.faces.map((i, k) => {
    const rel = relOf(sb, i);
    const reg = circleRegard(w, i);
    const word = reg.slot >= 0 ? bondWord(reg.score) : '';
    const host = i === sc.host;
    const look = lookOf(w, i, k);
    const heard = overheardOf(w, i, -1, k);
    const known = rel ? `you have talked ${rel.depth <= 1 ? 'once' : `${rel.depth} times`}` : host ? 'your host' : `${first(w, sc.host)} introduces you`;
    const text = `${P.name(i)}, who ${jobLine(w, i)}${host ? ': your host' : ''}. ${rel || host ? (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : known) : `${look}. ${known}`}`;
    return { n: k + 1, who: i, name: P.name(i), text, look: rel || host ? '' : look, heard, news: '', known, word, recognises: false, exchanges: rel?.depth ?? (reg.slot >= 0 && reg.score > 0 ? 1 : 0), regular: false };
  });
}

/** After a word at the table: a host (or a chief at the table) whose firm is short of hands may offer you the seat. */
export function sceneTalkExtra(w: World, seat: string, t: Table, who: number, topic: string, ev: number): string {
  const sc = t.scene;
  if (!sc || sc.deal || sc.ended) return '';
  void ev;
  const s = econ(w), P = s.P;
  const me = whoOf(w, seat);
  const e = P.employer[who];
  if (e < 0) return '';
  const f = s.firms[e];
  const chief = f.ceo === who;
  if (who !== sc.host && !chief) return '';
  if (topic !== 'work' && topic !== 'inside' && topic !== 'money') return '';
  if (circleRegard(w, who).score < 26) return '';
  const o = seatOffer(w, me, e);
  if (!o) return '';
  if (P.employer[me] >= 0) {
    const prem = (w.state.labour as { prem?: ArrayLike<number> } | undefined)?.prem;
    const mine = Math.round(P.skill[me] * s.wage * 7 * (prem && prem[P.employer[me]] > 0 ? prem[P.employer[me]] : 1));
    if (o.wage <= mine * 1.05) return '';
  }
  sc.deal = {
    kind: 'seat', from: who, firm: e, occ: o.occ, wage: o.wage, role: o.role,
    text: `${first(w, who)} looks at you for a moment. "We are short of hands at ${f.name}. If you want it, there is a seat as ${an(o.role)} at ${usd(o.wage)} a week. Say the word."`,
  };
  return `${sc.deal.text} (deal yes or deal no)`;
}

/** Answer what was put to you at the table. */
export function dealAnswer(w: World, seat: string, answer: string): Res {
  const sb = seatBook(w, seat);
  const t = liveTable(w, sb);
  const sc = t?.scene;
  const d = sc?.deal;
  if (!t || !sc || !d) return no('nobody at this table has put a deal to you');
  if (d.answer) return no(`you have already answered: ${d.result ?? d.answer}`);
  const a = answer.trim().toLowerCase();
  const yes = a === 'yes' || a === 'y' || a === 'take' || a === 'accept';
  if (!yes && a !== 'no' && a !== 'n' && a !== 'decline') return no('say deal yes or deal no');
  const s = econ(w), P = s.P, L = w.ledger;
  const me = whoOf(w, seat);
  const from = d.from;
  const h = first(w, from);
  if (!yes) {
    d.answer = 'no';
    d.result = `you turned down ${h}'s offer`;
    const ev = w.events.emit('scene.deal', `${P.name(me)} turns down ${P.name(from)}'s offer at ${sc.place} || ${d.kind}`, [sc.eventId], P.id(me));
    circleTouch(w, from, -1, `You turned down their offer at ${sc.place}`, ev);
    sc.notes.push(`You turned down ${h}'s offer.`);
    return { ok: true, eventId: ev, minutes: 5, text: `${h} shrugs. "Fair enough. The offer was there, and it will not be the last one."` };
  }
  const fail = (why: string): Res => {
    d.answer = 'failed';
    d.result = why;
    sc.notes.push(`The deal with ${h} fell through: ${why}.`);
    return { ok: true, minutes: 5, text: `It falls through: ${why}.` };
  };
  if (d.kind === 'seat') {
    const r = takeSeat(w, me, d.firm, d.occ ?? 0, d.wage ?? 0, sc.eventId, `${P.name(from)} offered the seat across the table at ${sc.place}`);
    if ('why' in r) return fail(r.why);
    d.answer = 'yes';
    d.result = r.text;
    circleTouch(w, from, 6, `You took the seat they offered at ${sc.place}`, r.eventId);
    sc.notes.push(r.text);
    return { ok: true, eventId: r.eventId, minutes: 5, text: `You shake on it. ${r.text} ${h} looks pleased with themselves.` };
  }
  if (d.kind === 'shares' && d.instr && d.qty && d.px) {
    const total = d.qty * d.px;
    if (Math.floor(L.balance(P.id(me), DEP)) < total) return fail(`you do not have ${usd(total)} in your account`);
    if (Math.floor(L.balance(P.id(from), d.instr)) < d.qty) return fail(`${h} no longer holds the shares`);
    const name = s.firms[d.firm]?.name ?? 'the firm';
    const ev = w.events.emit('scene.deal', `${P.name(me)} buys ${d.qty} ${name} shares from ${P.name(from)} at ${usd(d.px)} || a private sale at ${sc.place}`, [sc.eventId], P.id(me));
    if (!pay(w, P.id(me), P.id(from), total, 'scene.deal', ev)) return fail('the money did not move');
    if (!L.move(d.instr, P.id(from), P.id(me), d.qty, 'scene.deal', ev)) {
      pay(w, P.id(from), P.id(me), total, 'scene.deal', ev);
      return fail('the shares could not be transferred');
    }
    d.answer = 'yes';
    d.result = `you bought ${d.qty} ${name} shares from ${P.name(from)} for ${usd(total)}`;
    circleTouch(w, from, 5, `You bought their ${name} shares at ${sc.place}`, ev);
    sc.notes.push(`You bought ${d.qty} ${name} shares from ${h} at ${usd(d.px)}, ${usd(total)} in all.`);
    return { ok: true, eventId: ev, minutes: 5, text: `You shake on it. ${d.qty} ${name} shares move to your account and ${usd(total)} to ${h}'s.` };
  }
  if (d.kind === 'loan' && d.cents) {
    if (Math.floor(L.balance(P.id(from), DEP)) < d.cents) return fail(`${h} cannot spare it after all`);
    const ev = w.events.emit('venue.loan', `${P.name(from)} lends ${usd(d.cents)} || agreed at ${sc.place}`, [sc.eventId], P.id(me));
    if (!pay(w, P.id(from), P.id(me), d.cents, 'venue.loan', ev)) return fail('the money did not move');
    sb.loans.push({ who: from, cents: d.cents, due: w.day + 180, late: false, ev });
    d.answer = 'yes';
    d.result = `${P.name(from)} lent you ${usd(d.cents)} until ${dateText(w.day + 180)}`;
    circleTouch(w, from, 3, `They lent you money at ${sc.place}`, ev);
    sc.notes.push(`${h} lent you ${usd(d.cents)}, due back with four per cent on ${dateText(w.day + 180)}.`);
    return { ok: true, eventId: ev, minutes: 5, text: `${h} writes it on a napkin and signs it. ${usd(d.cents)} lands in your account, due back on ${dateText(w.day + 180)} with four per cent on top.` };
  }
  return fail('the terms no longer hold');
}

/** Listening at an invitation's table: people say more over a meal than at a bar. */
export function sceneListen(w: World, seat: string, t: Table, minutes: number): Res {
  const sc = t.scene!;
  const s = econ(w), P = s.P;
  const me = whoOf(w, seat);
  if (mix(me, w.day, 37) % 100 < 55) {
    for (const i of t.faces) {
      const f = quietFact(w, i);
      if (!f) continue;
      const st = w.state.player as { seat?: Record<string, { heard: { factId: number; eventId: number; from: number; day: number }[] }> } | undefined;
      const heard = st?.seat?.[seat]?.heard;
      if (heard && !heard.some((h) => h.factId === f.id)) heard.push({ factId: f.id, eventId: f.eventId, from: i, day: w.day });
      const ev = w.events.emit('venue.overheard', `Said over ${sc.what} at ${sc.place}: ${f.msg}`, [f.eventId], P.id(me));
      sc.notes.push(`${first(w, i)} let something slip.`);
      return { ok: true, eventId: ev, minutes, text: `The table loosens up. ${P.name(i)}, who ${jobLine(w, i)}, says more than they mean to: ${f.msg} Said among friends, not printed: trading on it is your own risk.` };
    }
  }
  const scraps: string[] = [];
  for (let k = 0; k < t.faces.length && scraps.length < 3; k++) {
    const line = overheardOf(w, t.faces[k], -1, k);
    if (!scraps.includes(line)) scraps.push(`${first(w, t.faces[k])}: ${line}`);
  }
  return { ok: true, minutes, text: `You let the talk go round the table for half an hour. ${scraps.join(' ')}` };
}

/** The evening is over: the host and the guests take stock of you, and the player hears how it went. */
export function finishScene(w: World, seat: string, t: Table): { text: string; lines: string[]; eventId?: number } {
  const sc = t.scene;
  if (!sc || sc.ended) return { text: sc?.summary ?? '', lines: [] };
  sc.ended = true;
  t.open = false;
  const s = econ(w), P = s.P;
  const me = whoOf(w, seat);
  const sb = seatBook(w, seat);
  const host = sc.host;
  const talkedHost = t.asked.includes(host);
  const guests = t.asked.filter((i) => i !== host);
  const fresh = guests.filter((i) => relOf(sb, i)?.first === w.day);
  if (sc.hosted) return finishHosted(w, t, sc, me);
  if (sc.kind === 'firstday') return finishFirstDay(w, t, sc, me);
  const ev = w.events.emit('scene.held', `${P.name(me)} spends ${sc.what} at ${sc.place} with ${P.name(host)} || ${talkedHost ? 'talked with the host' : 'hardly spoke to the host'}, ${guests.length} guests, ${sc.deal?.answer ?? 'no deal'}`, [sc.eventId], P.id(me));
  if (P.alive(host)) circleTouch(w, host, talkedHost ? 3 : -3, talkedHost ? `A good evening at ${sc.place}` : `You hardly spoke to them at their own table`, ev);
  for (const i of guests) if ((t.tonight[i] ?? 0) >= 2) circleTouch(w, i, 2, `You hit it off at ${sc.place}`, ev);
  const out: string[] = [];
  out.push(talkedHost ? `${first(w, host)} walks you to the door${P.alive(host) ? ` (${bondWord(circleRegard(w, host).score)})` : ''}.` : `You barely spoke to ${first(w, host)}, and it was their evening.`);
  if (guests.length) out.push(`You talked with ${guests.map((i) => P.name(i)).join(', ')}.`);
  if (fresh.length) out.push(`${fresh.length === 1 ? `${P.name(fresh[0])} is` : `${fresh.length} people are`} now in your book of people you know.`);
  if (sc.deal && !sc.deal.answer) out.push(`${first(w, sc.deal.from)}'s offer is left on the table.`);
  out.push(...sc.notes);
  const text = `You leave ${sc.place} at ${clockText(absNow(w) % 1440)}. ${out.join(' ')}`;
  sc.summary = text;
  notify(w, {
    kind: 'scene', title: `After ${sc.what} at ${sc.place}`, text: out.join(' '),
    reason: `You went to ${P.name(host)}'s ${sc.what.replace(/^(a|an|the) /, '')} on ${dateText(w.day)}.`, cause: ev, from: host,
    actions: [{ label: 'See who you know', line: 'known' }],
  });
  return { text, lines: [], eventId: ev };
}

/** The first day: everyone at the table is now a colleague in your book, and the manager is your boss. */
function finishFirstDay(w: World, t: Table, sc: Scene, me: number): { text: string; lines: string[]; eventId?: number } {
  const P = econ(w).P;
  const host = sc.host;
  const ev = w.events.emit('scene.held', `${P.name(me)} spends a first day at ${sc.place} || met ${t.faces.length} people, talked to ${t.asked.length}`, [sc.eventId], P.id(me));
  const met: string[] = [];
  for (const i of t.faces) {
    if (!P.alive(i)) continue;
    const boss = i === host;
    circleMeet(w, i, 'colleague', boss ? 'boss' : '', boss ? 30 : 22, boss ? 14 : 18, boss ? `Your manager at ${sc.place}, met on your first day` : `Met on your first day at ${sc.place}`);
    if (t.asked.includes(i)) circleTouch(w, i, 3, boss ? 'You made a good start on the first day' : 'You got talking on the first day', ev);
    met.push(`${P.name(i)}${boss ? ' (your manager)' : ''}`);
  }
  const out = [`You met ${met.join(', ')}. They are in your book as colleagues now.`];
  if (!t.asked.includes(host)) out.push(`You never quite caught ${first(w, host)} for a word; there is always tomorrow.`);
  out.push(...sc.notes);
  const text = `You leave ${sc.place} at ${clockText(absNow(w) % 1440)}. ${out.join(' ')}`;
  sc.summary = text;
  notify(w, { kind: 'scene', title: `After your first day at ${sc.place}`, text: out.join(' '), reason: `Your first day at ${sc.place}.`, cause: ev, from: host, actions: [{ label: 'See your job', line: 'jobs' }] });
  return { text, lines: [], eventId: ev };
}

/** Your own evening: guests you talked to think more of you, they meet each other, and the city talks about it. */
function finishHosted(w: World, t: Table, sc: Scene, me: number): { text: string; lines: string[]; eventId?: number } {
  const P = econ(w).P;
  const talked = t.faces.filter((i) => t.asked.includes(i));
  const left = t.faces.filter((i) => !t.asked.includes(i));
  const good = talked.length * 2 >= t.faces.length;
  const kindWord = sc.kind === 'gala' ? 'gala' : 'dinner';
  const ev = w.events.emit('scene.hosted', `${P.name(me)} hosts a ${kindWord} at ${sc.place} || ${t.faces.length} guests, talked with ${talked.length}`, [sc.eventId], P.id(me));
  for (const i of talked) circleTouch(w, i, 5, `A good evening at your ${kindWord} at ${sc.place}`, ev);
  for (const i of left) circleTouch(w, i, -1, 'You hardly spoke to them at your own table', ev);
  let intros = 0;
  for (let a = 0; a < t.faces.length; a++) for (let b = a + 1; b < t.faces.length; b++) { nudgeLink(w, t.faces[a], t.faces[b], 6); intros++; }
  if (good) nudgeStanding(w, me, sc.kind === 'gala' ? 4 : 2);
  const gossip = circleHosted(w, sc.key, good, talked, ev);
  const out: string[] = [];
  out.push(talked.length ? `You talked with ${talked.map((i) => P.name(i)).join(', ')}.` : 'You spent the evening seeing to the bill and the coats.');
  if (left.length) out.push(`${left.map((i) => first(w, i)).join(' and ')} went home without a real word from you.`);
  if (intros) out.push(`Your guests met each other across your table: ${intros === 1 ? 'one introduction' : `${intros} introductions`} made at your expense.`);
  out.push(good ? 'People will talk about it, and kindly. Hosting counts toward your standing.' : 'It was a quiet evening, and people will say so.');
  if (gossip) out.push(gossip);
  out.push(...sc.notes);
  const text = `You see the last guest out of ${sc.place} at ${clockText(absNow(w) % 1440)}. ${out.join(' ')}`;
  sc.summary = text;
  notify(w, { kind: 'scene', title: `After your ${kindWord} at ${sc.place}`, text: out.join(' '), reason: `You hosted it on ${dateText(w.day)}.`, cause: ev, from: talked[0] ?? -1, actions: [{ label: 'See your standing', line: 'standing' }] });
  return { text, lines: [], eventId: ev };
}

/**
 * Called each minute by the clock: an invitation that has reached its hour opens by itself (you said yes), and an
 * evening that ran out of time is closed and summed up. Returns what happened, if anything.
 */
export function sceneClock(w: World, seat: string): Res | null {
  if (!seat) return null;
  // Answers promised for a minute of the day are written at that minute.
  circleMinute(w, absNow(w));
  const me = whoOf(w, seat);
  if (me < 0 || !econ(w).P.alive(me)) return null;
  const sb = seatBook(w, seat);
  const t = sb.table;
  if (t?.scene && !t.scene.ended) {
    if (liveTable(w, sb)) return null;
    const fin = finishScene(w, seat, t);
    return { ok: true, text: fin.text, eventId: fin.eventId };
  }
  const now = clockNow(w);
  const due = dueScenes(w, seat).find((x) => now >= x.minute && now < x.minute + 30);
  if (!due) return null;
  const list = dueScenes(w, seat);
  return attend(w, seat, String(list.indexOf(due) + 1));
}

/** At the day's close, an evening still open is over. */
export function closeScenes(w: World): void {
  const b = w.state.venues as { seats?: Record<string, { table: Table | null }> } | undefined;
  for (const seat of Object.keys(b?.seats ?? {})) {
    const t = b!.seats![seat].table;
    if (t?.scene && !t.scene.ended) { t.open = false; t.left = 'the evening ended'; finishScene(w, seat, t); }
  }
}

/** For the view: what is due and what is on now. */
export function sceneView(w: World, seat: string): { now: Record<string, unknown> | null; due: Record<string, unknown>[] } {
  const P = econ(w).P;
  const t = seatBook(w, seat).table;
  const sc = t?.scene;
  const now = sc ? {
    key: sc.key, kind: sc.kind, what: sc.what, place: sc.place, title: sc.title, host: sc.host, hostName: P.name(sc.host),
    open: !sc.ended && t!.open, summary: sc.summary ?? '', notes: sc.notes.slice(),
    faces: (t?.faces ?? []).map((i) => ({ who: i, name: P.name(i) })),
    deal: sc.deal ? { kind: sc.deal.kind, text: sc.deal.text, from: sc.deal.from, fromName: P.name(sc.deal.from), answer: sc.deal.answer ?? '', result: sc.deal.result ?? '' } : null,
  } : null;
  const done = played(w, seat);
  const due = acceptedPlans(w, w.day, w.day + 30).map((x) => ({
    key: x.key, kind: x.kind, what: WHAT[x.kind] ?? x.kind, place: x.place, title: x.title, host: x.host, hostName: P.name(x.host),
    day: x.day, date: dateText(x.day), minute: x.minute, time: clockText(x.minute), played: done[x.key] !== undefined,
  }));
  return { now, due };
}
