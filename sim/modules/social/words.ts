// One way to write money, counts and percentages, and one way to turn a letter's
// facts into a sentence that sounds like the person who sent it.
// Text only: nothing here touches the ledger or a random stream.

export const CITY = 'Port Avalon';

const SECTOR: Record<string, string> = {
  ENERGY: 'energy', AGRICULTURE: 'farming', MINING: 'mining', METALS: 'metals',
  CHEMICALS: 'chemicals', CONSTRUCTION: 'building', MANUFACTURING: 'manufacturing',
  TECHNOLOGY: 'technology', TRANSPORT: 'transport', RETAIL: 'retail',
  HEALTHCARE: 'healthcare', FINANCE: 'finance', MEDIA: 'media',
};

export function sectorWord(sector: string): string {
  return SECTOR[sector] ?? (sector ? sector.toLowerCase() : '');
}

function commas(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Cents, as prose. `$96,000.75` under a million, `$1.2 million` at and above. */
export function money(cents: number): string {
  const neg = cents < 0;
  const a = Math.abs(Math.round(cents));
  const sign = neg ? '-' : '';
  if (a >= 100_000_000) {
    const m = a / 100_000_000;
    const body = m >= 100 ? m.toFixed(0) : (Math.round(m * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return `${sign}$${body} million`;
  }
  const [whole, frac] = (a / 100).toFixed(2).split('.');
  if (frac === '00') return `${sign}$${commas(whole)}`;
  return `${sign}$${commas(whole)}.${frac}`;
}

/** `789 jobs`. */
export function jobs(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${commas(String(v))} ${v === 1 ? 'job' : 'jobs'}`;
}

/** A count and its noun: `12 people`. */
export function count(n: number, one: string, many: string): string {
  const v = Math.max(0, Math.round(n));
  return `${commas(String(v))} ${v === 1 ? one : many}`;
}

/** A percentage with a sign: `+2.5%`, `-0.4%`. */
export function signedPct(percent: number, digits = 1): string {
  if (!Number.isFinite(percent)) return '+0%';
  const sign = percent < 0 ? '-' : '+';
  return `${sign}${Math.abs(percent).toFixed(digits)}%`;
}

export type Voice = 'warm' | 'blunt' | 'anxious' | 'proud' | 'formal' | 'cold';

export const SHAPES = ['three', 'dash', 'because', 'and', 'ask'] as const;
export type Shape = (typeof SHAPES)[number];

const KIND_BIAS: Record<string, number> = {
  hint: 0, life: 1, note: 2, follow: 3, memory: 4, thanks: 1, invite: 2,
  milestone: 0, gloat: 3, rival: 4, ally: 0, intro: 1, meet: 2, dinner: 3,
  favour: 4, repay: 0, loan: 2,
};

const VOICE_BIAS: Record<Voice, number> = {
  warm: 0, blunt: 1, anxious: 2, proud: 3, formal: 4, cold: 2,
};

/** Several shapes per kind. `avoid` is the shape the previous other writer just used. */
export function chooseShape(voice: Voice, kind: string, salt: number, avoid: string): Shape {
  const start = (KIND_BIAS[kind] ?? 0) + VOICE_BIAS[voice] + (Math.abs(salt) % 3);
  let shape: Shape = SHAPES[start % SHAPES.length];
  if (shape === avoid) shape = SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length];
  if (shape === avoid) shape = SHAPES[(SHAPES.indexOf(shape) + 2) % SHAPES.length];
  return shape;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

const OPENERS = new Set([
  'a', 'an', 'the', 'it', "it's", 'its', 'that', 'this', 'you', 'your', 'we', 'my', 'his', 'her', 'our',
  'there', "there's", 'nothing', 'work', 'health', 'come', "don't", 'dont', 'if', 'last', 'after', 'when',
  'what', 'no', 'yes', 'tell', 'write', 'another', 'a',
]);

function low(s: string): string {
  if (!s) return s;
  const first = (s.split(' ')[0] ?? '').replace(/[.!?,:—-]+$/, '');
  if (/^(I|I'm|I've|I'll|I'd)$/.test(first)) return s;
  // A place or a person keeps its capital. "Riverside Lofts" must not become "riverside Lofts".
  // "You're" is still the word "you", and it has to follow a colon in lower case.
  const bare = first.toLowerCase().replace(/'.*/, '');
  if (/^[A-Z]/.test(first) && !OPENERS.has(first.toLowerCase()) && !OPENERS.has(bare)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** A tic only when the voice would actually say it. The caller allows it on at most one letter in thirty. */
function tic(voice: Voice): string {
  if (voice === 'cold') return 'I will not dress it up.';
  if (voice === 'formal') return 'I will be plain.';
  if (voice === 'blunt') return 'The work is ordinary.';
  return '';
}

function callback(since: string, salt: number): string {
  const n = Math.abs(salt) % 4;
  if (n === 0) return `That goes back to ${since}.`;
  if (n === 1) return `I've had it in mind since ${since}.`;
  if (n === 2) return `You remember ${since}.`;
  return `It's been with me since ${since}.`;
}

export interface LetterParts {
  voice: Voice;
  shape: Shape;
  fact: string;
  you: string;
  mine: string;
  /** "the dinner in March". Empty when there is nothing particular to call back. */
  since: string;
  casual: boolean;
  worry: boolean;
  /** Stable mix of writer and day. Not a random draw. */
  salt?: number;
  /** When set, a voice may add its tic. Callers set this on at most one letter in thirty. */
  ticOk?: boolean;
}

function sentences(s: string): string[] {
  const t = tidy(s);
  if (!t) return [];
  return t.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean).map((p) => /[.!?]$/.test(p) ? p : p + '.');
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9$% ]/g, '').replace(/\s+/g, ' ').trim();
}

/** A number already said: `16 jobs`, `$600.00`. A later slot that carries it is dropped. */
function factKeys(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/[\d,]+ jobs?/gi)) out.push(m[0].toLowerCase().replace(/,/g, ''));
  for (const m of s.matchAll(/\$[\d,]+(?:\.\d+)?(?: million)?/gi)) out.push(m[0].toLowerCase().replace(/,/g, ''));
  return out;
}

/**
 * At most four sentences: the news, what it means for the reader, what the writer
 * will do, and sometimes a callback. A slot is dropped rather than said twice.
 * The old closer ('I will not dress it up', 'I will be plain', 'the work is ordinary')
 * is a tic: the caller allows it on at most one letter in thirty, and only a voice that would say it uses it.
 */
export function renderLetter(p: LetterParts): string {
  const salt = p.salt ?? (p.fact.length * 13 + p.since.length * 7 + p.voice.charCodeAt(0));
  const news = sentences(p.fact);
  const reader = sentences(p.you);
  const will = sentences(p.mine);
  const back = p.since && Math.abs(salt) % 2 === 0 ? sentences(callback(p.since, salt)) : [];
  const aside = p.ticOk ? tic(p.voice) : '';
  const usedNorm = new Set<string>();
  const usedKeys = new Set<string>();
  const out: string[] = [];
  const take = (list: string[]): void => {
    for (const s of list) {
      if (out.length >= 4 || !s) continue;
      const n = norm(s);
      if (!n || usedNorm.has(n)) continue;
      const ks = factKeys(s);
      if (ks.some((k) => usedKeys.has(k))) continue;
      let dup = false;
      for (const prev of usedNorm) {
        if (prev.length > 18 && n.length > 18 && (prev.includes(n) || n.includes(prev))) dup = true;
      }
      if (dup) continue;
      usedNorm.add(n);
      for (const k of ks) usedKeys.add(k);
      out.push(s);
    }
  };
  const glue = news.length > 0 && reader.length > 0
    && !/\band\b/i.test(news[0]) && !/\band\b/i.test(reader[0]);
  if (p.shape === 'dash' && glue) {
    take([`${news[0].replace(/[.!?]$/, '')} — ${low(reader[0].replace(/[.!?]$/, ''))}.`]);
    take(news.slice(1));
    take(reader.slice(1));
    take(will);
  } else if (p.shape === 'and' && glue) {
    take([`${news[0].replace(/[.!?]$/, '')}, and ${low(reader[0].replace(/[.!?]$/, ''))}.`]);
    take(news.slice(1));
    take(reader.slice(1));
    take(will);
  } else if (p.shape === 'because' && glue && news[0].length < 90 && reader[0].length < 90) {
    take([`${news[0].replace(/[.!?]$/, '')}: ${low(reader[0].replace(/[.!?]$/, ''))}.`]);
    take(news.slice(1));
    take(reader.slice(1));
    take(will);
  } else {
    take(news);
    take(reader);
    take(will);
  }
  take(back);
  if (aside) take([aside]);
  return tidy(out.join(' '));
}

export interface HeadlineIn {
  paper: string;
  tag: string;
  msg: string;
  name: string;
  sector: string;
  profit: number;
  salt: number;
}

function firmBit(name: string, sector: string): string {
  if (!name) return `a firm in ${CITY}`;
  if (!sector) return `${name} in ${CITY}`;
  return `${name}, the ${sector} firm in ${CITY}`;
}

function pick(list: string[], salt: number): string {
  return list[Math.abs(salt) % list.length];
}

function defaultStake(msg: string): string {
  const wrote = /wrote off ([\d.]+)M/.exec(msg);
  if (wrote) return money(Number(wrote[1]) * 100_000_000);
  const def = /defaulted on ([\d.]+)/.exec(msg);
  if (def) return money(Number(def[1]) * 100);
  return '';
}

/** A newspaper line: verb, the money at stake, the firm, its trade, the city. */
export function paperHeadline(h: HeadlineIn): string {
  const paper = h.paper || 'The paper';
  const who = firmBit(h.name, h.sector);
  const salt = h.salt;
  switch (h.tag) {
    case 'firm.default': {
      const stake = defaultStake(h.msg);
      const verb = pick(['defaults on', 'fails to repay', 'misses'], salt);
      return stake ? `${paper}: ${who}, ${verb} ${stake}` : `${paper}: ${who} defaults`;
    }
    case 'firm.ceoFired': {
      const m = /after (\d+) losing months/.exec(h.msg);
      const span = m ? `${m[1]} losing months` : 'a run of losses';
      const verb = pick(['removes its chief after', 'ousts the chief after', 'lets the chief go after'], salt);
      return `${paper}: ${who}, ${verb} ${span}`;
    }
    case 'firm.succession': {
      const verb = pick(['names a new chief', 'hands the top job to a successor', 'installs a new chief'], salt);
      return `${paper}: ${who}, ${verb}`;
    }
    case 'firm.cashCrunch': {
      const m = /paid ([\d.]+)% of wages and cut ([\d.]+)%/.exec(h.msg);
      if (!m) return `${paper}: ${who} cannot meet the wage bill`;
      const verb = pick(['pays', 'meets', 'covers'], salt);
      const cut = Number(m[2]);
      const tail = cut > 0 ? `, and the payroll is cut ${cut.toFixed(0)}%` : '';
      if (!(Number(m[1]) > 0)) return `${paper}: ${who}, paid none of the wages${tail}`;
      return `${paper}: ${who}, ${verb} ${Number(m[1]).toFixed(0)}% of wages${tail}`;
    }
    case 'cb.rate': {
      const m = /policy rate ([\d.]+)% -> ([\d.]+)%/.exec(h.msg);
      if (!m) return `${paper}: the central bank moves in ${CITY}. ${h.msg}`;
      const a = Number(m[1]);
      const b = Number(m[2]);
      const verb = b > a
        ? pick(['raises', 'lifts', 'increases'], salt)
        : b < a
          ? pick(['cuts', 'lowers', 'trims'], salt)
          : pick(['holds', 'leaves', 'keeps'], salt);
      return `${paper}: the central bank ${verb} the policy rate in ${CITY} from ${a.toFixed(2)}% to ${b.toFixed(2)}%, a move of ${signedPct(b - a, 2)}`;
    }
    case 'mkt.move': {
      const m = /close (\d+) -> (\d+) \(([+-]?[\d.]+)%\)/.exec(h.msg);
      if (!m) return `${paper}: ${who} shares move`;
      const next = Number(m[2]);
      const pct = Number(m[3]);
      const verb = pct < 0
        ? pick(['fall', 'drop', 'slide'], salt)
        : pct > 0
          ? pick(['rise', 'climb', 'gain'], salt)
          : pick(['hold', 'sit', 'stay'], salt);
      const trade = h.sector ? `${h.sector} ` : '';
      return `${paper}: ${h.name || 'Shares'} ${trade}shares ${verb} ${signedPct(pct, 2)} to ${money(next)} in ${CITY}`;
    }
    case 'shock': {
      const body = h.msg ? h.msg.charAt(0).toUpperCase() + h.msg.slice(1) : 'A shock hits the city';
      return `${paper}: ${CITY}. ${body}`;
    }
    case 'insider.profit': {
      const loss = h.profit < 0;
      const verb = loss
        ? pick(['is heading for', 'leaks', 'warns of'], salt)
        : pick(['is heading for', 'leaks', 'shows'], salt);
      const word = loss ? 'loss' : 'profit';
      return `${paper}: ${who}, ${verb} a ${word} of ${money(Math.abs(h.profit))} with a week still to run`;
    }
    case 'law.case': {
      const verb = pick(['reports', 'covers', 'prints'], salt);
      const bit = h.msg.length > 140 ? h.msg.slice(0, 137).trim() + '…' : h.msg;
      return `${paper}: the paper ${verb} a case at ${who}. ${bit}`;
    }
    default:
      return `${paper}: ${who}. ${h.msg}`;
  }
}

/** A kept story may name "the energy firm in Port Avalon" only the first time that firm appears in a week. */
export function firmStyle(name: string, sector: string, first: boolean): string {
  if (!name) return first ? `a firm in ${CITY}` : 'the firm';
  if (first && sector) return `${name}, the ${sector} firm in ${CITY}`;
  return name;
}

/** A round figure for "near $161,000". Keeps a thousands comma so a later reader does not treat it as a new stake. */
export function nearMoney(cents: number): string {
  const dollars = Math.abs(Math.round(cents)) / 100;
  const step = dollars >= 100_000 ? 1000 : dollars >= 10_000 ? 500 : dollars >= 1000 ? 100 : 1;
  const rough = Math.max(step, Math.round(dollars / step) * step);
  return '$' + commas(String(rough));
}

export function parseMoneyCents(token: string): number {
  const m = /\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?([kKmM])?(?:\s*(million|thousand))?/.exec(token);
  if (!m) return 0;
  const whole = Number(m[1].replace(/,/g, ''));
  const frac = m[2] ? Number(`0.${m[2]}`) : 0;
  let n = whole + frac;
  const suf = (m[3] ?? '').toLowerCase();
  const unit = (m[4] ?? '').toLowerCase();
  if (suf === 'k' || unit === 'thousand') n *= 1_000;
  else if (suf === 'm' || unit === 'million') n *= 1_000_000;
  return Math.round(n * 100);
}

/** Largest dollar figure in a line, in cents. Used to rank a story, not to print it. */
export function stakeCents(msg: string): number {
  let best = 0;
  for (const m of msg.matchAll(/\$\d[\d,]*(?:\.\d+)?[kKmM]?(?:\s*(?:million|thousand))?/gi)) {
    const c = parseMoneyCents(m[0]);
    if (c > best) best = c;
  }
  return best;
}

export function surprisePct(msg: string): number {
  let best = 0;
  for (const m of msg.matchAll(/([+-]?\d+(?:\.\d+)?)%/g)) {
    const n = Math.abs(Number(m[1]));
    if (n > best) best = n;
  }
  return best;
}

function capWord(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface LeakFirm { name: string; sector: string; profit: number }

/**
 * One month-end leak story for the whole city. The biggest sector leads.
 * A second sector is a clause in the same story when it is at least half as large.
 */
export function leakRoundup(paper: string, firms: LeakFirm[], salt: number): string {
  const by = new Map<string, LeakFirm[]>();
  for (const f of firms) {
    if (!f.name) continue;
    const key = f.sector || 'business';
    const list = by.get(key) ?? [];
    list.push(f);
    by.set(key, list);
  }
  const sectors = [...by.entries()].map(([sector, list]) => {
    const total = list.reduce((s, f) => s + Math.abs(f.profit), 0);
    const signed = list.reduce((s, f) => s + f.profit, 0);
    const top = [...list].sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit) || a.name.localeCompare(b.name)).slice(0, 3);
    return { sector, total, signed, top };
  }).sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));
  if (!sectors.length) return `${paper}: the month's figures stay off the page`;
  const lead = phraseSector(sectors[0], salt);
  const second = sectors[1] && sectors[1].total * 2 >= sectors[0].total ? phraseSector(sectors[1], salt + 1) : '';
  const body = second ? `${lead} ${second}` : lead;
  return `${paper}: ${body}`;
}

function closeEnough(list: LeakFirm[]): boolean {
  if (list.length < 2) return true;
  const vals = list.map((f) => Math.abs(f.profit)).sort((a, b) => a - b);
  const lo = vals[0], hi = vals[vals.length - 1];
  if (hi <= 0) return true;
  return (hi - lo) / hi <= 0.2;
}

function midCents(list: LeakFirm[]): number {
  const vals = list.map((f) => f.profit).sort((a, b) => Math.abs(a) - Math.abs(b));
  return vals[Math.floor(vals.length / 2)] ?? 0;
}

function phraseSector(g: { sector: string; signed: number; top: LeakFirm[] }, salt: number): string {
  const mixed = g.top.some((f) => f.profit < 0) && g.top.some((f) => f.profit >= 0);
  const strong = !mixed && g.signed >= 0;
  const many = g.top.length > 1;
  const word = g.sector === 'business' ? (many ? 'Firms' : 'A firm') : `${capWord(g.sector)} ${many ? 'firms' : 'firm'}`;
  const names = joinNames(g.top.map((f) => f.name));
  const each = closeEnough(g.top);
  const nearBit = (f: LeakFirm): string => f.profit < 0 ? `near a loss of ${nearMoney(f.profit)}` : `near ${nearMoney(f.profit)}`;
  const listed = g.top.map((f) => `${f.name} ${nearBit(f)}`).join(g.top.length === 2 ? ' and ' : ', ').replace(/, ([^,]+)$/, ' and $1');
  const mid = nearMoney(midCents(g.top));
  const tail = mixed || !each
    ? listed
    : strong
      ? `${names} each near ${mid}`
      : `${names} each near a loss of ${mid}`;
  const tone = mixed ? 'a mixed month' : strong ? 'a strong month' : 'a weak month';
  const verb = mixed
    ? ['head for a mixed month', 'are heading for a mixed month', 'look set for a mixed month', 'are on course for a mixed month'][Math.abs(salt) % 4]
    : strong
      ? ['head for a strong month', 'are heading for a strong month', 'look set for a strong month', 'are on course for a strong month'][Math.abs(salt) % 4]
      : ['head for a weak month', 'are heading for a weak month', 'look set for a weak month', 'are on course for a weak month'][Math.abs(salt) % 4];
  const shape = Math.abs(salt + 1) % 4;
  if (!many) {
    const one = g.top[0];
    const way = tone;
    const bit = one.profit < 0 ? `near a loss of ${nearMoney(one.profit)}` : `near ${nearMoney(one.profit)}`;
    if (shape === 0) return `${one.name} is heading for ${way}, ${bit}.`;
    if (shape === 1) return `${one.name} looks set for ${way}, ${bit}.`;
    if (shape === 2) return `A ${mixed ? 'mixed' : strong ? 'strong' : 'weak'} month at ${one.name}, ${bit}.`;
    return `Heading into ${way}, ${one.name} is ${bit}.`;
  }
  if (shape === 0) return `${word} ${verb}: ${tail}.`;
  if (shape === 1) {
    const bit = each
      ? (mixed ? listed : strong ? `${names} are each near ${mid}` : `${names} are each near a loss of ${mid}`)
      : listed;
    return `${bit}, as ${g.sector} firms ${verb}.`;
  }
  if (shape === 2) return `A ${mixed ? 'mixed' : strong ? 'strong' : 'weak'} month in ${g.sector}: ${tail}.`;
  const label = mixed ? 'mixed' : strong ? 'strong' : 'weak';
  return `${tail} — a ${label} month for ${g.sector}.`;
}

function moneyToken(msg: string): string {
  let best = '';
  let cents = -1;
  for (const m of msg.matchAll(/\$\d[\d,]*(?:\.\d+)?[kKmM]?(?:\s*(?:million|thousand))?/gi)) {
    const c = parseMoneyCents(m[0]);
    if (c > cents) { cents = c; best = m[0]; }
  }
  return best;
}

export interface RetellIn {
  paper: string;
  kind: string;
  msg: string;
  name: string;
  sector: string;
  first: boolean;
  salt: number;
}

/** A printed headline. Verbs and the order of the clause change with the event. The city formula is optional. */
export function retell(r: RetellIn): string {
  const who = firmStyle(r.name, r.sector, r.first);
  const paper = r.paper || 'The paper';
  const msg = r.msg;
  const salt = r.salt;
  const stake = moneyToken(msg);
  const earn = / Q(\d):/.exec(msg);
  const beat = /\((beat|miss|met) ([\d.]+)%\)/.exec(msg);
  if (earn && /profit /.test(msg)) {
    const raw = /profit (\$[\d,]+(?:\.\d+)?[kKmM]?|\$[\d.]+\s*million)/.exec(msg)?.[1] ?? stake;
    const profit = raw ? money(parseMoneyCents(raw)) : stake;
    const q = earn[1];
    const way = beat?.[1] ?? '';
    const lines = way === 'miss'
      ? [`${who} misses its quarter. Profit is ${profit}.`, `${who} comes up short in Q${q}, with profit of ${profit}.`, `Q${q} at ${who} misses. The profit is ${profit}.`, `${who} falls short for Q${q}. Profit is ${profit}.`]
      : way === 'beat'
        ? [`${who} beats the quarter, with profit of ${profit}.`, `${who} clears Q${q} with profit of ${profit}.`, `Profit of ${profit} puts ${who} ahead of the quarter.`, `Q${q} at ${who} comes in ahead, at ${profit}.`]
        : [`${who} reports profit of ${profit} for Q${q}.`, `${who} turns in profit of ${profit}.`, `Q${q} profit at ${who} is ${profit}.`, `For Q${q}, ${who} made ${profit}.`];
    return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
  }
  const move = /shares (fall|drop|slide|rise|climb|gain|hold|sit|stay) ([+-][\d.]+)% to (\$[\d,]+\.\d+|\$[\d.]+ million)/.exec(msg);
  if (move || r.kind === 'mkt.move' && stake) {
    const pct = move?.[2] ?? (/([+-][\d.]+)%/.exec(msg)?.[1] ?? '0');
    const px = move?.[3] ?? stake;
    const n = Number(pct);
    const down = ['fall', 'drop', 'slide', 'lose'];
    const up = ['rise', 'gain', 'climb', 'add'];
    const verb = n < 0 ? down[Math.abs(salt) % down.length] : n > 0 ? up[Math.abs(salt) % up.length] : 'hold';
    const abs = String(Math.abs(n) >= 10 ? Math.round(Math.abs(n)) : Math.round(Math.abs(n) * 10) / 10);
    const where = r.first ? '' : '';
    const dir = n < 0 ? 'down' : n > 0 ? 'up' : 'flat';
    const lines = [
      `${who} shares ${verb} ${abs}% to ${px}${where}.`,
      `A ${abs}% ${n < 0 ? 'fall' : n > 0 ? 'rise' : 'pause'} takes ${who} shares to ${px}.`,
      `${who} shares ${verb} to ${px}, ${dir} ${abs}%.`,
      `${px} is the new price at ${who}, ${dir} ${abs}%.`,
    ];
    return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
  }
  if (/defaults on|fails to repay|misses /.test(msg) && stake) {
    const lines = [
      `${who} defaults on ${stake}.`,
      `${stake} goes unpaid at ${who}.`,
      `${who} fails to repay ${stake}.`,
    ];
    return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
  }
  if (/chief/.test(msg)) {
    const span = /after (\d+) losing months/.exec(msg)?.[1];
    const why = span ? `after ${span} losing months` : 'after a run of losses';
    const lines = /new chief|successor|names a new|hands the top|installs a new/.test(msg)
      ? [`${who} names a new chief.`, `${who} hands the top job to a successor.`, `A new chief takes over at ${who}.`]
      : [`${who} removes its chief ${why}.`, `The chief is out at ${who} ${why}.`, `${who} lets the chief go ${why}.`];
    return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
  }
  if (/wage/.test(msg)) {
    const paid = /pays (\d+)%|meets (\d+)%|covers (\d+)%|paid ([\d.]+)%/.exec(msg);
    const cut = /payroll moves ([+-]\d+)%|cut ([\d.]+)%/.exec(msg);
    if (paid) {
      const pct = paid[1] || paid[2] || paid[3] || paid[4];
      const n = cut ? Math.abs(Number(cut[1] ?? cut[2])) : 0;
      const pctN = Number(pct).toFixed(0);
      const cutWord = n > 0 ? `the payroll is cut ${Math.round(n)}%` : '';
      const lines = Number(pct) <= 0
        ? [
          cutWord ? `${who} paid none of the wages, and ${cutWord}.` : `${who} paid none of the wages.`,
          cutWord ? `No wages were paid at ${who}, and ${cutWord}.` : `No wages were paid at ${who}.`,
          cutWord ? `${who} covered none of the wage bill. The payroll is cut ${Math.round(n)}%.` : `${who} covered none of the wage bill.`,
        ]
        : [
          cutWord ? `${who} meets ${pctN}% of wages, and ${cutWord}.` : `${who} meets ${pctN}% of wages.`,
          cutWord ? `Wages at ${who} are ${pctN}% covered, and ${cutWord}.` : `Wages at ${who} are ${pctN}% covered.`,
          cutWord ? `${who} covers ${pctN}% of the wage bill. The payroll is cut ${Math.round(n)}%.` : `${who} covers ${pctN}% of the wage bill.`,
        ];
      return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
    }
    return `${paper}: ${who} cannot meet the wage bill.`;
  }
  if (/policy rate/.test(msg)) {
    const m = /from ([\d.]+)% to ([\d.]+)%/.exec(msg);
    if (!m) return `${paper}: the central bank moves the policy rate in ${CITY}.`;
    const a = Number(m[1]), b = Number(m[2]);
    const verb = b > a ? ['raises', 'lifts', 'increases'][Math.abs(salt) % 3] : b < a ? ['cuts', 'lowers', 'trims'][Math.abs(salt) % 3] : ['holds', 'leaves', 'keeps'][Math.abs(salt) % 3];
    const lines = [
      `The central bank ${verb} the policy rate from ${a.toFixed(2)}% to ${b.toFixed(2)}%.`,
      `The policy rate in ${CITY} ${b > a ? 'rises' : b < a ? 'falls' : 'stays put'}, from ${a.toFixed(2)}% to ${b.toFixed(2)}%.`,
      `${CITY}'s policy rate goes from ${a.toFixed(2)}% to ${b.toFixed(2)}%.`,
    ];
    return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
  }
  const ahead = /ahead of last month by|beats last month by|runs ahead of last month by/.test(msg);
  const behind = /behind last month by|misses last month by|lags last month by/.test(msg);
  if ((ahead || behind) && stake) {
    const hows = /One unchecked source/.test(msg)
      ? ['One source, and it is unchecked.', 'A single source, still unchecked.', 'Only one person is saying it.']
      : /Two sources/.test(msg)
        ? ['Two sources agree.', 'Two people inside say the same thing.', 'It comes from two sources.']
        : ['A source at the firm says so.', 'Someone at the firm has been talking.', 'Word of it is coming from inside the firm.'];
    const how = hows[Math.abs(Math.floor(salt / 5)) % hows.length];
    const verb = ahead
      ? ['pulls ahead of last month by', 'beats last month by', 'is ahead of last month by', 'runs ahead of last month by'][Math.abs(Math.floor(salt / 4)) % 4]
      : ['falls behind last month by', 'misses last month by', 'lags last month by', 'trails last month by'][Math.abs(Math.floor(salt / 4)) % 4];
    const lines = [
      `${who} ${verb} ${stake}. ${how}`,
      `${stake} is how far ${who} ${ahead ? 'is ahead of' : 'is behind'} last month. ${how}`,
      `${who} ${ahead ? 'is up' : 'is down'} ${stake} on last month. ${how}`,
      `${how} ${who} ${verb} ${stake}.`,
    ];
    return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
  }
  if (/shares move from/.test(msg) && stake) {
    const m = /from (\$[\d,]+\.\d+|\$[\d.]+ million) to (\$[\d,]+\.\d+|\$[\d.]+ million), ([+-][\d.]+)%/.exec(msg);
    if (m) {
      const pct = Number(m[3]);
      const lines = [
        `${who} shares move from ${m[1]} to ${m[2]} before the figures, ${signedPct(pct, 1)}.`,
        `Before the figures, ${who} shares go from ${m[1]} to ${m[2]}.`,
        `${who} shares are ${pct < 0 ? 'down' : 'up'} to ${m[2]} before the figures.`,
        `${who} shares are at ${m[2]} before the figures, ${pct < 0 ? 'off' : 'up'} from ${m[1]}.`,
      ];
      return `${paper}: ${lines[Math.abs(salt) % lines.length]}`;
    }
  }
  if (/withdraws its report/.test(msg)) {
    return `${paper} withdraws its report on ${who}. The month did not come out that way.`;
  }
  if (!r.first) {
    return sealNames(msg
      .replace(/,\s*the [a-z]+ firm in Port Avalon,?/gi, '')
      .replace(/,\s*the [a-z]+ firm,/gi, ',')
      .replace(/\s+/g, ' ')
      .replace(/\s+,/g, ',')
      .trim());
  }
  return sealNames(msg.replace(/\s+/g, ' ').trim());
}

/** "Name, the mining firm in Port Avalon pulls" needs the comma that closes the appositive. */
export function sealNames(msg: string): string {
  return msg.replace(/, the [a-z]+ firm in Port Avalon(?=\s+[A-Za-z])/g, (m) => m + ',');
}

/** Keep "the energy firm in Port Avalon" only the first time `claim` says the name is new. */
export function relaxFormula(msg: string, claim: (name: string) => boolean): string {
  const swap = (full: string, offset: number, whole: string): string => {
    const before = whole.slice(0, offset);
    const bit = (before.split(/[.!?]/).pop() ?? before).trim();
    const name = /([A-Z][A-Za-z0-9'&-]*(?: [A-Z][A-Za-z0-9'&-]*){0,4})$/.exec(bit)?.[1] ?? '';
    if (!name) return full;
    return claim(name) ? full : '';
  };
  return msg
    .replace(/, the [a-z]+ firm in Port Avalon/gi, (full, offset: number, whole: string) => swap(full, offset, whole))
    .replace(/, the [a-z]+ firm,/gi, (full, offset: number, whole: string) => swap(full, offset, whole))
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

/** The short form people repeat before the paper prints it. */
export function rumourLine(h: HeadlineIn): string {
  const who = h.name || 'the firm';
  const where = h.sector ? `${who}, the ${h.sector} firm in ${CITY}` : `${who} in ${CITY}`;
  switch (h.tag) {
    case 'firm.default': {
      const stake = defaultStake(h.msg);
      return stake ? `word that ${where} has defaulted on ${stake}` : `word that ${where} has defaulted`;
    }
    case 'firm.ceoFired': return `word that the chief is out at ${where}`;
    case 'firm.succession': return `word of a new chief at ${where}`;
    case 'firm.cashCrunch': return `word that wages went unpaid at ${where}`;
    case 'cb.rate': return `word that the policy rate moved in ${CITY}`;
    case 'mkt.move': return `word that shares moved at ${where}`;
    case 'shock': return h.msg;
    case 'insider.profit': {
      const word = h.profit < 0 ? 'loss' : 'profit';
      return `word of a ${word} of ${money(Math.abs(h.profit))} at ${where}`;
    }
    case 'law.case': return `word of a case against ${where}`;
    default: return `word about ${where}`;
  }
}
