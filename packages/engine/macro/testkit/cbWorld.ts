// T04-08 test kit: a hand-rolled PhaseCtx (as in rules/cb.test.ts) with a recording ledger and hold book, for the facility tests.
import { roundHalfEven, type Id, type PhaseCtx, type PhaseMessage } from '@tycoon/engine-core';
import { createParamsView, MACRO_T04_08_PARAMS } from '@tycoon/params';
import { cbkId } from '@tycoon/engine-ledger';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { macroTables, type BlocId, type CentralBank } from '../schema';

export interface Post { op: string; from?: Id; to?: Id; amt: bigint; ccy: string; code: string; sub?: string }
export interface Ev { kind: string; subjectIds: Id[]; payload: unknown; vis: string; partyIds?: Id[] }
export interface HoldRow { id: Id; owner: Id; assetId?: string; amt: bigint; expires: number; ref: Id; open: boolean }
export interface CbWorld { ctx: PhaseCtx; posts: Post[]; events: Ev[]; holds: HoldRow[]; sent: { to: Id; kind: string; body: unknown }[];
  rows(table: string): unknown[]; put(table: string, e: { id: string }): void; setTick(t: number): void; deliver(): void;
  cash: Record<string, bigint>; qty: Record<string, bigint> }

export function cbRow(b: BlocId, over: Partial<CentralBank> = {}): CentralBank {
  return { id: cbkId(b), bloc: b, policyRate: 0.03, reserveRequirement: 0.01, corridorHalfWidth: 0.0025, ltroOpenUntilTick: null,
    facilities: { lendingRate: 0.0325, depositRate: 0.0275, collateralHaircuts: {}, elaPenaltySpread: 0.015, maxTermDays: 7 },
    balanceSheet: { govBonds: 0n, corpBonds: 0n, abs: 0n, loansToBanks: 0n, elaOutstanding: 0n, bankReserves: 0n, currencyInCirculation: 0n }, ...over } as CentralBank;
}

export function cbWorld(cbs: CentralBank[], tick0 = 41 * 720 + 700): CbWorld {
  const tables: Record<string, { id: string; e: unknown }[]> = {};
  const put = (t: string, e: { id: string }): void => {
    const rows = (tables[t] ??= []), i = rows.findIndex((r) => r.id === e.id);
    if (i >= 0) rows[i] = { id: e.id, e }; else { rows.push({ id: e.id, e }); rows.sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0)); }
  };
  for (const cb of cbs) put(macroTables.cb.name, cb as unknown as { id: string });
  const posts: Post[] = [], events: Ev[] = [], holds: HoldRow[] = [], sent: { to: Id; kind: string; body: unknown }[] = [];
  let inbox: PhaseMessage[] = [], tick = tick0, n = 0;
  const cash: Record<string, bigint> = {}, qty: Record<string, bigint> = {};
  const P = (op: string) => (a: Id, b: Id, amt: bigint, ccy: string, code: string, o?: { sub?: string }) => {
    posts.push({ op, from: a, to: b, amt, ccy, code, ...(o?.sub ? { sub: o.sub } : {}) }); return `e${posts.length}`; };
  const ledger = {
    pay: P('pay'), cbCredit: P('cbCredit'), cbCreditUnwind: P('cbCreditUnwind'),
    mint: (to: Id, amt: bigint, ccy: string, code: string) => { posts.push({ op: 'mint', to, amt, ccy, code }); return `e${posts.length}`; },
    burn: (from: Id, amt: bigint, ccy: string, code: string) => { posts.push({ op: 'burn', from, amt, ccy, code }); return `e${posts.length}`; },
    available: (e: Id, ccy: string) => cash[`${e}:${ccy}`] ?? 0n, availableQty: (e: Id, a: string) => qty[`${e}:${a}`] ?? 0n,
  };
  const hold = (owner: Id, assetId: string | undefined, amt: bigint, expires: number, ref: Id): Id => {
    const id = `hold_${holds.length}`; holds.push({ id, owner, ...(assetId ? { assetId } : {}), amt, expires, ref, open: true }); return id; };
  const hb = {
    placeQty: (o: Id, a: string, q: bigint, x: number, r: Id) => (q > (qty[`${o}:${a}`] ?? 0n) ? { code: 'LED_INSUFFICIENT_QTY' } : hold(o, a, q, x, r)),
    placeCash: (o: Id, _c: string, m: bigint, x: number, r: Id) => hold(o, undefined, m, x, r),
    release: (id: Id) => { const h = holds.find((x) => x.id === id); if (h) h.open = false; },
    reduce: (id: Id, by: bigint) => { const h = holds.find((x) => x.id === id); if (h) h.amt -= by; },
  };
  const store = {
    get: (t: string, id: string) => tables[t]?.find((r) => r.id === id)?.e, put,
    iter: (t: string) => (tables[t] ?? []).map((r) => r.e), index: () => [], count: (t: string) => (tables[t] ?? []).length,
  };
  const ctx = { get tick() { return tick; }, phase: 'P8', params: createParamsView(MACRO_T04_08_PARAMS), newId: (k: string) => `${k}_${n++}`, store, ledger, holds: hb,
    emit: (kind: string, subjectIds: Id[], payload: unknown, vis: string, partyIds?: Id[]) => { events.push({ kind, subjectIds, payload, vis, ...(partyIds ? { partyIds } : {}) }); },
    send: (to: Id, kind: string, body: unknown) => { sent.push({ to, kind, body }); },
    inbox: (kind?: string) => inbox.filter((m) => kind === undefined || m.kind === kind) } as unknown as PhaseCtx;
  return { ctx, posts, events, holds, sent, rows: (t) => (tables[t] ?? []).map((r) => r.e), put, cash, qty,
    setTick: (t) => { tick = t; },
    deliver: () => { inbox = sent.splice(0).map((s) => ({ fromEntity: 'x', toEntity: s.to, phase: 'P8', tick, kind: s.kind, body: s.body, canonicalKey: '' })); } };
}

/** Stub ports: one GOV FDL issuer graded AA, credit port with chartered banks and reserves. */
export interface StubOpts { chartered?: Id[]; reserves?: Record<string, { balance: bigint; required: bigint }>; players?: Id[]; held?: Id[]; insolvent?: Id[];
  assets?: Record<string, { cls: 'GOV' | 'CORP' | 'ABS_SENIOR' | 'COVERED' | 'EQUITY' | 'OTHER'; issuerBloc: BlocId | null; maturityTick: number | null; grade?: string | null; px?: bigint | null }>;
  sovGrades?: string[]; loanClaims?: Record<string, bigint>; credit?: boolean }
export function stubPorts(o: StubOpts = {}): MacroPorts {
  const d = defaultMacroPorts(), assets = o.assets ?? {};
  const has = (xs: Id[] | undefined, x: Id): boolean => (xs ?? []).includes(x);
  return { ...d,
    assets: { ...d.assets, assetInfo: (_s, a) => { const x = assets[a]; return x ? { cls: x.cls, issuerBloc: x.issuerBloc, maturityTick: x.maturityTick, ccy: 'FDL' } : null; } },
    markets: { ...d.markets, fairPriceOf: (_s, a) => assets[a]?.px ?? null },
    funds: { ...d.funds, sovereignGrades: () => o.sovGrades ?? ['AA', 'AA', 'AA-'], gradeOf: (_s, a) => assets[a]?.grade ?? null },
    players: { ...d.players, isHeld: (_s, e) => has(o.held, e), ownerGroupOf: (_s, e) => (has(o.players, e) ? 'chr_owner' : e) },
    credit: o.credit === false ? null : { creditAggregates: () => null, bankReserves: (_s, b) => o.reserves?.[b] ? { ...o.reserves[b]!, eligibleDeposits: 0n } : null,
      solvencyOk: (_s, b) => !has(o.insolvent, b), isChartered: (_s, e) => has(o.chartered, e), bankEquity: () => null, repoHaircutIndexChange: () => null,
      ccpDefaultFundUsage: () => null, npcBankBelow12xMin: () => 0, repoLeverageIndex: () => null, npcBankIds: () => [], charteredBankIds: () => [...(o.chartered ?? [])],
      pledgedQty: () => 0n, weakestNpcBanks: () => [], isLoanClaim: (_s, a) => (o.loanClaims?.[a] !== undefined ? { bankId: 'x', principal: o.loanClaims[a]!, ccy: 'FDL' } : null) } };
}
export const M = (x: number): bigint => BigInt(roundHalfEven(x * 1e6));   // test literal → micro-units
