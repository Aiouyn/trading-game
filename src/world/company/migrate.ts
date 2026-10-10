/**
 * Company records saved before B1 (the A3 core) have none of the B1 fields. This fills their empty values, once and without
 * changing anything else, so an old save loads and steps as a company with no IPO, no debt and no program. It is idempotent:
 * a record that already has the fields is left as it is.
 */

import type { Company } from './types';

export function migrateCompany(c: Company): void {
  if (c.ipo === undefined) c.ipo = null;
  if (c.filedV === undefined) c.filedV = 0;
  if (c.filedLnV === undefined) c.filedLnV = 0;
  if (c.debts === undefined) c.debts = [];
  if (c.debtSeq === undefined) c.debtSeq = 0;
  if (c.covenant === undefined) c.covenant = { status: 'ok', cureUntilDay: null };
  if (c.lastDebtDrawDay === undefined) c.lastDebtDrawDay = -1;
  if (c.liquidityCureUntilDay === undefined) c.liquidityCureUntilDay = null;
  if (c.divDistress === undefined) c.divDistress = false;
  if (c.windowRanges === undefined) c.windowRanges = [];
  if (c.lastFilingDay === undefined) c.lastFilingDay = c.filings.length > 0 ? c.filings[c.filings.length - 1]!.filedDay : -1;
  if (c.insiderTrades === undefined) c.insiderTrades = [];
  if (c.planRows === undefined) c.planRows = [];
  if (c.planSkips === undefined) c.planSkips = [];
  if (c.planSeq === undefined) c.planSeq = 0;
  if (c.buybacks === undefined) c.buybacks = [];
  if (c.buybackSeq === undefined) c.buybackSeq = 0;
  if (c.treasuryId === undefined) c.treasuryId = null;
  if (c.qtd.interest === undefined) c.qtd.interest = 0;
  if (c.qtd.dividends === undefined) c.qtd.dividends = 0;
}
