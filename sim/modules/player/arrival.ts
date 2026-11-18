// The arrival: a person steps off the boat in Port Avalon with 5,000 dollars and nothing else.
// No job, no contacts, no family in the city, no holdings, a rented room in the cheapest district. The books stay balanced:
// the savings come in through the ledger from outside the city, like an immigrant's.
import type { World } from '../../kernel/index.ts';
import { BANK, DEP, pay, type EconState } from '../economy/index.ts';
import { leaveJob, type People } from '../economy/people.ts';
import { homeBoard, property } from '../property/index.ts';

function econ(w: World): EconState { return w.state.economy as EconState; }

export const ARRIVAL_ID = 'arrival';
export const ARRIVAL_CASH_DOLLARS = 5000;
export const ARRIVAL_AGE = 24;

const FAM_SYL = ['an', 'bel', 'cor', 'dan', 'el', 'far', 'gal', 'hal', 'is', 'jor', 'kel', 'lin', 'mar', 'nor', 'or', 'per'];
const FAM_END = ['sen', 'ford', 'mont', 'wick', 'by', 'ham', 'dale', 'ard', 'ell', 'stone', 'well', 'ley'];

function cap(x: string): string { return x ? x[0].toUpperCase() + x.slice(1) : x; }

/** A surname the player did not type: the same name always gets the same one. */
function surnameFor(given: string): string {
  let h = 2166136261;
  for (let k = 0; k < given.length; k++) { h ^= given.charCodeAt(k); h = Math.imul(h, 16777619); }
  h >>>= 0;
  return cap(FAM_SYL[h % FAM_SYL.length] + FAM_SYL[(h >>> 8) % FAM_SYL.length] + FAM_END[(h >>> 16) % FAM_END.length]);
}

/** Split what the person typed into a given name and a surname. The city adds both to its book. */
export function splitName(typed: string): { given: string; family: string } {
  const words = typed.replace(/[^\p{L}\p{N}' .-]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return { given: '', family: '' };
  const given = cap(words[0].slice(0, 20));
  const family = words.length > 1 ? words.slice(1).map((x) => cap(x.slice(0, 20))).join(' ') : surnameFor(given);
  return { given, family };
}

function cutParents(P: People, i: number): void {
  const par = P.parent[i];
  if (par >= 0) {
    // Take i out of the parent's list of children.
    if (P.firstKid[par] === i) P.firstKid[par] = P.nextSib[i];
    else for (let c = P.firstKid[par]; c >= 0; c = P.nextSib[c]) {
      if (P.nextSib[c] === i) { P.nextSib[c] = P.nextSib[i]; break; }
    }
    if (P.nkids[par] > 0) P.nkids[par]--;
    const other = P.spouse[par];
    if (other >= 0 && P.nkids[other] > 0) P.nkids[other]--;
  }
  P.parent[i] = -1;
  P.nextSib[i] = -1;
}

interface Soc { contact: Int32Array; kind: Uint8Array; fam: Uint16Array; trust: Uint8Array; bond: Uint8Array }
const DEG = 16;

/** Nobody in the city knows this person yet. */
function forgetEveryone(w: World, i: number): void {
  const st = w.state.social as (Soc & { contact?: Int32Array }) | undefined;
  if (!st?.contact) return;
  const wipe = (a: number, k: number): void => {
    const p = a * DEG + k;
    st.contact[p] = -1; st.fam[p] = 0; st.trust[p] = 0; st.kind[p] = 0;
    st.bond.fill(0, p * 4, p * 4 + 4);
  };
  for (let k = 0; k < DEG; k++) {
    const who = st.contact[i * DEG + k];
    if (who < 0) continue;
    for (let q = 0; q < DEG; q++) if (st.contact[who * DEG + q] === i) wipe(who, q);
    wipe(i, k);
  }
}

/** Put the player in the cheapest room in the city. The property module houses anyone who has no home. */
function takeARoom(w: World, i: number): void {
  const st = w.state.property as { live?: Int32Array | number[]; seen?: number } | undefined;
  if (!st?.live) return;
  if (i < st.live.length) st.live[i] = -1;
  st.seen = -1;
  if (w.day % 360 !== 0 || w.day === 0) property.dayClose?.(w);
}

/** Make the person who is seated an arrival. `given` and `family` are what they typed; the age is set by the caller. */
export function arrive(w: World, i: number, cause: number, who?: { given?: string; family?: string }): void {
  const s = econ(w), P = s.P;
  leaveJob(s, i);
  P.spouse[i] = -1;
  cutParents(P, i);
  forgetEveryone(w, i);
  P.incEma[i] = 0;
  const fam = who?.family || P.families[P.family[i]];
  P.family[i] = P.families.length;
  P.families.push(fam);
  if (who?.given) setGiven(P, i, who.given);
  const id = P.id(i);
  const have = Math.floor(w.ledger.balance(id, DEP));
  const want = ARRIVAL_CASH_DOLLARS * 100;
  if (have > want && !pay(w, id, BANK, have - want, 'player.arrival', cause)) throw new Error('the savings did not clear');
  if (have < want && !pay(w, BANK, id, want - have, 'player.arrival', cause)) throw new Error('the savings did not clear');
  takeARoom(w, i);
}

function setGiven(P: People, i: number, given: string): void {
  P.given[i] = P.addGiven(given);
}

function dollars(cents: number): string { return '$' + Math.round(cents / 100).toLocaleString('en-US'); }

/** The first screen: stepping off the boat, the room, the lights. Nothing about work or what to do. */
export function arrivalOpening(w: World, person: number, name: string, age: number): string {
  const room = homeBoard(w, person).find((r) => r.live);
  const cash = dollars(Math.floor(w.ledger.balance(econ(w).P.id(person), DEP)));
  const where = room ? `a rented room in ${room.neighbourhood}, ${dollars(room.rent)} a month` : 'a rented room';
  return `The boat docks at Port Avalon in the evening. ${name}, ${age}, steps onto the quay with one bag and ${cash} in savings. `
    + `Across the water the city is lighting up, window by window. Nobody here knows ${name}. There is ${where}, and a key that fits it.`;
}

/** What a person can do here, by area of life, in plain words. `topics` are the command topics the game has: help TOPIC explains each. */
export function lifeHelp(topics: string[]): string[] {
  const lines = [
    'Nothing here is required. You can do any of this, in any order, or none of it.',
    '',
    'Work: jobs shows who is hiring, apply 1 asks for a job. You can start a firm of your own with found.',
    'Money: sheet shows what you have and owe. deposit and withdraw move savings. borrow and repay handle loans.',
    'A home: homes lists places to rent or buy. move changes where you live. bid buys one.',
    'Markets: desk shows the stocks. quote, buy, sell and short trade them. Bonds, futures, options and coins are there too.',
    'People: talk to the people you have met, ask them things, court someone, marry, have children, write a will.',
    'Your life: clinic, holiday, overtime, donate. They cost money and have a cooldown.',
    'Understanding: news says what happened. why cash, or why followed by a number, says what caused it.',
  ];
  if (topics.length) lines.push('', `help followed by one of these says more: ${topics.join(', ')}.`);
  return lines;
}
