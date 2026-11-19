// Terminal play: node sim/play.ts --scenario first-paycheck [--script sim/modules/player/first-paycheck.txt]
//               node sim/play.ts --load worlds/7 [--script sim/modules/player/demo.txt] [--save worlds/mine]
//               node sim/play.ts --challenge PA1.scenario.seed.difficulty.score.hash
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { World } from './kernel/index.ts';
import { openWorld } from './run.ts';
import { challengeOf, parseCode } from './modules/history/commands.ts';
import { applySnapshot, snapshotSeed, writeSnapshot } from './modules/history/save.ts';
import { writePlayerChronicle } from './modules/history/story.ts';
import { act, ensurePlayer, playerIndex, suggestCommand, view, type Command, type PlayerView } from './modules/player/index.ts';
import { writePlayerLog } from './modules/player/log.ts';
import { blurb, endScreen, hintLine, openScenario, runOf } from './modules/player/scenarios.ts';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dollars = (cents: number): string => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

function waitOf(tok: string): number | undefined {
  const m = /^(\d+)(d|w|m|y)$/i.exec(tok);
  if (!m) return;
  const n = +m[1];
  if (n < 1) return;
  const u = m[2].toLowerCase();
  if (u === 'd') return n;
  if (u === 'w') return n * 7;
  if (u === 'm') return n * 30;
  return n * 360;
}

function centsOf(tok: string): number | undefined {
  const n = Number(tok);
  if (!Number.isFinite(n) || n <= 0) return;
  const c = Math.round(n * 100);
  return Number.isSafeInteger(c) && c > 0 ? c : undefined;
}

export function parseCommand(line: string, employer: string): Command | { error: string } {
  const t = line.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return { error: 'empty' };
  const head = t[0].toLowerCase();
  if (head === 'help') return { kind: 'help', command: t.slice(1).join(' ') };
  if (head === 'sheet') return { kind: 'sheet' };
  if (head === 'story' || head === 'chronicle') return { kind: 'story' };
  if (head === 'sell' && t.length === 2 && /^\d+$/.test(t[1])) return { kind: 'homesell', id: Number(t[1]) };
  if (head === 'buy' || head === 'sell' || head === 'short') {
    if (t.length < 3) return { error: `usage: ${head} SYMBOL QTY [@ PRICE]` };
    const qty = Number(t[2]);
    if (!Number.isSafeInteger(qty) || qty < 1) return { error: 'qty must be a whole number of shares' };
    let limit: number | undefined;
    let stop: number | undefined;
    for (let k = 3; k < t.length; k += 2) {
      const key = t[k].toLowerCase();
      const px = t[k + 1] ? centsOf(t[k + 1]) : undefined;
      if (key === '@' || key === 'limit') { if (!px) return { error: 'price must be positive' }; limit = px; }
      else if (key === 'stop') { if (!px) return { error: 'the stop price must be positive' }; stop = px; }
      else return { error: `usage: ${head} SYMBOL QTY [@ PRICE] [stop PRICE]` };
    }
    if (stop !== undefined) return { kind: 'order', side: head, instr: t[1], qty, limit, stop, type: limit !== undefined ? 'stop-limit' : 'stop' };
    return { kind: 'order', side: head, instr: t[1], qty, limit };
  }
  if (head === 'cancel') {
    const orderId = Number(t[1]);
    if (!Number.isSafeInteger(orderId)) return { error: 'usage: cancel ORDER' };
    return { kind: 'cancel', orderId };
  }
  if (head === 'bond') {
    const side = t[1]?.toLowerCase();
    if ((side !== 'buy' && side !== 'sell') || !t[2] || !t[3]) return { error: 'usage: bond buy|sell TENOR QTY [@ PRICE]' };
    const bonds = Number(t[3]);
    if (!Number.isSafeInteger(bonds) || bonds < 1) return { error: 'qty is a number of bonds' };
    let limit: number | undefined;
    if (t[4] === '@') {
      const px = t[5] ? centsOf(t[5]) : undefined;
      if (!px) return { error: 'price must be positive' };
      limit = px;
    }
    return { kind: 'bond', side, tenor: t[2], bonds, limit };
  }
  if (head === 'fut') {
    const side = t[1]?.toLowerCase();
    if (!t[2] || (side !== 'long' && side !== 'short' && side !== 'close' && side !== 'flat')) return { error: 'usage: fut long|short|close GOOD QTY MONTHS' };
    if (side === 'close' || side === 'flat') {
      const months = Number(t[3] ?? 0);
      if (!Number.isSafeInteger(months) || months < 0) return { error: 'month must be 0 to 5' };
      return { kind: 'fut', side: 'flat', good: t[2], qty: 0, months };
    }
    const qty = Number(t[3]);
    const months = Number(t[4] ?? 0);
    if (!Number.isSafeInteger(qty) || qty < 1) return { error: 'qty is a number of contracts' };
    if (!Number.isSafeInteger(months) || months < 0) return { error: 'month must be 0 to 5' };
    if (t[5]?.toLowerCase() === 'stop') {
      const px = t[6] ? centsOf(t[6]) : undefined;
      if (!px) return { error: 'the stop price must be positive' };
      return { kind: 'fut', side, good: t[2], qty, months, type: 'stop', stop: px };
    }
    return { kind: 'fut', side, good: t[2], qty, months };
  }
  if (head === 'coin') {
    const side = t[1]?.toLowerCase();
    if ((side !== 'buy' && side !== 'sell') || !t[2] || !t[3]) return { error: 'usage: coin buy|sell COIN QTY [@ PRICE]' };
    const qty = Number(t[3]);
    if (!Number.isSafeInteger(qty) || qty < 1) return { error: 'qty must be a positive integer' };
    let limit: number | undefined;
    let stop: number | undefined;
    for (let k = 4; k < t.length; k += 2) {
      const key = t[k].toLowerCase();
      const px = t[k + 1] ? centsOf(t[k + 1]) : undefined;
      if (key === '@' || key === 'limit') { if (!px) return { error: 'price must be positive' }; limit = px; }
      else if (key === 'stop') { if (!px) return { error: 'the stop price must be positive' }; stop = px; }
      else return { error: 'usage: coin buy|sell COIN QTY [@ PRICE] [stop PRICE]' };
    }
    if (stop !== undefined) return { kind: 'coin', side, coin: t[2], qty, limit, stop, type: limit !== undefined ? 'stop-limit' : 'stop' };
    return { kind: 'coin', side, coin: t[2], qty, limit };
  }
  if (head === 'fx' || head === 'currency') {
    const side = t[1]?.toLowerCase();
    if ((side !== 'buy' && side !== 'sell') || !t[2] || !t[3]) return { error: 'usage: fx buy|sell CODE UNITS' };
    const units = Number(t[3]);
    if (!Number.isSafeInteger(units) || units < 1) return { error: 'units is a whole number of currency units' };
    return { kind: 'fx', side, code: t[2].toUpperCase(), units };
  }
  if (head === 'launch') return { kind: 'launch' };
  if (head === 'deposit' || head === 'withdraw' || head === 'borrow' || head === 'repay') {
    const cents = t[1] ? centsOf(t[1]) : undefined;
    if (!cents) return { error: head === 'borrow' ? 'usage: borrow DOLLARS [margin|line|term]' : `usage: ${head} DOLLARS` };
    if (head === 'borrow' && t[2]) {
      const product = t[2].toLowerCase();
      if (product !== 'margin' && product !== 'line' && product !== 'term') return { error: 'borrow on margin, line or term' };
      return { kind: 'cash', op: head, cents, product };
    }
    return { kind: 'cash', op: head, cents };
  }
  if (head === 'signals') return { kind: 'signals' };
  if (head === 'owner') return { kind: 'help', command: 'owner' };
  if (head === 'stake') {
    const bare = !!t[1] && centsOf(t[1]) !== undefined && !/^frm_/.test(t[1]);
    const firm = bare ? employer : t[1];
    const cents = bare ? centsOf(t[1]) : t[2] ? centsOf(t[2]) : undefined;
    const how = (bare ? t[2] : t[3])?.toLowerCase() ?? 'cash';
    if (!firm || !cents) return { error: 'usage: stake FIRM DOLLARS [cash|margin|line|partners|buyout]' };
    if (how !== 'cash' && how !== 'margin' && how !== 'line' && how !== 'partners' && how !== 'buyout') return { error: 'pay with cash, margin, line, partners or buyout' };
    return { kind: 'stake', firm, cents, how };
  }
  if (head === 'cut') {
    const n = Number(t[1]);
    if (!Number.isSafeInteger(n) || n < 1) return { error: 'usage: cut N (the number of jobs)' };
    return { kind: 'owner', op: 'cut', n };
  }
  if (head === 'protect') return { kind: 'owner', op: 'protect' };
  if (head === 'promote') {
    return { kind: 'owner', op: 'promote', person: t.slice(1).join(' ') || 'best' };
  }
  if (head === 'sell-division') {
    const pct = t[1] && /^\d+(\.\d+)?%?$/.test(t[1]) ? Number(t[1].replace('%', '')) : undefined;
    const buyer = pct !== undefined ? t[2] : t[1];
    return { kind: 'owner', op: 'sell-division', fraction: pct !== undefined ? pct / 100 : undefined, buyer };
  }
  if (head === 'refinance' || head === 'payout') {
    const cents = t[1] ? centsOf(t[1]) : undefined;
    if (!cents) return { error: `usage: ${head} DOLLARS${head === 'refinance' ? ' [guarantee]' : ''}` };
    return { kind: 'owner', op: head, cents, guarantee: t[2]?.toLowerCase() === 'guarantee' };
  }
  if (head === 'union') {
    const deal = t[1]?.toLowerCase();
    if (deal !== 'deal' && deal !== 'refuse') return { error: 'usage: union deal | union refuse' };
    return { kind: 'owner', op: 'union', deal };
  }
  if (head === 'talk') {
    const slot = Number(t[1]);
    if (!Number.isSafeInteger(slot) || slot < 0) return { error: 'usage: talk SLOT' };
    return { kind: 'talk', slot };
  }
  if (head === 'jobs') return { kind: 'jobs' };
  if (head === 'apply') {
    const n = Number(t[1]);
    if (!Number.isSafeInteger(n) || n < 1) return { error: 'usage: apply N' };
    return { kind: 'apply', n };
  }
  if (head === 'study') {
    const field = t.slice(1).join(' ').trim();
    if (!field) return { error: 'usage: study FIELD' };
    return { kind: 'study', field };
  }
  if (head === 'places' || head === 'tonight') return { kind: 'out', op: 'places' };
  if (head === 'go') {
    const where = t.slice(1).join(' ').trim();
    if (!where) return { error: 'usage: go PLACE (places lists them)' };
    return { kind: 'out', op: 'go', arg: where };
  }
  if (head === 'round') return { kind: 'out', op: 'round' };
  if (head === 'listen') return { kind: 'out', op: 'listen' };
  if (head === 'known') return { kind: 'out', op: 'known' };
  if (head === 'courses') return { kind: 'out', op: 'courses' };
  if (head === 'enrol' || head === 'enroll') {
    const name = t.slice(1).join(' ').trim();
    if (!name) return { error: 'usage: enrol COURSE (courses lists them)' };
    return { kind: 'out', op: 'enrol', arg: name };
  }
  if (head === 'leave') return { kind: 'out', op: 'leave' };
  if (head === 'approach' || head === 'talk' || head === 'business' || head === 'offer') {
    const n = Number(t[1]);
    if (!Number.isSafeInteger(n) || n < 1) return { error: head === 'talk' ? 'usage: talk N [work|home|money|city|inside]' : `usage: ${head} N` };
    return { kind: 'out', op: head, n, arg: t[2] };
  }
  if (head === 'message' || head === 'write') {
    const who = Number(t[1]);
    const text = t.slice(2).join(' ').trim();
    if (!Number.isSafeInteger(who) || who < 0 || !text) return { error: 'usage: message PERSON a few words' };
    return { kind: 'message', who, text };
  }
  if (head === 'favour' || head === 'favor') {
    const n = Number(t[1]);
    const what = (t[2] ?? '').toLowerCase();
    if (!Number.isSafeInteger(n) || n < 1 || !what) return { error: 'usage: favour N intro|interview|loan [DOLLARS]|lender [DOLLARS]|invest FIRM DOLLARS' };
    const rest = t.slice(3);
    const money = rest.length ? centsOf(rest[rest.length - 1]) : undefined;
    const firm = rest.length && money !== undefined ? rest.slice(0, -1).join(' ') : rest.join(' ');
    return { kind: 'out', op: 'favour', n, arg: `${what}${firm ? ' ' + firm : ''}`, cents: money };
  }
  if (head === 'quit') return { kind: 'quit' };
  if (head === 'ask' && (t[1] ?? '').toLowerCase() === 'raise') return { kind: 'raise' };
  if (head === 'ask') {
    const slot = Number(t[1]);
    if (!Number.isSafeInteger(slot) || slot < 0) return { error: 'usage: ask SLOT FIRM' };
    return { kind: 'ask', slot, firm: t[2] ?? employer };
  }
  if (head === 'news') return { kind: 'news' };
  if (head === 'why') {
    if (!t[1]) return { error: 'usage: why <thing>' };
    if (t.length === 2 && /^\d+$/.test(t[1])) {
      const id = Number(t[1]);
      if (!Number.isSafeInteger(id) || id < 0) return { error: 'usage: why <thing>' };
      return { kind: 'why', id };
    }
    return { kind: 'why', thing: t.slice(1).join(' ') };
  }
  if (head === 'holiday') return { kind: 'holiday' };
  if (head === 'donate') return { kind: 'donate' };
  if (head === 'lawyer') return { kind: 'lawyer' };
  if (head === 'clinic') return { kind: 'clinic' };
  if (head === 'overtime') return { kind: 'overtime' };
  if (head === 'wait') {
    const days = t[1] ? waitOf(t[1]) : undefined;
    if (!days) return { error: 'usage: wait 1d|1w|1m|1y' };
    return { kind: 'wait', days };
  }
  if (head === 'found') {
    const cut = t.indexOf('/');
    if (cut < 2 || !t[cut + 1]) return { error: 'usage: found NAME / SECTOR [DOLLARS] [loan]' };
    const name = t.slice(1, cut).join(' ');
    const sector = t[cut + 1].toUpperCase();
    let cents = 0;
    let loan = false;
    for (const tok of t.slice(cut + 2)) {
      if (tok.toLowerCase() === 'loan') loan = true;
      else {
        const c = centsOf(tok);
        if (!c) return { error: 'dollars must be positive' };
        cents = c;
      }
    }
    return { kind: 'found', name, sector, cents, loan };
  }
  if (head === 'ceo') {
    if (!t[1]) return { error: 'usage: ceo FIRM [price DOLLARS|auto | hires N|auto | dividend FRACTION|auto | invest UNITS]' };
    const firm = t[1];
    if (!t[2]) return { kind: 'ceo', firm, op: 'report' };
    const op = t[2].toLowerCase();
    if (op !== 'price' && op !== 'hires' && op !== 'dividend' && op !== 'invest') return { error: 'ceo sets price, hires, dividend or invest' };
    const raw = t[3]?.toLowerCase();
    if (!raw) return { error: 'missing value' };
    if (raw === 'auto') {
      if (op === 'invest') return { error: 'invest needs a number of machines' };
      return { kind: 'ceo', firm, op, auto: true };
    }
    if (op === 'price') {
      const cents = centsOf(raw);
      if (!cents) return { error: 'price is in dollars' };
      return { kind: 'ceo', firm, op, value: cents };
    }
    if (op === 'hires' || op === 'invest') {
      const n = Number(raw);
      if (!Number.isSafeInteger(n) || n < 1) return { error: 'that needs a whole number' };
      return { kind: 'ceo', firm, op, value: n };
    }
    const fraction = Number(raw);
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return { error: 'dividend is a fraction from 0 to 1' };
    return { kind: 'ceo', firm, op: 'dividend', value: fraction };
  }
  if (head === 'ipo') {
    if (!t[1] || !t[2]) return { error: 'usage: ipo FIRM FRACTION' };
    const fraction = Number(t[2]);
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 0.9) return { error: 'fraction is the part of your stake you sell, above 0 and at most 0.9' };
    return { kind: 'ipo', firm: t[1], fraction };
  }
  if (head === 'bid' && /^\d+$/.test(t[1] ?? '')) {
    const id = Number(t[1]);
    if (!t[2]) return { kind: 'homebid', id, cents: 0 };
    const cents = centsOf(t[2]);
    if (!cents) return { error: 'usage: bid HOME [DOLLARS]' };
    return { kind: 'homebid', id, cents };
  }
  if (head === 'bid') {
    if (!t[1] || !t[2] || !t[3]) return { error: 'usage: bid FIRM DOLLARS|Nx cash|shares' };
    const how = t[3].toLowerCase();
    if (how !== 'cash' && how !== 'shares') return { error: 'pay cash or shares' };
    const mult = /^(\d+(?:\.\d+)?)x$/.exec(t[2].toLowerCase());
    if (mult) return { kind: 'bid', firm: t[1], cents: 0, multiple: Number(mult[1]), paper: how === 'shares' };
    const cents = centsOf(t[2]);
    if (!cents) return { error: 'name a price in dollars, or a multiple like 2x' };
    return { kind: 'bid', firm: t[1], cents, multiple: 0, paper: how === 'shares' };
  }
  if (head === 'board') {
    if (!t[1] || t[1].toLowerCase() === 'list') return { kind: 'board', op: 'list' };
    const op = t[1].toLowerCase();
    if (op === 'chief') {
      if (!t[2] || !t[3]) return { error: 'usage: board chief FIRM PERSON' };
      const person = t.slice(3).join(' ');
      const slot = /^\d+$/.test(person) ? Number(person) : undefined;
      return { kind: 'board', op: 'chief', firm: t[2], slot, person };
    }
    if (op === 'merge' || op === 'sell') {
      if (!t[2] || !t[3]) return { error: op === 'merge' ? 'usage: board merge FIRM INTO' : 'usage: board sell FIRM BUYER' };
      return { kind: 'board', op, firm: t[2], into: t[3] };
    }
    return { error: 'usage: board | board chief FIRM PERSON | board merge FIRM INTO | board sell FIRM BUYER' };
  }
  if (head === 'court' || head === 'marry') {
    const slot = t[1] === undefined ? -1 : Number(t[1]);
    if (!Number.isInteger(slot) || slot < -1) return { error: `usage: ${head} [SLOT]` };
    return { kind: head, slot };
  }
  if (head === 'child') return { kind: 'child' };
  if (head === 'school') {
    const nth = t[1] === undefined ? 0 : Number(t[1]);
    if (!Number.isInteger(nth) || nth < 0) return { error: 'usage: school [CHILD]' };
    return { kind: 'school', nth };
  }
  if (head === 'will') {
    const how = t[1]?.toLowerCase();
    if (how !== 'spouse' && how !== 'child' && how !== 'slot') return { error: 'usage: will spouse | will child [N] | will slot N' };
    const nth = t[2] === undefined ? 0 : Number(t[2]);
    if (!Number.isInteger(nth) || nth < 0) return { error: 'usage: will spouse | will child [N] | will slot N' };
    if (how === 'slot' && t[2] === undefined) return { error: 'usage: will slot N' };
    return { kind: 'will', how, nth };
  }
  if (head === 'retire') return { kind: 'retire' };
  if (head === 'hand') {
    if (!t[1]) return { error: 'usage: hand FIRM' };
    return { kind: 'hand', firm: t[1] };
  }
  if (head === 'die') return { kind: 'die' };
  if (head === 'opt') return { kind: 'opt', instr: t[1] ?? '' };
  if (head === 'call' || head === 'put') return optOrder(t, head === 'call' ? 'C' : 'P');
  if (head === 'write') {
    const which = t[1]?.toLowerCase();
    if ((which !== 'call' && which !== 'put') || !t[2]) return { error: 'usage: write call|put SYMBOL [STRIKE] [MONTHS] [QTY]' };
    const built = optOrder(['write', t[2], ...t.slice(3)], which === 'call' ? 'C' : 'P');
    if ('error' in built) return built;
    return { ...built, kind: 'write' };
  }
  if (head === 'close') {
    if (!t[1]) return { error: 'usage: close ID|SYMBOL [QTY]' };
    const qty = t[2] === undefined ? 0 : Number(t[2]);
    if (t[2] !== undefined && (!Number.isSafeInteger(qty) || qty < 1)) return { error: 'qty is a number of contracts' };
    if (t[1].startsWith('opt')) return { kind: 'optclose', id: t[1], instr: '', qty };
    return { kind: 'optclose', id: '', instr: t[1], qty };
  }
  if (head === 'homes') return { kind: 'homes' };
  if (head === 'let') {
    const id = Number(t[1]);
    const cents = t[2] ? centsOf(t[2]) : undefined;
    if (!Number.isSafeInteger(id) || id < 0 || !cents) return { error: 'usage: let HOME DOLLARS' };
    return { kind: 'let', id, cents };
  }
  if (head === 'move') {
    const id = Number(t[1]);
    if (!Number.isSafeInteger(id) || id < 0) return { error: 'usage: move HOME' };
    return { kind: 'move', id };
  }
  if (head === 'mortgage') {
    const id = Number(t[1]);
    if (!Number.isSafeInteger(id) || id < 0) return { error: 'usage: mortgage HOME [DOLLARS]' };
    if (!t[2]) return { kind: 'mortgage', id, cents: 0 };
    const cents = centsOf(t[2]);
    if (!cents) return { error: 'dollars must be positive' };
    return { kind: 'mortgage', id, cents };
  }
  if (head === 'tip') {
    const fact = Number(t[1]);
    if (!Number.isSafeInteger(fact) || fact < 0) return { error: 'usage: tip FACT' };
    return { kind: 'tip', fact };
  }
  if (head === 'report') {
    const slot = Number(t[1]);
    const text = t.slice(2).join(' ');
    if (!Number.isSafeInteger(slot) || slot < 0 || !text) return { error: 'usage: report SLOT TEXT' };
    return { kind: 'report', slot, text };
  }
  if (head === 'hints') {
    const on = t[1]?.toLowerCase();
    if (on !== 'on' && on !== 'off') return { error: 'usage: hints on|off' };
    return { kind: 'hints', on: on === 'on' };
  }
  if (head === 'sheet') return { kind: 'sheet' };
  if (head === 'desk') return { kind: 'desk' };
  if (head === 'quote') {
    if (!t[1]) return { error: 'usage: quote FIRM' };
    return { kind: 'quote', firm: t.slice(1).join(' ') };
  }
  if (head === 'mail' || head === 'inbox') return { kind: 'mail' };
  if (head === 'reply') {
    const msg = Number(t[1]);
    const text = t.slice(2).join(' ');
    if (!Number.isSafeInteger(msg) || msg < 0 || !text) return { error: 'usage: reply MSG yes|no|TEXT' };
    return { kind: 'reply', msg, text };
  }
  if (head === 'lend' || head === 'gift') {
    let slot = -1;
    let money = t[1];
    if (t[2]) {
      slot = Number(t[1]);
      money = t[2];
      if (!Number.isSafeInteger(slot) || slot < 0) return { error: `usage: ${head} [SLOT] DOLLARS` };
    }
    const cents = money ? centsOf(money) : undefined;
    if (!cents) return { error: `usage: ${head} [SLOT] DOLLARS` };
    return head === 'gift' ? { kind: 'gift', slot, cents } : { kind: 'lend', slot, cents };
  }
  if (head === 'invite') {
    const places = new Set(['dinner', 'club', 'gala']);
    let slot = -1;
    let place = (t[1] ?? 'dinner').toLowerCase();
    if (t[2]) {
      slot = Number(t[1]);
      place = t[2].toLowerCase();
      if (!Number.isSafeInteger(slot) || slot < 0) return { error: 'usage: invite [SLOT] dinner|club|gala' };
    }
    if (!places.has(place)) return { error: 'usage: invite [SLOT] dinner|club|gala' };
    return { kind: 'invite', slot, place };
  }
  if (head === 'introduce') {
    if (!t[1]) return { kind: 'introduce', slot: -1 };
    const slot = Number(t[1]);
    if (!Number.isSafeInteger(slot) || slot < 0) return { error: 'usage: introduce [SLOT]' };
    return { kind: 'introduce', slot };
  }
  return { error: `unknown command ${head}. ${suggestCommand(head)}` };
}

function optOrder(t: string[], right: 'C' | 'P'): Command | { error: string } {
  const name = right === 'C' ? 'call' : 'put';
  if (!t[1]) return { error: `usage: ${name} SYMBOL [STRIKE] [MONTHS] [QTY]` };
  let strike = 0;
  if (t[2] !== undefined) {
    const n = Number(t[2]);
    if (!Number.isFinite(n) || n < 0) return { error: 'strike is in dollars, or 0 for at the money' };
    strike = Math.round(n * 100);
  }
  const months = t[3] === undefined ? 2 : Number(t[3]);
  const qty = t[4] === undefined ? 1 : Number(t[4]);
  if (!Number.isInteger(months) || months < 0 || months > 6) return { error: 'months is 0 to 6' };
  if (!Number.isSafeInteger(qty) || qty < 1) return { error: 'qty is a number of contracts' };
  return { kind: 'optbuy', right, instr: t[1], qty, months, strike };
}

function arrow(n: number): string {
  if (n > 0) return '↑';
  if (n < 0) return '↓';
  return '→';
}

function summary(v: PlayerView): string[] {
  const when = `Year ${v.date.year}, month ${v.date.month}, day ${v.date.day}`;
  const who = v.alive
    ? `${v.name}, ${v.age}, ${v.employer || 'unemployed'}`
    : (v.final || `${v.name} has died`);
  const stats = (v.stats ?? []).map((s) => `${s.word}${s.note ? ' ' + s.note : ''} ${arrow(s.trend)}`).join('  ');
  const lines = [`${when}  ${who}`, `  ${stats}`];
  const spouse = v.family?.spouse;
  const kids = v.family?.children ?? [];
  lines.push(`  family: ${spouse ? `spouse ${spouse.name} (${spouse.age})` : 'no spouse'}; children ${kids.length ? kids.map((k) => `${k.name} ${k.age} school ${k.school}`).join(', ') : 'none'}; ${v.family?.will ?? ''}`);
  if (v.dynasty) lines.push(`  dynasty gen ${v.dynasty.generation} worth ${dollars(v.dynasty.worth)} founded ${v.dynasty.founded} controlled ${v.dynasty.controlled} offices ${v.dynasty.offices} convictions ${v.dynasty.convictions}`);
  if (v.marginPosted) lines.push(`  futures margin ${dollars(v.marginPosted)}`);
  if (v.shares.length) lines.push('  shares: ' + v.shares.map((s) => `${s.name || 'shares'} ${s.qty} @ ${dollars(s.px)}`).join(', '));
  if (v.loans.length) lines.push('  loans: ' + v.loans.map((l) => `${l.kind} ${dollars(l.owed)} @ ${(l.rate * 100).toFixed(2)}%`).join(', '));
  if (v.futures.length) lines.push('  futures: ' + v.futures.map((f) => `${f.good} m+${f.monthsAhead} ${f.net > 0 ? 'long' : 'short'} ${Math.abs(f.net)} @ ${dollars(f.px)}`).join(', '));
  if (v.coins.length) lines.push('  coins: ' + v.coins.map((c) => `${c.name} ${c.qty}`).join(', '));
  if (v.bonds.length) lines.push(`  bonds: ${v.bonds.length} issues, face ${dollars(v.bonds.reduce((a, b) => a + b.face, 0))}`);
  if (v.deposits.length) lines.push('  time deposits: ' + v.deposits.map((d) => `${d.bank} ${dollars(d.cents)}`).join(', '));
  if (v.orders.length) lines.push('  orders: ' + v.orders.map((o) => `#${o.id} ${o.side} ${o.qty} ${o.instr}${o.stop ? ` stop ${dollars(o.stop)}` : ''}${o.limit ? ` @ ${dollars(o.limit)}` : ''}`).join(', '));
  const news = v.news.slice(-3);
  if (news.length) lines.push('  news: ' + news.map((n) => `[${n.eventId}] ${n.text}`).join(' | '));
  if (v.private.length) lines.push('  private: ' + v.private.map((p) => `[${p.eventId}] ${p.from} day ${p.day}: ${p.text}`).join(' | '));
  for (const s of v.stake ?? []) lines.push(`  stake: ${s.name} ${s.shares} of ${s.issued} (${s.percent}%)${s.controls ? ', you chair it' : ''}${s.choices.length ? '; choices ' + s.choices.map((c) => c.op).join(', ') : ''}${s.remembers.length ? '; remembered by ' + s.remembers.slice(0, 3).map((r) => `${r.name} (${r.role}, ${r.what})`).join(', ') : ''}`);
  if (v.credit && v.credit.limit > 0) lines.push(`  credit: ${v.credit.word}, room ${dollars(v.credit.room)} of ${dollars(v.credit.limit)}`);
  const open = (v.signals ?? []).filter((s) => s.outcome === 'open');
  if (open.length) lines.push(`  signals: ${open.length} unread readings (signals)`);
  if (v.companies.length) lines.push('  companies: ' + v.companies.map((c) => `${c.role} ${c.name}, ${c.workers} workers, cash ${dollars(c.cash)}, sales ${dollars(c.sales)}, profit ${dollars(c.profit)}, ${c.listed ? 'listed' : 'private'}`).join(' | '));
  if (v.contacts.length) lines.push('  contacts: ' + v.contacts.map((c) => `${c.slot} ${c.name.split(' ')[0]} ${c.line}`).join(' | '));
  if (v.choices?.length) lines.push('  choices: ' + v.choices.map((c) => `${c.id}${c.left ? ` (${c.left}d)` : ''}`).join(', '));
  const owned = (v.homes ?? []).filter((h) => h.mine || h.live);
  if (owned.length) lines.push('  homes: ' + owned.map((h) => `#${h.id} ${h.neighbourhood} ${dollars(h.price)}${h.live ? ' home' : ''}${h.vacant ? ' vacant' : ''}`).join(', '));
  const held = (v.chain ?? []).filter((c) => c.net);
  if (held.length) lines.push('  options: ' + held.map((c) => `${c.right === 'C' ? 'call' : 'put'} on ${c.name} ${c.net > 0 ? 'long' : 'short'} ${Math.abs(c.net)}`).join(', '));
  return lines;
}

function sheet(v: PlayerView): string[] {
  const lines = ['Balance sheet', `  cash ${dollars(v.cash)}`, `  net worth ${dollars(v.netWorth)}`];
  for (const d of v.deposits) lines.push(`  deposit ${d.bank} ${dollars(d.cents)}  [${d.eventId}]`);
  for (const s of v.shares) lines.push(`  ${s.instr} ${s.qty} @ ${dollars(s.px)} = ${dollars(s.qty * s.px)}  [${s.eventId}]`);
  for (const l of v.loans) lines.push(`  loan ${l.kind} ${dollars(l.owed)} @ ${(l.rate * 100).toFixed(2)}%  [${l.eventId}]`);
  for (const f of v.futures) lines.push(`  future ${f.good} m+${f.monthsAhead} ${f.net > 0 ? 'long' : 'short'} ${Math.abs(f.net)} @ ${dollars(f.px)}  [${f.eventId}]`);
  if (v.marginPosted) lines.push(`  futures margin ${dollars(v.marginPosted)}`);
  for (const c of v.coins) lines.push(`  ${c.name} ${c.qty} @ ${dollars(c.px)}  [${c.eventId}]`);
  for (const b of v.bonds) lines.push(`  ${b.instr} face ${dollars(b.face)}  [${b.eventId}]`);
  for (const l of v.stockLoans) lines.push(`  stock loan ${l.instr} ${l.qty} face ${dollars(l.face)}  [${l.eventId}]`);
  if (v.score.length) lines.push(`  score ${v.score.map((p) => `day ${p.day} ${dollars(p.worth)}`).join(', ')}`);
  return lines;
}

function over(w: World): boolean {
  const v = view(w);
  return v.over || !v.alive;
}

function narrate(w: World, seen: { story: number; step: string; hint: string }, stories: boolean): void {
  const v = view(w);
  if (stories) {
    for (const s of v.story.slice(seen.story)) console.log(`story [day ${s.day}] ${s.text}`);
    seen.story = v.story.length;
  }
  const t = v.tutorial;
  if (!t) return;
  if (t.step === seen.step && t.hint === seen.hint) return;
  if (!t.done && t.hint) console.log(`  lesson: ${t.goal}. ${t.hint}`);
  else if (t.goal && t.step !== seen.step) console.log(`  lesson: ${t.goal}`);
  seen.step = t.step;
  seen.hint = t.hint;
}

function dumpStory(w: World): void {
  const lines = view(w).story;
  console.log('\nStory');
  if (!lines.length) console.log('(no story yet)');
  for (const s of lines) console.log(`story [day ${s.day}] ${s.text}`);
}

function show(w: World, seen: { story: number; step: string; hint: string }): void {
  for (const line of blurb(w)) console.log(line);
  for (const line of summary(view(w))) console.log(line);
  narrate(w, seen, true);
  const hint = hintLine(w);
  if (hint) console.log(`  hint: ${hint}`);
}

function printResult(res: ReturnType<typeof act>): void {
  if (res.status === 'rejected') { console.log(`rejected: ${res.why}`); return; }
  if (res.text) console.log(res.text);
  if (res.orderId !== undefined) console.log(`order ${res.orderId}`);
  if (res.lines) for (const line of res.lines) console.log(line);
}

async function main(): Promise<void> {
  const load = arg('load', ''), seed = arg('seed', '1'), script = arg('script', ''), save = arg('save', '');
  const scenario = arg('scenario', '');
  const challenge = arg('challenge', '');
  const exportDir = arg('export', '');
  const cashArg = arg('cash', ''), diffArg = arg('difficulty', '');
  let w: World;
  try {
    if (challenge) {
      const code = parseCode(challenge);
      w = openScenario(code.scenario, { seed: code.seed, difficulty: code.difficulty });
    } else if (scenario) {
      w = openScenario(scenario, {
        cash: cashArg ? Number(cashArg) : undefined,
        difficulty: diffArg ? Number(diffArg) : undefined,
        seed: process.argv.includes('--seed') ? seed : undefined,
      });
    } else {
      w = openWorld(load ? snapshotSeed(load) : seed, new Set());
      if (load) applySnapshot(w, load);
      ensurePlayer(w);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const open = w.ledger.check();
  if (open.length) { console.error(`BOOKS DO NOT BALANCE:\n  ${open.slice(0, 8).join('\n  ')}`); process.exit(1); }
  let failed: string | undefined;
  let stepped = false;
  const seen = { story: 0, step: '', hint: '' };
  const runLine = (line: string): boolean => {
    const employer = view(w).firm;
    const cmd = parseCommand(line, employer);
    if ('error' in cmd) { console.log(cmd.error); return true; }
    const res = act(w, cmd);
    printResult(res);
    narrate(w, seen, false);
    if (res.books) { failed = res.books; console.error(`BOOKS DO NOT BALANCE: ${res.books}`); return false; }
    if (res.status === 'accepted' && res.days) {
      stepped = true;
      if (over(w)) {
        const ending = endScreen(w);
        if (ending) for (const line of ending) console.log(line);
        else {
          const v = view(w);
          if (v.final) console.log(v.final);
          console.log('The game is over.');
        }
        narrate(w, seen, true);
        return false;
      }
      show(w, seen);
    }
    return !over(w);
  };
  show(w, seen);
  console.log('type help');
  if (script) {
    const text = fs.readFileSync(script, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      console.log(`\n> ${line}`);
      if (!runLine(line)) break;
    }
  } else if (process.argv.includes('--pipe')) {
    // Driven by another program (the AI playtest): one command per input line, and a marker after each screen.
    const END = '<<<PLAYTEST-END>>>';
    console.log(END);
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    for await (const raw of rl) {
      const line = raw.trim();
      if (!line) { console.log(END); continue; }
      if (line === 'quit') break;
      const goOn = runLine(line);
      if (!goOn || over(w) || failed) break;
      console.log(END);
    }
    rl.close();
  } else if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    while (!over(w) && !failed) {
      const line = (await rl.question('> ')).trim();
      if (!line) continue;
      if (line === 'quit') break;
      if (line === 'view') { console.log(JSON.stringify(view(w))); continue; }
      if (!runLine(line)) break;
    }
    rl.close();
  }
  dumpStory(w);
  const lesson = view(w).tutorial;
  console.log(`lesson ${lesson.step} done=${lesson.done}`);
  for (const s of sheet(view(w))) console.log(s);
  if (failed) process.exit(1);
  if (save) writeSnapshot(save, w);
  const sc = runOf(w);
  if (exportDir || script || sc?.outcome) {
    const dir = exportDir || save || path.join('worlds', 'play', sc?.id || 'life');
    const worth = view(w).netWorth;
    writePlayerChronicle(w, worth, dir);
    writePlayerLog(dir, w);
    const code = sc ? challengeOf(w, worth) : '';
    if (code) fs.writeFileSync(path.join(dir, 'challenge.txt'), `${code}\n`);
    console.log(`\nChronicle written to ${dir}`);
    if (code) console.log(`Challenge ${code}`);
  }
  const who = playerIndex(w);
  console.log(`\n${stepped ? 'Books balanced every day' : 'Books balance'}. State hash ${w.ledger.hash()}${who >= 0 ? `. Player ${who}` : ''}`);
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('play.ts') || entry.endsWith('play.js')) main();
