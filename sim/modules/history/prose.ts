// Sentences for a chronicle. The event log explains a cause as indented lines;
import { whole as grouped } from '../player/gamedate.ts';
import { dateYear } from '../../kernel/calendar.ts';
// a reader gets the same chain as prose, with the ids turned into names when we know them.

export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(Math.round(cents));
  if (a >= 1e8) return `${sign}$${(a / 1e8).toFixed(1)} million`;
  if (a >= 1e5) return `${sign}$${(a / 1e5).toFixed(1)} thousand`;
  return `${sign}${grouped(a)}`;
}

/** The calendar date: "15 January, year 1". */
export function when(day: number): string {
  return dateYear(day, false);
}

export function joinAnd(parts: string[]): string {
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

/** Largest dollar figure named in a sentence, in cents. */
export function dollarsMentioned(text: string): number {
  let best = 0;
  const re = /\$(\d+(?:\.\d+)?)(?:\s*(million|thousand))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let n = Number(m[1]);
    const unit = (m[2] ?? '').toLowerCase();
    if (unit === 'million') n *= 1_000_000;
    else if (unit === 'thousand') n *= 1_000;
    const cents = Math.round(n * 100);
    if (cents > best) best = cents;
  }
  const estate = /estate of (\d+)/.exec(text);
  if (estate) {
    const cents = Math.round(Number(estate[1]) * 100);
    if (cents > best) best = cents;
  }
  return best;
}

/** One sentence per line of an explain() dump. The kind and the actor id are dropped; the message stays. */
export function explainParts(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    let s = line.trim().replace(/^<-\s*/, '');
    if (!s) continue;
    if (s.startsWith('(event') || s.includes('older than the log')) {
      out.push('An earlier cause has fallen out of the book.');
      continue;
    }
    const cut = s.indexOf(': ');
    let msg = (cut >= 0 ? s.slice(cut + 2) : s).trim();
    msg = msg.replace(/\s+\(outside shock\)\s*$/, '').replace(/\s+\(see above\)\s*$/, '').trim();
    if (!msg) continue;
    if (!/[.!?]$/.test(msg)) msg += '.';
    if (!out.includes(msg)) out.push(msg);
  }
  return out;
}

function asCause(sentence: string): string {
  let t = sentence.replace(/[.!?]$/, '').trim();
  if (/^world created from seed/.test(t) || /^held off the page$/i.test(t)) return '';
  t = t.replace(/^household spending /, 'households spending ');
  t = t.replace(/\s*\([^)]*\)/g, '');
  return t;
}

/** The cause chain after the story's own sentence, as one paragraph. */
export function causeParagraph(raw: string, story: string): string {
  const parts = explainParts(raw);
  if (parts.length < 2) {
    if (parts[0] && /^world created from seed/.test(parts[0])) return '';
    return raw.includes('(outside shock)') ? 'This was an outside shock.' : '';
  }
  const causes: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const clause = asCause(parts[i]);
    if (!clause || causes.includes(clause)) continue;
    if (story && clause.length > 20 && story.includes(clause.slice(0, 20))) continue;
    causes.push(clause);
    if (causes.length === 4) break;
  }
  if (!causes.length) return '';
  return `This followed from ${joinAnd(causes)}.`;
}

export function softenIds(text: string, nameOf: (id: string) => string | undefined): string {
  return text.replace(/\b(?:eq:)?(?:p_\d+|frm_[A-Za-z0-9_]+)\b/g, (id) => {
    const key = id.startsWith('eq:') ? id.slice(3) : id;
    return nameOf(key) ?? nameOf(id) ?? id;
  });
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6} /gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}
