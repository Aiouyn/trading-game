// The player's evenings out, the people met there, and school: one command, `out`, with an op.
// Registered into the player module the same way careers registers `jobs` and `study`.
import type { World } from '../../kernel/index.ts';
import { classTonight, courseBoard, enrol } from '../courses/index.ts';
import { approach, businessTalk, buyRound, favour, goOut, knownList, listen, offerJob, seatId, VENUES } from '../venues/world.ts';
import type { ActResult, Command } from './index.ts';
import { setOutingCommands } from './index.ts';

export type OutCmd = Extract<Command, { kind: 'out' }>;

const rejected = (why: string): ActResult => ({ status: 'rejected', why });
const usd = (c: number): string => `$${(c / 100).toFixed(2)}`;

function done(r: { ok: boolean; text: string; lines?: string[]; eventId?: number }): ActResult {
  if (!r.ok) return rejected(r.text);
  const out: ActResult = { status: 'accepted', text: r.text };
  if (r.lines) out.lines = r.lines;
  if (r.eventId !== undefined) out.eventId = r.eventId;
  return out;
}

export function handleOuting(w: World, playerId: string, cmd: OutCmd): ActResult {
  const seat = playerId || seatId(w);
  const arg = (cmd.arg ?? '').trim();
  const n = cmd.n ?? 0;
  switch (cmd.op) {
    case 'places': {
      const lines = VENUES.map((v, k) => `${k + 1}. ${v.name}, ${v.where}: ${v.say}`);
      return { status: 'accepted', lines, text: 'six places to spend an evening: go NAME' };
    }
    case 'go': return done(goOut(w, seat, arg, classTonight(w, seat)));
    case 'approach': return done(approach(w, seat, n));
    case 'round': return done(buyRound(w, seat));
    case 'listen': return done(listen(w, seat));
    case 'known': {
      const rows = knownList(w, seat);
      const lines = rows.map((r) => `${r.n}. ${r.name}, who ${r.job} (${r.how}; met ${r.met}x): ${r.line}`);
      return { status: 'accepted', lines: lines.length ? lines : ['you do not know anyone yet'], text: `${rows.length} people you know` };
    }
    case 'business': return done(businessTalk(w, seat, n));
    case 'offer': return done(offerJob(w, seat, n));
    case 'favour': {
      const bits = arg.split(/\s+/);
      return done(favour(w, seat, n, bits[0] ?? '', cmd.cents ?? 0, bits.slice(1).join(' ')));
    }
    case 'courses': {
      const b = courseBoard(w, seat);
      const lines = b.rows.map((r) => `${r.name}: ${r.weeks} weekly evenings, ${usd(r.fee)}${r.done ? ' (finished)' : ''} -- ${r.blurb}`);
      if (b.now) lines.unshift(`now: ${b.now.name}, class ${b.now.sessions} of ${b.now.weeks}`);
      return { status: 'accepted', lines, text: b.now ? `you are in ${b.now.name}` : 'courses: enrol NAME' };
    }
    case 'enrol': return done(enrol(w, seat, arg));
    default: return rejected('not an outing');
  }
}
setOutingCommands(handleOuting);
