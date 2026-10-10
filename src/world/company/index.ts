/**
 * The company world (quant-company-building v1.7, stage A3): state, the founder's actions, the day step, the filings,
 * the signals and the two views. Import the public view for any screen; the founder view is for the founder's app.
 */
export {
  companyAction, companyTick, emptyCompanyWorld, foundCompany, privateValue, revenuePerDay,
} from './company';
export type { CompanyAction, CompanyEnv, CompanyEvent, Outcome } from './company';
export { publicCompanyView, founderCompanyView } from './views';
export type { CompanyPublic, CompanyFounderView } from './views';
export { tierFor, quarterTax, reversal, statementsHash, buildStatements, filingOf } from './filings';
export { vEngine, lnPerShare, sensCB, backlogLift, surprise, surpriseDenominator } from './valuation';
export type { ValuationInputs } from './valuation';
export { materialPerUnit, inputIndex, capacityPerDay, plantCost, plantMult, gaFactor } from './economics';
export { sha256Hex } from './hash';
export { ipoEligibility, requestIpo, orderIpo, listIpo, allocateIpo, ownerSetOf, treasuryIdOf, poolIdOf, npcBookIdOf } from './ipo';
export { rosterOf, syncWindow, windowAt, recordFounderFills } from './insiders';
export { commitPlanFor, cancelPlanFor, fileBuyback, applyProgramEvents } from './programs';
export { drawLoan, repayLoan, debtDay, covenantAtFiling, covenantBreachOf, ttmOf } from './debt';
export { declareDividend, dividendRule } from './payouts';
export { companyFinanceCommand, companyStep, type CompanyFinanceCommand } from './bridge';
export type * from './types';
