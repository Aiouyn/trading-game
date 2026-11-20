// Notices: the things that happen to the player's life and that the player must hear about, each with its reason.
// A layoff, a firm's answer to an application, an offer, rent coming due, a letter from someone who matters.
// Each notice is also an event (`player.notice`, or `player.alert` for one that should stop the clock), so the feed,
// the causal chain and the pause all see it. The newest are listed in the player view as `notices`.
import type { World } from '../../kernel/index.ts';
import { DEP, type EconState } from '../economy/index.ts';
import { residenceOf } from '../property/index.ts';
import { openingRows } from '../careers/jobs.ts';
import { clockText, dateText, usd } from '../player/gamedate.ts';

export interface NoticeAction { label: string; line: string }
export interface NoticeRow {
  id: number; day: number; minute: number; kind: string; title: string; text: string; reason: string;
  eventId: number; from: number; fromName: string; actions: NoticeAction[]; urgent: boolean;
}
interface Book { rows: NoticeRow[]; seq: number; emp: number; rentMonth: number; hired: number; letters: number }

const econ = (w: World): EconState => w.state.economy as EconState;
function book(w: World): Book | undefined {
  const c = w.state.circle as { notices?: Book } | undefined;
  if (!c) return undefined;
  if (!c.notices) c.notices = { rows: [], seq: 1, emp: -2, rentMonth: -1, hired: -1, letters: -1 };
  return c.notices;
}
function playerOf(w: World): number {
  const st = w.state.player as { who?: number; ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  const key = st?.ids?.[0];
  const who = (key && st?.seat?.[key]?.who) ?? st?.who ?? -1;
  const P = econ(w).P;
  return typeof who === 'number' && who >= 0 && who < P.n && P.alive(who) ? who : -1;
}
function minuteNow(w: World): number {
  const c = w.state.clock as { min?: number } | undefined;
  return typeof c?.min === 'number' ? c.min : 480;
}
function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/** Tell the player something. `reason` says why it happened; `cause` is the event behind it. */
export function notify(w: World, spec: { kind: string; title: string; text: string; reason?: string; cause: number; from?: number; actions?: NoticeAction[]; urgent?: boolean }): NoticeRow | undefined {
  const b = book(w);
  const me = playerOf(w);
  if (!b || me < 0) return undefined;
  const P = econ(w).P;
  const reason = spec.reason ?? '';
  const body = [spec.text, reason ? `Why: ${reason}` : ''].filter(Boolean).join(' ');
  const ev = w.events.emit(spec.urgent ? 'player.alert' : 'player.notice', `${spec.title}. ${body}`, [spec.cause >= 0 ? spec.cause : w.genesis], P.id(me));
  const from = spec.from ?? -1;
  const row: NoticeRow = {
    id: b.seq++, day: w.day, minute: minuteNow(w), kind: spec.kind, title: spec.title, text: spec.text, reason, eventId: ev,
    from, fromName: from >= 0 && from < P.n ? P.name(from) : '', actions: spec.actions ?? [], urgent: !!spec.urgent,
  };
  b.rows.push(row);
  if (b.rows.length > 60) b.rows.splice(0, b.rows.length - 60);
  return row;
}

/** The player's newest notices, newest first. */
export function noticeRows(w: World, n = 30): NoticeRow[] {
  const c = w.state.circle as { notices?: Book } | undefined;
  return (c?.notices?.rows ?? []).slice(-n).reverse();
}

function lastLetterKinds(): Set<string> { return new Set(['reply', 'thanks', 'intro', 'favour', 'follow', 'life', 'hint', 'memory', 'repay', 'dinner', 'ally', 'rival', 'milestone', 'meet', 'note', 'gloat']); }

/** A letter has landed from someone the player knows: a notice that says who wrote and what about. */
export function noticeLetter(w: World, letter: { id: number; from: number; kind: string; text: string; eventId: number }): void {
  if (!book(w) || playerOf(w) < 0) return;
  if (!lastLetterKinds().has(letter.kind)) return;
  const P = econ(w).P;
  if (letter.from < 0 || letter.from >= P.n) return;
  const answer = letter.kind === 'reply' || letter.kind === 'thanks' || letter.kind === 'intro' || letter.kind === 'favour';
  const first = letter.text.replace(/\s+/g, ' ').trim().slice(0, 320);
  notify(w, {
    kind: answer ? 'answer' : 'message', title: answer ? `${P.name(letter.from)} answers you` : `${P.name(letter.from)} writes`,
    text: first, cause: letter.eventId, from: letter.from, actions: [{ label: 'Open the message', line: 'mail' }],
  });
}

function reasonOfLoss(w: World, me: number, firmIdx: number): { reason: string; cause: number; kind: string } {
  const s = econ(w), P = s.P;
  const f = firmIdx >= 0 ? s.firms[firmIdx] : undefined;
  const last = P.lastEv[me] >= 0 ? w.events.get(P.lastEv[me]) : undefined;
  const fresh = last && w.day - last.day <= 2 ? last : undefined;
  if (f?.closed) return { reason: `${f.name} shut its doors and sent everyone home`, cause: fresh?.id ?? f.profitEv ?? s.macroEv, kind: 'closed' };
  if (fresh?.kind === 'firm.layoffs') {
    const why = fresh.msg.replace(/: laying off staff.*$/, '').replace(/^sales of (.+) below plan$/, 'sales of $1 ran below plan');
    const cut = f ? Math.max(0, (f.bornWorkers || f.workers) - f.workers) : 0;
    return { reason: `${f?.name ?? 'the firm'} was laying people off: ${why}${cut > 0 ? `, ${cut} fewer on the payroll than at the start` : ''}. Newest hires go first`, cause: fresh.id, kind: 'layoff' };
  }
  if (fresh?.kind === 'firm.cashCrunch') return { reason: `${f?.name ?? 'the firm'} could not meet its wage bill, paid part of it and cut staff to cover the rest`, cause: fresh.id, kind: 'layoff' };
  if (fresh?.kind === 'person.breakdown') return { reason: `you broke down under the strain: ${fresh.msg.replace(/^.*? after /, '')}`, cause: fresh.id, kind: 'breakdown' };
  if (fresh?.kind === 'firm.ceoFired') return { reason: `the owners removed the chief after losing months`, cause: fresh.id, kind: 'fired' };
  if (fresh?.kind.startsWith('law.') || fresh?.kind.startsWith('court.')) return { reason: `you were taken in: ${fresh.msg}`, cause: fresh.id, kind: 'law' };
  if (f && f.lastProfit < 0) return { reason: `${f.name} lost ${usd(-f.lastProfit)} last month and cut its payroll`, cause: f.profitEv ?? s.macroEv, kind: 'layoff' };
  if (f) return { reason: `${f.name} reduced its staff to match its sales`, cause: f.layoffEv ?? f.profitEv ?? s.macroEv, kind: 'layoff' };
  return { reason: 'the firm let you go', cause: s.macroEv, kind: 'layoff' };
}

function nextSteps(w: World, me: number): string {
  const s = econ(w);
  const benefit = Math.round(s.wage * (s.benefitRate ?? 0.4) * 7 * Math.min(1, s.P.skill[me]));
  const rows = openingRows(w, me).filter((r) => r.taken);
  const best = rows[0];
  const tail = best ? ` ${rows.length} ${rows.length === 1 ? 'firm is' : 'firms are'} taking people on; ${best.name} offers ${usd(best.wage)} a week for ${/^[aeiou]/i.test(best.role) ? 'an' : 'a'} ${best.role}.` : ' No firm is short of hands you could fill today.';
  return `The benefit pays about ${usd(benefit)} a week while you look.${tail}`;
}

/** Called once a day, after the economy has closed: spot what changed in the player's work and home and say so. */
export function tendNotices(w: World): void {
  const b = book(w);
  const me = playerOf(w);
  if (!b || me < 0) return;
  const s = econ(w), P = s.P;
  const emp = P.employer[me];
  if (b.emp === -2) { b.emp = emp; b.hired = -1; }
  else if (emp !== b.emp) {
    const was = b.emp;
    b.emp = emp;
    if (was >= 0 && emp < 0) {
      const quit = w.events.last('career.quit');
      const quitToday = quit !== undefined && w.events.get(quit)?.actor === P.id(me) && w.day - (w.events.get(quit)?.day ?? -9) <= 1;
      const retired = w.events.last('player.retire');
      const retiredToday = retired !== undefined && w.day - (w.events.get(retired)?.day ?? -9) <= 1;
      if (!quitToday && !retiredToday) {
        const old = s.firms[was];
        const r = reasonOfLoss(w, me, was);
        const verb = r.kind === 'breakdown' ? 'You left' : r.kind === 'closed' ? `${old?.name ?? 'Your firm'} closed` : r.kind === 'fired' ? 'You lost your seat' : 'You were let go';
        notify(w, {
          kind: r.kind === 'breakdown' ? 'job' : 'layoff',
          title: r.kind === 'closed' ? `${old?.name ?? 'Your firm'} has closed` : r.kind === 'breakdown' ? `You left ${old?.name ?? 'your job'}` : `You lost your job at ${old?.name ?? 'your firm'}`,
          text: `${verb}${old && r.kind !== 'closed' ? ` at ${old.name}` : ''} on ${dateText(w.day)}. ${nextSteps(w, me)}`,
          reason: cap(r.reason) + '.', cause: r.cause, urgent: true,
          actions: [{ label: 'See who is hiring', line: 'jobs' }, { label: 'Read the sheet', line: 'sheet' }],
        });
      }
    }
  }
  // Rent comes due on the last day of the month: tell the player three days ahead, and whether the account can meet it.
  const home = residenceOf(w, me);
  const month = Math.floor(w.day / 30);
  if (home && home.tenure === 'rented' && home.rent > 0 && home.due !== null && home.due - w.day <= 3 && b.rentMonth !== month) {
    b.rentMonth = month;
    const cash = Math.floor(w.ledger.balance(P.id(me), DEP));
    const left = home.due - w.day;
    const short = cash < home.rent;
    notify(w, {
      kind: 'rent', title: `Rent of ${usd(home.rent)} is due ${left <= 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`}`,
      text: `Your room in ${home.neighbourhood} is paid on ${dateText(home.due)}. You hold ${usd(cash)}.`,
      reason: short ? `You are ${usd(home.rent - cash)} short, and a missed month can end in eviction.` : `It comes out of your account on its own, so keep the balance above it.`,
      cause: w.events.last('property.price') ?? s.macroEv, urgent: short,
      actions: short ? [{ label: 'See who is hiring', line: 'jobs' }, { label: 'Read the sheet', line: 'sheet' }] : [],
    });
  }
}
