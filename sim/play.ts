// Terminal play: node sim/play.ts --load worlds/7 [--script sim/modules/player/demo.txt] [--save worlds/mine]
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { World } from './kernel/index.ts';
import { openWorld } from './run.ts';
import { applySnapshot, snapshotSeed, writeSnapshot } from './modules/history/save.ts';
import { act, ensurePlayer, playerIndex, view, type Command, type PlayerView } from './modules/player/index.ts';

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
  if (head === 'buy' || head === 'sell' || head === 'short') {
    if (t.length < 3) return { error: `usage: ${head} SYMBOL QTY [@ PRICE]` };
    const qty = Number(t[2]);
    if (!Number.isSafeInteger(qty) || qty < 1) return { error: 'qty must be a whole number of shares' };
    let limit: number | undefined;
    if (t[3] === '@') {
      const px = t[4] ? centsOf(t[4]) : undefined;
      if (!px) return { error: 'price must be positive' };
      limit = px;
    }
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
    return { kind: 'fut', side, good: t[2], qty, months };
  }
  if (head === 'coin') {
    const side = t[1]?.toLowerCase();
    if ((side !== 'buy' && side !== 'sell') || !t[2] || !t[3]) return { error: 'usage: coin buy|sell COIN QTY [@ PRICE]' };
    const qty = Number(t[3]);
    if (!Number.isSafeInteger(qty) || qty < 1) return { error: 'qty must be a positive integer' };
    let limit: number | undefined;
    if (t[4] === '@') {
      const px = t[5] ? centsOf(t[5]) : undefined;
      if (!px) return { error: 'price must be positive' };
      limit = px;
    }
    return { kind: 'coin', side, coin: t[2], qty, limit };
  }
  if (head === 'launch') return { kind: 'launch' };
  if (head === 'deposit' || head === 'withdraw' || head === 'borrow' || head === 'repay') {
    const cents = t[1] ? centsOf(t[1]) : undefined;
    if (!cents) return { error: `usage: ${head} DOLLARS` };
    return { kind: 'cash', op: head, cents };
  }
  if (head === 'talk') {
    const slot = Number(t[1]);
    if (!Number.isSafeInteger(slot) || slot < 0) return { error: 'usage: talk SLOT' };
    return { kind: 'talk', slot };
  }
  if (head === 'ask') {
    const slot = Number(t[1]);
    if (!Number.isSafeInteger(slot) || slot < 0) return { error: 'usage: ask SLOT FIRM' };
    return { kind: 'ask', slot, firm: t[2] ?? employer };
  }
  if (head === 'news') return { kind: 'news' };
  if (head === 'why') {
    const id = Number(t[1]);
    if (!Number.isSafeInteger(id) || id < 0) return { error: 'usage: why EVENT' };
    return { kind: 'why', id };
  }
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
      const slot = Number(t[3]);
      if (!t[2] || !Number.isSafeInteger(slot) || slot < 0) return { error: 'usage: board chief FIRM SLOT' };
      return { kind: 'board', op: 'chief', firm: t[2], slot };
    }
    if (op === 'merge' || op === 'sell') {
      if (!t[2] || !t[3]) return { error: op === 'merge' ? 'usage: board merge FIRM INTO' : 'usage: board sell FIRM BUYER' };
      return { kind: 'board', op, firm: t[2], into: t[3] };
    }
    return { error: 'usage: board | board chief FIRM SLOT | board merge FIRM INTO | board sell FIRM BUYER' };
  }
  return { error: `unknown command ${head}` };
}

function summary(v: PlayerView): string[] {
  const when = `Year ${v.date.year}, month ${v.date.month}, day ${v.date.day}`;
  const who = v.alive ? `${v.name}, ${v.age}, ${v.employer || 'unemployed'} (${v.firm})` : `${v.name} has died`;
  const lines = [`${when}  ${who}  net worth ${dollars(v.netWorth)}  cash ${dollars(v.cash)}`];
  if (v.marginPosted) lines.push(`  futures margin ${dollars(v.marginPosted)}`);
  if (v.shares.length) lines.push('  shares: ' + v.shares.map((s) => `${s.instr} ${s.qty} @ ${dollars(s.px)}`).join(', '));
  if (v.loans.length) lines.push('  loans: ' + v.loans.map((l) => `${l.kind} ${dollars(l.owed)} @ ${(l.rate * 100).toFixed(2)}%`).join(', '));
  if (v.futures.length) lines.push('  futures: ' + v.futures.map((f) => `${f.good} m+${f.monthsAhead} ${f.net > 0 ? 'long' : 'short'} ${Math.abs(f.net)} @ ${dollars(f.px)}`).join(', '));
  if (v.coins.length) lines.push('  coins: ' + v.coins.map((c) => `${c.name} ${c.qty}`).join(', '));
  if (v.bonds.length) lines.push(`  bonds: ${v.bonds.length} issues, face ${dollars(v.bonds.reduce((a, b) => a + b.face, 0))}`);
  if (v.deposits.length) lines.push('  time deposits: ' + v.deposits.map((d) => `${d.bank} ${dollars(d.cents)}`).join(', '));
  if (v.orders.length) lines.push('  orders: ' + v.orders.map((o) => `#${o.id} ${o.side} ${o.qty} ${o.instr}`).join(', '));
  const news = v.news.slice(-3);
  if (news.length) lines.push('  news: ' + news.map((n) => `[${n.eventId}] ${n.text}`).join(' | '));
  if (v.private.length) lines.push('  private: ' + v.private.map((p) => `[${p.eventId}] ${p.from} day ${p.day}: ${p.text}`).join(' | '));
  if (v.companies.length) lines.push('  companies: ' + v.companies.map((c) => `${c.role} ${c.name} (${c.id}) ${c.workers} workers cash ${dollars(c.cash)} sales ${dollars(c.sales)} profit ${dollars(c.profit)} ${c.listed ? 'listed' : 'private'}`).join(' | '));
  if (v.contacts.length) lines.push('  contacts: ' + v.contacts.map((c) => `${c.slot} ${c.name.split(' ')[0]} ${c.kind} ${c.trust}`).join(', '));
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

function advance(w: World, days: number): string | undefined {
  for (let d = 0; d < days; d++) {
    w.step();
    const bad = w.ledger.check();
    if (bad.length) return bad.slice(0, 8).join('; ');
    if (over(w)) return 'over';
  }
  return undefined;
}

function printResult(res: ReturnType<typeof act>): void {
  if (res.status === 'rejected') { console.log(`rejected: ${res.why}`); return; }
  if (res.text) console.log(res.text);
  if (res.orderId !== undefined) console.log(`order ${res.orderId}`);
  if (res.lines) for (const line of res.lines) console.log(line);
}

async function main(): Promise<void> {
  const load = arg('load', ''), seed = arg('seed', '1'), script = arg('script', ''), save = arg('save', '');
  const w: World = openWorld(load ? snapshotSeed(load) : seed, new Set());
  if (load) applySnapshot(w, load);
  ensurePlayer(w);
  const open = w.ledger.check();
  if (open.length) { console.error(`BOOKS DO NOT BALANCE:\n  ${open.slice(0, 8).join('\n  ')}`); process.exit(1); }
  let failed: string | undefined;
  let stepped = false;
  const runLine = (line: string): boolean => {
    const employer = view(w).firm;
    const cmd = parseCommand(line, employer);
    if ('error' in cmd) { console.log(cmd.error); return true; }
    const res = act(w, cmd);
    printResult(res);
    if (res.status === 'accepted' && res.days) {
      const bad = advance(w, res.days);
      stepped = true;
      if (bad === 'over') { console.log('The game is over.'); return false; }
      if (bad) { failed = bad; console.error(`BOOKS DO NOT BALANCE: ${bad}`); return false; }
      for (const line of summary(view(w))) console.log(line);
    }
    return !over(w);
  };
  for (const line of summary(view(w))) console.log(line);
  if (script) {
    const text = fs.readFileSync(script, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      console.log(`\n> ${line}`);
      if (!runLine(line)) break;
    }
  } else if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    while (!over(w) && !failed) {
      const line = (await rl.question('> ')).trim();
      if (!line) continue;
      if (line === 'quit' || line === 'sheet') {
        if (line === 'sheet') for (const s of sheet(view(w))) console.log(s);
        if (line === 'quit') break;
        continue;
      }
      if (line === 'view') { console.log(JSON.stringify(view(w))); continue; }
      if (!runLine(line)) break;
    }
    rl.close();
  }
  for (const s of sheet(view(w))) console.log(s);
  if (failed) process.exit(1);
  if (save) writeSnapshot(save, w);
  const who = playerIndex(w);
  console.log(`\n${stepped ? 'Books balanced every day' : 'Books balance'}. State hash ${w.ledger.hash()}${who >= 0 ? `. Player ${who}` : ''}`);
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('play.ts') || entry.endsWith('play.js')) main();
