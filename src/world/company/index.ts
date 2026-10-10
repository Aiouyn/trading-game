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
export type * from './types';
export { announceCeoChange, boardVote, ceoFreezeOn, controllerOf, execMult, fireExec, hireExec, setGuarantee } from './governance';
export { bankrupt, clawback, insolvencyStep, salaryCapPerDay, addSurveillance } from './failure';
export { bid, marketShareOf, observeStakes, t0Of, tenderFloor } from './takeover';
export { grantLicence, licenceCount, licenceDay } from './franchise';
export { openSupply, supplyDay } from './supply';
export { insiderBackstop } from './backstop';
export { linkOwner, ownerGroup, ownerSetOf } from './owners';
