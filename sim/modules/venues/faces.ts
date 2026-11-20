// How a stranger looks across a room, and what drifts over from their table. Every description is built from the
// person: their age, what they wear for the work they do, their build, how they carry themselves, and a scrap of what
// they are saying. No two faces in one room read the same, because the salt moves on until the description is new.
// What drifts over is drawn from the day's real news and from the room itself: ships at the Anchor, prices at the
// Ticker, takeovers at Cellar 41.
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
  'a gap-toothed grin', 'a scar through one eyebrow', 'round spectacles and a high forehead', 'a ponytail gone half grey', 'a grey-streaked beard trimmed square',
  'a tattoo of an anchor on one wrist', 'dyed copper hair with the roots showing', 'freckles and a wide, easy laugh', 'a broken nose set a little crooked',
  'silver rings on three fingers', 'a bandaged thumb', 'a heavy fringe and a heavier frown', 'white stubble and bright blue eyes', 'dark eyes behind a pair of old wire frames',
  'a bald crown and a bushy white moustache', 'curly hair held down with a scarf', 'a plaited beard', 'a hearing aid and a patient smile', 'sharp cheekbones and a sharper stare',
  'a mop of straw-coloured hair', 'a jaw that looks as if it has been clenched all week', 'an unlit pipe in the corner of the mouth', 'a missing front tooth',
];
const BAG = [
  'a battered satchel at their feet', 'a folded newspaper under one arm', 'keys on a lanyard', 'a pencil behind one ear', 'a paper cup of coffee gone cold',
  'a phone face-down by their glass', 'a rolled umbrella hooked on the bar', 'ink on their fingers', 'chalk dust on a sleeve', 'a small notebook open beside the drink',
  'a ring they keep turning', 'a rucksack on the next stool', 'a lunch tin with the lid off', 'a tape measure clipped to the belt', 'a stack of receipts held with a clip',
  'a toolbag between their boots', 'a crossword folded to the last clue', 'a cigarette tucked behind the ear and never lit', 'a bunch of keys the size of a fist',
  'a briefcase with a broken clasp', 'a hat on the bar and gloves inside it', 'a thick paperback with a beer mat for a bookmark', 'a bus pass they keep checking',
  'a coat folded as a cushion', 'a camera in a worn case',
];
const MANNER = [
  'keeps glancing at the door', 'laughs loudly at the end of the bar', 'sits very straight with both hands on the glass', 'argues amiably with the barman',
  'counts out coins slowly', 'holds court for three people', 'reads the same page twice', 'hums along to the music',
  'looks as though they have not slept', 'watches the room over the rim of a glass', 'taps the bar in time with nothing', 'talks with their hands',
  'nurses a drink and says nothing', 'checks the clock above the bar', 'tells the same joke to a new listener each time',
  'peels the label off a bottle in one long strip', 'draws sums on a beer mat', 'sings under their breath and stops when watched', 'has the quick, wary look of someone owed money',
  'leans on the wall rather than the bar', 'orders for the whole table without asking', 'checks a pocket watch twice a minute', 'stirs a drink that has no need of it',
  'waves at everyone and sits with no one', 'stares at the television with the sound off', 'folds and unfolds the same note', 'whispers into a phone and hangs up when you look',
];
const DRESS: Record<string, string[]> = {
  MANUAL: ['in a dock jacket and work boots', 'in a high-visibility vest over a hooded sweatshirt', 'in a patched overall with the sleeves rolled up', 'in a donkey jacket with the union badge on the collar',
    'in oilskins that still smell of the harbour', 'in steel-capped boots and a faded checked shirt', 'in a canvas coat dark at the elbows', 'in a boiler suit tied at the waist'],
  HEALTH: ['with a hospital lanyard still around their neck', 'in soft shoes and a fleece from the ward', 'in scrubs under a raincoat', 'in a cardigan with a clinic pin'],
  FINANCE: ['in a rumpled suit with the collar open', 'in a good grey suit and a cheap watch', 'in shirtsleeves with the tie in a pocket', 'in a navy pinstripe and polished shoes',
    'in a crisp white shirt and cufflinks that do not match', 'in a charcoal coat over a loosened tie'],
  TECH: ['in a lab fleece and trainers', 'in a hoodie with a firm logo on it', 'in a plain shirt with a visitor badge still clipped on', 'in a faded band shirt and a lanyard',
    'in a quilted vest and sandals despite the weather', 'in a lab coat with a coffee stain'],
  SHOP: ['with a shop apron still tied under their coat', 'in a name badge and a good smile gone tired', 'in the colours of a department store', 'in a uniform shirt with the logo half peeled'],
  RICH: ['in a tailored coat that did not come cheap', 'in a cashmere scarf and polished shoes', 'in a dark dress and an old family ring', 'in a camel overcoat and a slim gold watch',
    'in a velvet jacket and a pocket square', 'in a long wool coat and gloves of soft leather'],
  POOR: ['in a worn jacket, cuffs fraying', 'in a coat a size too large', 'in clothes that have seen better winters', 'in a mended sweater and shoes with new laces',
    'in a thin raincoat over a second shirt'],
  OFF: ['in a crumpled jacket, as if they dressed in a hurry', 'dressed for an evening out', 'in a good shirt and old trousers', 'in a leather jacket and a borrowed scarf', 'in a loose sweater and a hopeful smile'],
  PRESS: ['in a trench coat with a notebook in the pocket', 'in an ink-stained shirt and a press pass', 'in a rumpled blazer and sensible shoes'],
};
const FOLK_DRESS: Record<string, string> = {
  TRANSPORT: 'MANUAL', MINING: 'MANUAL', CONSTRUCTION: 'MANUAL', ENERGY: 'MANUAL', AGRICULTURE: 'MANUAL', METALS: 'MANUAL', MANUFACTURING: 'MANUAL',
  CHEMICALS: 'TECH', TECHNOLOGY: 'TECH', HEALTHCARE: 'HEALTH', RETAIL: 'SHOP', FINANCE: 'FINANCE', MEDIA: 'PRESS',
};
const BUILD = ['broad-shouldered', 'wiry', 'tall and stooped', 'short and stocky', 'slight', 'heavy-set', 'long-limbed', 'neat and compact', 'rangy', 'solid'];

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
  void w;
  return [pick(HAIR, mix(i, 3, tries)), pick(MANNER, mix(i, 5, tries)), pick(DRESS_KEYS, mix(i, 41, tries))];
}
const DRESS_KEYS = Object.values(DRESS).flat();

/** A stranger described by what you can see. `tries` moves the pick on when two faces would read the same. */
export function lookOf(w: World, i: number, tries: number): string {
  const P = econ(w).P;
  const salt = mix(i, 41, tries);
  const age = P.age(w, i);
  const hair = pick(HAIR, mix(i, 3, tries));
  const bag = pick(BAG, mix(i, 4, tries));
  const manner = pick(MANNER, mix(i, 5, tries));
  const build = pick(BUILD, mix(i, 7, tries));
  const lead = mix(i, 6, tries) % 5;
  const dress = dressOf(w, i, salt);
  if (lead === 0) return `Someone ${ageWord(age)} with ${hair}, ${dress}, ${manner}`;
  if (lead === 1) return `Someone ${ageWord(age)} ${dress}, with ${bag}, who ${manner}`;
  if (lead === 2) return `Someone ${ageWord(age)} with ${hair} and ${bag}, ${manner}`;
  if (lead === 3) return `A ${build} figure ${dress}, with ${hair}, who ${manner}`;
  return `A ${build} person ${ageWord(age)}, ${dress}, with ${bag}`;
}

// ----------------------------------------------------------------------------- what drifts over

function headlines(w: World): string[] {
  const eds = (w.state.media as { paper?: { editions: { day: number; stories: { headline: string; section: string; kicker: string }[] }[] } } | undefined)?.paper?.editions ?? [];
  const out: string[] = [];
  for (const e of eds.slice(-4)) for (const st of e.stories) if (st.headline.length > 18 && st.headline.length < 90 && !/^(Firm profile|Who runs it|The pay packet|The list|The numbers|Pay|Out last night|The diary|Next up)$/.test(st.kicker)) out.push(st.headline.replace(/\.$/, ''));
  return out;
}

interface Room { lines: string[] }
/** Things true of this room tonight, in the words of the people who drink there. */
function roomTalk(w: World, venue: number, salt: number): string[] {
  const s = econ(w);
  const lines: string[] = [];
  const port = w.state.port as { berthed?: number; closedUntil?: number; ships?: { name: string; way: string; eta: number }[]; strikeOn?: boolean } | undefined;
  const stocks = (w.state.markets as { stocks?: { issuer: string; last: number; prev: number }[] } | undefined)?.stocks ?? [];
  const movers = stocks.filter((x) => x.prev > 0 && x.issuer !== 'bank_1').map((x) => ({ f: s.firms.find((f) => f.id === x.issuer), pct: (x.last / x.prev - 1) * 100 })).filter((m) => m.f).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const cuts = w.events.recent(['firm.layoffs'], 40).filter((e) => w.day - e.day <= 7).map((e) => s.firms.find((f) => f.id === e.actor)?.name).filter(Boolean) as string[];
  const launches = w.events.recent(['crypto.launch'], 60).filter((e) => w.day - e.day <= 2);
  const rugs = w.events.recent(['crypto.rug'], 20).filter((e) => w.day - e.day <= 6);
  const inbound = (port?.ships ?? []).filter((x) => x.way === 'in').sort((a, b) => a.eta - b.eta)[0];
  if (venue === 0) {
    if (inbound) lines.push(`"...${inbound.name} is due ${inbound.eta - w.day <= 1 ? 'tomorrow' : `in ${inbound.eta - w.day} days`} and the whole quay knows what is on it..."`);
    if (port?.berthed !== undefined) lines.push(`"...${port.berthed} ships alongside and the cranes still cannot keep up..."`);
    if (port?.strikeOn || (port?.closedUntil ?? 0) > w.day) lines.push('"...if the harbour stays shut we are all on short pay by the end of the month..."');
    if (cuts[0]) lines.push(`"...they are laying off at ${cuts[0]} and the hands there are drinking early..."`);
  } else if (venue === 1) {
    const m = movers[0];
    if (m?.f) lines.push(`"...${m.f.name} ${m.pct >= 0 ? 'up' : 'down'} ${Math.abs(m.pct).toFixed(1)}% on the day and nobody on my desk can say why..."`);
    lines.push(`"...if the bank moves from ${(s.policyRate * 100).toFixed(2)}% we will see it in the curve before the headlines..."`);
    if (movers[1]?.f) lines.push(`"...I wouldn't touch ${movers[1].f.name} until it settles, and I have said so twice today..."`);
  } else if (venue === 2) {
    const soc = w.state.society as { rich?: { person: number; worth: number }[] } | undefined;
    const top = soc?.rich?.[0];
    if (top) lines.push(`"...${s.P.name(top.person)} has a way of making the rest of us feel poor, and ${usdShort(top.worth)} of reasons..."`);
    if (cuts[0]) lines.push(`"...there is a quiet word that ${cuts[0]} is for sale, price to be discussed over dinner..."`);
    lines.push(`"...the finance minister dined here on Thursday and left before the cheese, which tells you everything..."`);
  } else if (venue === 3) {
    lines.push('"...the batteries are the thing; everyone says lithium and nobody has seen a decent cell yet..."');
    lines.push(`"...three of us are on the same project and none of us is allowed to say what it is..."`);
    if (movers[0]?.f) lines.push(`"...the funding follows ${movers[0].f.name}, and we follow the funding..."`);
  } else if (venue === 4) {
    if (cuts[0]) lines.push(`"...${cuts[0]} cutting again, and the union rep says there is nothing to be done..."`);
    lines.push(`"...the city wage is ${usdShort(s.wage)} a day and the rent has not noticed..."`);
    lines.push('"...if they bring in another shift pattern I am out, I mean it this time..."');
  } else {
    if (launches.length) lines.push(`"...${launches.length} new coins on the launchpad today and I bought two of them, do not tell my girlfriend..."`);
    if (rugs.length) lines.push('"...another pool pulled this week. You can lose it all on a Tuesday..."');
    lines.push('"...it is not gambling if you have a spreadsheet..."');
  }
  return lines.map((l) => l).slice(0, 6).sort((a, b) => mix(a.length, salt, 1) - mix(b.length, salt, 1));
}
function usdShort(cents: number): string { return usd(cents); }

/** A scrap of what you can hear from the next table, drawn from what is true of that person and of the room. */
export function overheardOf(w: World, i: number, venue = -1, shift = 0): string {
  const p = profileOf(w, i);
  const f = facetOf(w, i);
  const salt = mix(i, 9 + shift, w.day);
  const lines: string[] = [];
  if (p.firm && p.seats > 0) lines.push(...[
    `"...we are short of hands at ${p.firm.name} and nobody upstairs will say it..."`,
    `"...they have been advertising at ${p.firm.name} for weeks and nobody good applies..."`,
    `"...three of us doing the work of five at ${p.firm.name}, and I am one of the three..."`,
    `"...if you want work, ${p.firm.name} will take anyone who turns up sober..."`,
  ]);
  if (p.firm && p.gap < -1) lines.push(`"...there is talk of cuts at ${p.firm.name}, you mark my words..."`, `"...I would not be buying a house with ${p.firm.name} the way it is..."`);
  if (p.firm && p.profit < 0 && !p.chief) lines.push(`"...a thin year at ${p.firm.name}, and the canteen has stopped doing hot lunches..."`);
  if (p.chief && p.firm) lines.push(`"...we booked ${p.profit >= 0 ? usd(p.profit) : 'a loss'} last month and I am still not sure how..."`);
  if (p.news && p.firm) lines.push(`"...at ${p.firm.name} nobody talks about anything but ${p.news}..."`, `"...I work at ${p.firm.name}, so do not ask me about ${p.news}..."`);
  if (p.pay && p.rank === 'hand') lines.push(`"...${usd(p.pay)} a week and they call that a living..."`);
  if (!p.firm && p.jobless > 14) lines.push('"...third month of looking and the agency stopped returning my calls..."', '"...they say the ports are hiring, but not for people like me..."');
  if (p.kids > 1) lines.push('"...the children eat like horses, and the school wants more for the trip..."');
  if (p.spouse && p.stress > 100) lines.push('"...I have told her we can manage, and we cannot, quite..."');
  if (p.hold) lines.push(`"...I should never have put so much into ${p.hold.name}..."`);
  if (p.wd > 600) lines.push('"...the trouble with money is finding somewhere decent to put it..."');
  if (p.district) lines.push(`"...rents in ${p.district} are going one way, and it is not down..."`, `"...the bus from ${p.district} has not been on time since the spring..."`);
  const news = headlines(w);
  if (news.length) lines.push(`"...did you read it? ${pick(news, salt)}..."`);
  if (venue >= 0) lines.push(...roomTalk(w, venue, salt));
  if (!lines.length) lines.push(f === 'warm' ? '"...and that is why I never go back on that ferry, whatever they say..."' : f === 'blunt' ? '"...no, it is the weather that is wrong, not me..."' : '"...it is only a matter of time, one way or the other..."');
  return pick(lines, salt);
}
