// What a player has learned in class, read by the modules that colour a reading or an interview.
// A leaf file: it imports nothing from the modules it serves.
import type { World } from '../../kernel/index.ts';

export interface CourseDef { id: string; name: string; sectors: string[]; weeks: number; feeDays: number; blurb: string }

export const COURSES: CourseDef[] = [
  { id: 'bookkeeping', name: 'Bookkeeping', sectors: ['FINANCE', 'RETAIL'], weeks: 6, feeDays: 8, blurb: 'Read a firm\'s accounts without being fooled by them' },
  { id: 'markets', name: 'Trading and markets', sectors: ['FINANCE'], weeks: 8, feeDays: 14, blurb: 'How prices form, and who moves them' },
  { id: 'shipping', name: 'Shipping and logistics', sectors: ['TRANSPORT', 'RETAIL'], weeks: 6, feeDays: 9, blurb: 'Ports, freight and why a late ship matters' },
  { id: 'energy', name: 'Energy', sectors: ['ENERGY', 'CHEMICALS'], weeks: 8, feeDays: 12, blurb: 'Oil, gas, power and the shocks that move them' },
  { id: 'property', name: 'Property and building', sectors: ['CONSTRUCTION'], weeks: 8, feeDays: 12, blurb: 'Land, rents, mortgages and what building costs' },
  { id: 'software', name: 'Software and chips', sectors: ['TECHNOLOGY'], weeks: 10, feeDays: 16, blurb: 'What engineers build and what it takes to ship it' },
  { id: 'law', name: 'Law', sectors: ['FINANCE', 'MEDIA'], weeks: 10, feeDays: 18, blurb: 'Contracts, courts and where the line is drawn' },
  { id: 'management', name: 'Management', sectors: ['MANUFACTURING', 'METALS', 'TRANSPORT', 'RETAIL', 'MINING', 'AGRICULTURE'], weeks: 12, feeDays: 22, blurb: 'Running people and a payroll' },
  { id: 'health', name: 'Health and medicine', sectors: ['HEALTHCARE'], weeks: 10, feeDays: 16, blurb: 'Clinics, drugs and what a hospital really costs' },
  { id: 'industry', name: 'Factory floor', sectors: ['MANUFACTURING', 'METALS', 'MINING', 'AGRICULTURE'], weeks: 6, feeDays: 9, blurb: 'How a plant turns inputs into stock' },
];

interface Known { know?: Record<string, Record<string, number>> }
const store = (w: World): Known | undefined => w.state.courses as Known | undefined;

/** How many finished courses touch this sector: 0, 1 or 2. */
export function knowledgeIn(w: World, seat: string, sector: string): number {
  const done = store(w)?.know?.[seat];
  if (!done) return 0;
  let n = 0;
  for (const c of COURSES) if (done[c.id] !== undefined && c.sectors.includes(sector)) n++;
  return Math.min(2, n);
}

/** Added to the clarity of a reading about a firm in a sector the player has studied. */
export function knowledgeBonus(w: World, seat: string, firm: number): number {
  if (firm < 0) return 0;
  const f = (w.state.economy as { firms?: { sector: string }[] } | undefined)?.firms?.[firm];
  if (!f) return 0;
  return knowledgeIn(w, seat, f.sector) * 0.09;
}
