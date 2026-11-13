// Turns the raw content files into the tables the economy runs on.
import { fileURLToPath } from 'node:url';
import { loadRaws, RawReader } from '../../kernel/content.ts';

export const SECTOR_NAMES = ['ENERGY', 'AGRICULTURE', 'MINING', 'METALS', 'CHEMICALS', 'CONSTRUCTION', 'MANUFACTURING',
  'TECHNOLOGY', 'TRANSPORT', 'RETAIL', 'HEALTHCARE', 'FINANCE', 'MEDIA'];

export interface GoodDef {
  good: string; name: string; sector: string; order: number;
  prod: number; inputs: Record<string, number>;
  share: number; gov: number; perishable: boolean;
}
export interface FirmDef { id: string; key: string; name: string; good: string; family: boolean }
export interface ShockDef { id: string; chance: number; days: number; text: string; prod: Record<string, number>; demand: Record<string, number> }
export interface PositionDef { id: string; name: string; removeAfter: number; retireAge: number }

const dir = fileURLToPath(new URL('../../content/', import.meta.url));
const raws = loadRaws(process.env.SIM_CONTENT ?? dir);
const of = (type: string): RawReader[] => raws.filter((r) => r.type === type).map((r) => new RawReader(r));

export const GOODS: Record<string, GoodDef> = {};
of('GOOD').forEach((r, order) => {
  const sector = r.str('SECTOR');
  if (!SECTOR_NAMES.includes(sector)) throw new Error(`${r.where()}: unknown sector ${sector}`);
  GOODS[r.raw.id] = { good: r.raw.id, name: r.str('NAME'), sector, order, prod: r.num('OUTPUT'), inputs: r.pairs('INPUT'),
    share: r.num('CONSUMER', 0), gov: r.num('GOVERNMENT', 0), perishable: r.has('PERISHABLE') };
});
for (const g of Object.values(GOODS)) for (const i of Object.keys(g.inputs)) if (!GOODS[i]) throw new Error(`good ${g.good}: input ${i} is not a defined good`);
const norm = (k: 'share' | 'gov'): void => { const t = Object.values(GOODS).reduce((a, g) => a + g[k], 0); if (t > 0) for (const g of Object.values(GOODS)) g[k] /= t; };
norm('share'); norm('gov');

export const FIRM_DEFS: FirmDef[] = of('FIRM').map((r) => {
  const good = r.str('MAKES');
  if (!GOODS[good]) throw new Error(`${r.where()}: MAKES unknown good ${good}`);
  return { id: 'frm_' + r.raw.id.toLowerCase(), key: r.raw.id, name: r.str('NAME'), good, family: r.has('FAMILY') };
}).sort((a, b) => GOODS[a.good].order - GOODS[b.good].order);
for (const g of Object.values(GOODS)) if (!FIRM_DEFS.some((f) => f.good === g.good)) throw new Error(`good ${g.good} has no firm that makes it`);

export const SHOCKS: ShockDef[] = of('SHOCK').map((r) => {
  const prod = r.pairs('PRODUCTIVITY'), demand = r.pairs('DEMAND');
  for (const k of [...Object.keys(prod), ...Object.keys(demand)]) if (k !== 'ALL' && !GOODS[k]) throw new Error(`${r.where()}: unknown good ${k}`);
  return { id: r.raw.id, chance: r.num('CHANCE'), days: r.num('DAYS'), text: r.str('TEXT'), prod, demand };
});

const ceo = of('POSITION').find((r) => r.raw.id === 'CHIEF_EXECUTIVE');
if (!ceo) throw new Error('positions: CHIEF_EXECUTIVE is required');
export const CEO_POSITION: PositionDef = { id: 'CHIEF_EXECUTIVE', name: ceo.str('NAME'), removeAfter: ceo.num('REMOVE_AFTER_LOSING_MONTHS'), retireAge: ceo.num('RETIRE_AGE') };
