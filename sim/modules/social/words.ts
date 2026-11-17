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

function stop(s: string): string {
  const t = tidy(s);
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : t + '.';
}

function low(s: string): string {
  if (!s) return s;
  const first = (s.split(' ')[0] ?? '').replace(/[.!?,:—-]+$/, '');
  if (first === 'I' || first === "I'm" || first === "I've" || first === "I'll") return s;
  if (/^(You|It|The|This|A|An|We|My|That|Do|Please|If|None|Come|Here|There|Another|Read|Take|Remember|Cash|Health|Your|Our)$/.test(first)) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
  return s;
}

function beat(voice: Voice, casual: boolean, worry: boolean): string {
  if (worry) {
    if (voice === 'formal') return 'I am worried about the family.';
    if (voice === 'anxious') return 'I keep thinking about the family.';
    if (voice === 'blunt') return 'The family comes first.';
    if (voice === 'cold') return 'You should hear this from me.';
    if (voice === 'proud') return 'I will look after them.';
    return 'I worry.';
  }
  if (casual) {
    if (voice === 'blunt') return "I'll be brief.";
    if (voice === 'anxious') return 'I had to tell you.';
    if (voice === 'proud') return 'I wanted you to hear it from me.';
    if (voice === 'formal') return 'I will keep this plain.';
    if (voice === 'cold') return 'That is all.';
    return 'I am glad I can tell you.';
  }
  if (voice === 'blunt') return 'That is the whole of it.';
  if (voice === 'anxious') return 'I did not want to wait.';
  if (voice === 'proud') return 'I know the work.';
  if (voice === 'formal') return 'I will be plain.';
  if (voice === 'cold') return 'I will not dress it up.';
  return 'I wanted you to know.';
}

function historyBit(since: string): string {
  return since ? `That goes back to ${since}.` : '';
}

export interface LetterParts {
  voice: Voice;
  shape: Shape;
  fact: string;
  you: string;
  mine: string;
  /** "the dinner in March", or "we first knew each other in March". */
  since: string;
  casual: boolean;
  worry: boolean;
}

/** One letter. The shape decides the grammar. The voice and the bond decide the tone. */
export function renderLetter(p: LetterParts): string {
  const fact = stop(p.fact);
  const you = stop(p.you);
  const mine = stop(p.mine);
  const voice = beat(p.voice, p.casual, p.worry);
  const back = historyBit(p.since);
  const youLow = low(you.replace(/\.$/, ''));
  let text = '';
  if (p.shape === 'dash') {
    text = you ? `${fact.replace(/\.$/, '')} — ${youLow}.` : fact;
    text = [text, mine, voice, back].filter(Boolean).join(' ');
  } else if (p.shape === 'because') {
    text = you ? `${fact} ${voice.replace(/\.$/, '')}, because ${youLow}.` : `${fact} ${voice}`;
    text = [text, mine, back].filter(Boolean).join(' ');
  } else if (p.shape === 'and') {
    text = you ? `${fact.replace(/\.$/, '')}, and ${youLow}.` : fact;
    text = [text, mine, voice, back].filter(Boolean).join(' ');
  } else if (p.shape === 'ask') {
    text = [fact, you, 'Will you write?', mine, voice, back].filter(Boolean).join(' ');
  } else {
    text = [fact, you, mine, voice, back].filter(Boolean).join(' ');
  }
  return tidy(text);
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
      return `${paper}: ${who}, ${verb} ${Number(m[1]).toFixed(0)}% of wages and the payroll moves ${signedPct(-Number(m[2]), 0)}`;
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
