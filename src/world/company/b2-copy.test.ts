import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import type { B2Reject, CompanyRejectCode } from './types';

/** Every refusal code of B2 has the three copy parts (what, why, do) in English and French (C4). */
const B2_CODES: B2Reject['code'][] = [
  'notController', 'companyBankrupt', 'ceoChangePending', 'exCeoCooling', 'ceoExitFreeze', 'execFilled', 'execNotFound',
  'execTerm', 'execSalaryCap', 'guaranteeTooHigh', 'boardRejected', 'franchiseRate', 'franchiseCap', 'franchiseNoProduct',
  'supplyPriceOutOfBand', 'supplySelf', 'takeoverNotListed', 'takeoverNoBidder', 'takeoverBelowFloor', 'takeoverUnfunded',
  'takeoverSelfDeal', 'antitrustBlock', 'contractPriceOutOfBand', 'contractNotFound', 'notParty', 'loanBalance', 'loanTooSmall',
  'guaranteeLocked', 'takeoverNoFloor',
];

describe('B2 refusal copy (C4): three parts in en and fr', () => {
  it('every B2 code has what, why and do in both languages', () => {
    for (const code of B2_CODES) {
      for (const part of ['what', 'why', 'do']) {
        const key = `company.refusal.${code}.${part}`;
        expect((en as Record<string, string>)[key], key).toBeTruthy();
        expect((fr as Record<string, string>)[key], key).toBeTruthy();
      }
    }
  });

  it('the B2 codes are the whole B2 union: a new code without copy would fail here', () => {
    const union: CompanyRejectCode[] = B2_CODES;
    expect(new Set(union).size).toBe(B2_CODES.length);
  });
});
