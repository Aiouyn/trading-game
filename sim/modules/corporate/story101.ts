// Scripted chain for work order 101: node sim/modules/corporate/story101.ts [seed]
// A worker buys into the firm that employs them, takes the chair, protects then cuts jobs, dies, and the heir meets the memory.
import { openWorld } from '../../run.ts';
import { simulate } from '../history/boot.ts';
import { act, ensurePlayer } from '../player/index.ts';
import { DEP, pay, type EconState } from '../economy/index.ts';
import { buyIn, cityMemory, cutJobs, dealUnion, owner, payOut, protectJobs, refinance } from './owner.ts';
import { findFirm } from './index.ts';

const seed = process.argv[2] ?? '1';
const w = openWorld(seed, new Set());
simulate(w, 3, 30, false);
const s = w.state.economy as EconState;
const P = s.P;
const me = ensurePlayer(w);
const say = (label: string, r: { why: string } | { text: string; eventId: number }): number => {
  console.log(`[${w.year}.${w.month}] ${label}: ${'why' in r ? 'REFUSED ' + r.why : r.text}`);
  return 'eventId' in r ? r.eventId : -1;
};
const wait = (days: number): void => { const r = act(w, { kind: 'wait', days }); if (r.status !== 'accepted') throw new Error('wait ' + r.why); };
const firm = s.firms[P.employer[me]];
console.log(`${P.name(me)} works at ${firm.name} (${firm.workers} staff, ${firm.listed ? 'listed' : 'private'}), cash ${Math.round(w.ledger.balance(P.id(me), DEP)) / 100}`);
wait(360);
const setup = w.events.emit('story.legacy', P.name(me) + ' inherits a legacy from an uncle', [w.genesis]);
pay(w, 'bank_1', P.id(me), 520_000_000, 'story.legacy', setup);
const rich = (): number => Math.floor(w.ledger.balance(P.id(me), DEP));
const f = findFirm(w, firm.id)!;
const key = f.id;
for (const [id, n] of [...w.ledger.holders('eq:' + f.id)].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log('  top holder', id, n);
{ const hs=[...w.ledger.holders('eq:' + f.id)]; console.log('holders', hs.length, 'sum', hs.reduce((a,[,n])=>a+n,0), 'issued', w.ledger.issued.get('eq:'+f.id), hs.filter(([id])=>!id.startsWith('p_')).map(([i,n])=>i+':'+n).join(' ')); }
say('buy in', buyIn(w, me, key, 'partners', 300_000_000));
say('buy in again', buyIn(w, me, key, 'loan', 150_000_000));
say('management buyout', buyIn(w, me, key, 'mbo', 300_000_000));
console.log('cash', rich(), 'staff', f.staff.length);
wait(30);
say('protect', protectJobs(w, me, key));
say('union', dealUnion(w, me, key, 'concede'));
wait(200);
say('refinance', refinance(w, me, key, 3_000_000, true));
say('cut (inside the promise)', cutJobs(w, me, key, 8));
say('dividend', payOut(w, me, key, 10_000_000));
wait(360 * 3);
console.log('stats', JSON.stringify(owner(w).memos.length), 'allies', owner(w).allies, 'leaks', owner(w).leaks);
const old = me;
const deathDay = w.day;
const dead = act(w, { kind: 'die' });
console.log('die:', dead.status, dead.text ?? dead.why);
wait(360 * 6);
const o = owner(w);
const bad = w.ledger.check();
console.log(bad.length ? 'BOOKS BAD ' + bad.slice(0, 3) : 'Books balanced');
console.log('memory of', P.name(old), cityMemory(w, old));
const acted = o.memos.filter((m) => m.out >= 0 && m.by === old);
const heirs = acted.filter((m) => w.events.get(m.out) && (w.events.get(m.out)?.day ?? 0) > deathDay);
console.log('--- the heir inherits');
console.log('  heir holds', w.ledger.balance(P.id(ensurePlayer(w)), 'eq:' + f.id), 'shares of', f.name, 'and', Math.round(w.ledger.balance(P.id(ensurePlayer(w)), DEP)) / 100, 'in cash');
if (o.heirEv >= 0) for (const l of w.events.explain(o.heirEv, 2)) console.log('  ' + l);
for (const m of [...heirs.filter((x) => w.events.get(x.out)?.kind !== 'player.owner.ally'), ...heirs.filter((x) => w.events.get(x.out)?.kind === 'player.owner.ally')].slice(0, 4)) {
  console.log('--- remembered years later');
  for (const l of w.events.explain(m.out, 2)) console.log('  ' + l);
}
console.log('consequences before death', acted.length - heirs.length, 'after death (heir)', heirs.length, 'allies', o.allies, 'leaks', o.leaks, 'witnesses', o.witnesses, 'called', o.guarantees);
