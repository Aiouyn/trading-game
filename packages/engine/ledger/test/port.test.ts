// E-81 (i), one-way dependency: the ledger types core's ledger port (core/module/ledger-port.ts never imports the ledger; src/port.ts
// augments core's LedgerPortTypes). These checks run here because only a program that includes the ledger sees the augmentation.
import { describe, expectTypeOf, it } from 'vitest';
import type { LedgerPartition, LedgerPort, LedgerProvider, PhaseCtx, ValidateCtx } from '@tycoon/engine-core';
import type { Hold, HoldApi, LedgerApi, Posting } from '../src';

describe('E-81 (i): core\'s ledger port carries the ledger\'s own types (E-79: one definition each, in the ledger)', () => {
  it('ctx.ledger / ctx.holds are LedgerApi / HoldApi; the partition and provider postings are Posting', () => {
    expectTypeOf<LedgerPort<'ledger'>>().toEqualTypeOf<LedgerApi>(); expectTypeOf<LedgerPort<'holds'>>().toEqualTypeOf<HoldApi>();
    expectTypeOf<LedgerPort<'posting'>>().toEqualTypeOf<Posting>();
    expectTypeOf<PhaseCtx['ledger']>().toEqualTypeOf<LedgerApi>(); expectTypeOf<PhaseCtx['holds']>().toEqualTypeOf<HoldApi>();
    expectTypeOf<ValidateCtx['ledger']>().toEqualTypeOf<LedgerApi>(); expectTypeOf<ValidateCtx['holds']>().toEqualTypeOf<HoldApi>();
    expectTypeOf<ReturnType<LedgerPartition['apiFor']>>().toEqualTypeOf<{ ledger: LedgerApi; holds: HoldApi }>();
    expectTypeOf<ReturnType<LedgerPartition['queryPostings']>>().toEqualTypeOf<Posting[]>();
    expectTypeOf<ReturnType<LedgerPartition['prepare']>['postings']>().toEqualTypeOf<readonly Posting[]>();
    expectTypeOf<ReturnType<NonNullable<LedgerProvider['testHooks']>['postings']>>().toEqualTypeOf<Posting[]>();
  });
  it('LedgerApi keeps the 21 G7 methods and HoldApi the 5 members (+ placeCashFor); HoldApi.get returns the ledger Hold', () => {
    expectTypeOf<'pay'|'swapAsset'|'mint'|'burn'|'elasticIn'|'elasticOut'|'lend'|'repay'|'cbCredit'|'cbCreditUnwind'|'accrue'|'accruePair'|'fx'|'moveQty'|'reclass'|'balance'|'cash'|'available'|'position'|'availableQty'|'netWorth'>().toMatchTypeOf<keyof PhaseCtx['ledger']>();
    expectTypeOf<'placeCash'|'placeQty'|'release'|'reduce'|'get'|'placeCashFor'>().toMatchTypeOf<keyof PhaseCtx['holds']>();
    expectTypeOf<NonNullable<ReturnType<PhaseCtx['holds']['get']>>>().toEqualTypeOf<Hold>();
  });
});
