// How a stranger looks across a room, and what drifts over from their table. Every description is built from the
// person: their age, what they wear for the work they do, how they carry themselves, and a scrap of what they are
// saying. No two faces in one room read the same, because the salt moves on until the description is new.
import type { World } from '../../kernel/index.ts';
import { DEP, type EconState } from '../economy/index.ts';
import { facetOf, profileOf } from './talk.ts';
import { usd } from '../player/gamedate.ts';

const econ = (w: World): EconState => w.state.economy as EconState;
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}
const pick = <T>(list: T[], salt: number): T => list[salt % list.length];

export function ageWord(age: number): string {
  if (age < 20) return 'barely out of their teens';
  if (age < 26) return 'in their early twenties';
  if (age < 30) return 'in their late twenties';
  if (age < 36) return 'in their early thirties';
  if (age < 40) return 'in their late thirties';
  if (age < 46) return 'in their early forties';
  if (age < 50) return 'in their late forties';
  if (age < 56) return 'in their early fifties';
  if (age < 60) return 'in their late fifties';
  return 'past sixty';
}

const HAIR = [
  'close-cropped grey hair', 'a shock of dark curls', 'a neat side parting', 'a weathered face under a woollen cap', 'a long braid over one shoulder',
  'sandy hair going thin on top', 'a salt-and-pepper beard', 'cropped red hair', 'reading glasses pushed up into silver hair', 'a shaved head and a quiet smile',
  'a tidy grey bob', 'dark hair tied back with a rubber band', 'a thick moustache', 'a sunburnt neck and fair hair', 'tired eyes and a carefully combed fringe',
];
const BAG = [
  'a battered satchel at their feet', 'a folded newspaper under one arm', 'keys on a lanyard', 'a pencil behind one ear', 'a paper cup of coffee gone cold',
  'a phone face-down by their glass', 'a rolled umbrella hooked on the bar', 'ink on their fingers', 'chalk dust on a sleeve', 'a small notebook open beside the drink',
  'a ring they keep turning', 'a rucksack on the next stool',
];
const MANNER = [
  'keeps glancing at the door', 'laughs loudly at the end of the bar', 'sits very straight with both hands on the glass', 'argues amiably with the barman',
  'counts out coins slowly', 'holds court for three people', 'reads the same page twice', 'hums along to the music',
  'looks as though they have not slept', 'watches the room over the rim of a glass', 'taps the bar in time with nothing', 'talks with their hands',
  'nurses a drink and says nothing', 'checks the clock above the bar',
];
const DRESS: Record<string, string[]> = {
  MANUAL: ['in a dock jacket and work boots', 'in a high-visibility vest over a hooded sweatshirt', 'in a patched overall with the sleeves rolled up'],
  HEALTH: ['with a hospital lanyard still around their neck', 'in soft shoes and a fleece from the ward'],
  FINANCE: ['in a rumpled suit with the collar open', 'in a good grey suit and a cheap watch', 'in shirtsleeves with the tie in a pocket'],
  TECH: ['in a lab fleece and trainers', 'in a hoodie with a firm logo on it', 'in a plain shirt with a visitor badge still clipped on'],
  SHOP: ['with a shop apron still tied under their coat', 'in a name badge and a good smile gone tired'],
  RICH: ['in a tailored coat that did not come cheap', 'in a cashmere scarf and polished shoes', 'in a dark dress and an old family ring'],
  POOR: ['in a worn jacket, cuffs fraying', 'in a coat a size too large', 'in clothes that have seen better winters'],
  OFF: ['in a crumpled jacket, as if they dressed in a hurry', 'dressed for an evening out'],
};
const FOLK_DRESS: Record<string, string> = {
  TRANSPORT: 'MANUAL', MINING: 'MANUAL', CONSTRUCTION: 'MANUAL', ENERGY: 'MANUAL', AGRICULTURE: 'MANUAL', METALS: 'MANUAL', MANUFACTURING: 'MANUAL',
  CHEMICALS: 'TECH', TECHNOLOGY: 'TECH', HEALTHCARE: 'HEALTH', RETAIL: 'SHOP', FINANCE: 'FINANCE', MEDIA: 'TECH',
};

function dressOf(w: World, i: number, salt: number): string {
  const s = econ(w), P = s.P;
  const wd = w.ledger.balS(P.slot[i], DEP) / Math.max(1, s.wage);
  const e = P.employer[i];
  const sec = e >= 0 ? s.firms[e].sector : '';
  const chief = e >= 0 && s.firms[e].ceo === i;
  if (wd > 600 || chief) return pick(DRESS.RICH, salt);
  if (e < 0) return pick(wd < 50 ? DRESS.POOR : DRESS.OFF, salt);
  return pick(DRESS[FOLK_DRESS[sec] ?? 'OFF'], salt);
}

/** What tells two faces apart: hair and manner. A room never shows two faces with the same one. */
export function lookKey(w: World, i: number, tries: number): string[] {
  const salt = mix(i, 41, tries);
  void salt;
  return [pick(HAIR, mix(i, 3, tries)), pick(MANNER, mix(i, 5, tries))];
}

/** A stranger described by what you can see. `tries` moves the pick on when two faces would read the same. */
export function lookOf(w: World, i: number, tries: number): string {
  const P = econ(w).P;
  const salt = mix(i, 41, tries);
  const age = P.age(w, i);
  const hair = pick(HAIR, mix(i, 3, tries));
  const bag = pick(BAG, mix(i, 4, tries));
  const manner = pick(MANNER, mix(i, 5, tries));
  const lead = mix(i, 6, tries) % 3;
  const dress = dressOf(w, i, salt);
  if (lead === 0) return `Someone ${ageWord(age)} with ${hair}, ${dress}, ${manner}`;
  if (lead === 1) return `Someone ${ageWord(age)} ${dress}, with ${bag}, who ${manner}`;
  return `Someone ${ageWord(age)} with ${hair} and ${bag}, ${manner}`;
}

/** A scrap of what you can hear from the next table, drawn from what is true of that person. */
export function overheardOf(w: World, i: number): string {
  const p = profileOf(w, i);
  const f = facetOf(w, i);
  const salt = mix(i, 9, w.day);
  const lines: string[] = [];
  if (p.firm && p.seats > 0) lines.push(...[
    `"...we are short of hands at ${p.firm.name} and nobody upstairs will say it..."`,
    `"...they have been advertising at ${p.firm.name} for weeks and nobody good applies..."`,
    `"...three of us doing the work of five at ${p.firm.name}, and I am one of the three..."`,
    `"...if you want work, ${p.firm.name} will take anyone who turns up sober..."`,
  ].slice(0, 4));
  if (p.firm && p.gap < -1) lines.push(`"...there is talk of cuts at ${p.firm.name}, you mark my words..."`, `"...I would not be buying a house with ${p.firm.name} the way it is..."`);
  if (p.firm && p.profit < 0 && !p.chief) lines.push(`"...a thin year at ${p.firm.name}, and the canteen has stopped doing hot lunches..."`);
  if (p.chief && p.firm) lines.push(`"...we booked ${p.profit >= 0 ? usd(p.profit) : 'a loss'} last month and I am still not sure how..."`);
  if (!p.firm && p.jobless > 14) lines.push('"...third month of looking and the agency stopped returning my calls..."', '"...they say the ports are hiring, but not for people like me..."');
  if (p.kids > 1) lines.push('"...the children eat like horses, and the school wants more for the trip..."');
  if (p.spouse && p.stress > 100) lines.push('"...I have told her we can manage, and we cannot, quite..."');
  if (p.hold) lines.push(`"...I should never have put so much into ${p.hold.name}..."`);
  if (p.wd > 600) lines.push('"...the trouble with money is finding somewhere decent to put it..."');
  if (p.district) lines.push(`"...rents in ${p.district} are going one way, and it is not down..."`, `"...the bus from ${p.district} has not been on time since the spring..."`);
  if (!lines.length) lines.push(f === 'warm' ? '"...and that is why I never go back on that ferry, whatever they say..."' : f === 'blunt' ? '"...no, it is the weather that is wrong, not me..."' : '"...it is only a matter of time, one way or the other..."');
  return lines[salt % lines.length];
}
