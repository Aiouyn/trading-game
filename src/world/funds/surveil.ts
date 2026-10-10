import type { Fill } from '@/engine';
import { FUND_RULES, FUND_TIME } from '@/content/funds';
import { openCase } from '../court';
import { say } from '../say';
import { usd } from '../text/template';
import type { GameState, StepOutput } from '../types';
import { fundByAccount, managedBy, victimOf } from './state';
import type { ManagerFill } from './types';

/**
 * Front-running surveillance (ROADMAP 2.2, safeguard 4). A manager's personal fill that comes within one game day before a
 * fund fill in the same asset and on the same side is a flagged pair: each one adds evidence, and the loss to the fund (the
 * fund's price against the manager's, on the fund's quantity) adds harm. Once the evidence meets the civil bar, a court case
 * is opened for the fund's largest other holder, who stands for the holders. The court decides; nothing here moves money.
 */

export function fundsFills(g: GameState, fills: Fill[], out: StepOutput | null): void {
  if (!g.funds || fills.length === 0) return;
  const window = FUND_TIME.frontRunWindowTicks;
  // the manager's personal fills first, so a fund fill in the same tick sees them
  for (const fl of fills) {
    const mf = managedBy(g, fl.playerId);
    if (!mf || fundByAccount(g, fl.playerId)) continue;
    mf.managerFills.push({ assetId: fl.assetId, side: fl.side, tick: fl.tick, price: fl.price, qty: fl.qty });
    if (mf.managerFills.length > FUND_RULES.managerFillsKeep) mf.managerFills.splice(0, mf.managerFills.length - FUND_RULES.managerFillsKeep);
  }
  for (const fl of fills) {
    const f = fundByAccount(g, fl.playerId);
    if (!f) continue;
    f.managerFills = f.managerFills.filter((m: ManagerFill) => m.tick >= fl.tick - window);
    // only the manager's own orders are discretionary: a forced sale for a redemption or the wind-down is not a fund trade of his
    if (f.managerOrders[fl.orderId] === undefined) continue;
    const cands = f.managerFills.filter((m) => m.assetId === fl.assetId && m.side === fl.side && m.tick <= fl.tick && m.tick >= fl.tick - window);
    if (cands.length === 0) continue;
    const near = cands[cands.length - 1]!;
    const sgn = fl.side === 'buy' ? 1 : -1;
    f.evidence += FUND_RULES.frontRunEvidence;
    f.harm += Math.max(0, sgn * (fl.price - near.price)) * fl.qty;
    // the manager's gain on his own position: the same move, on his quantity (disgorged at the verdict)
    f.gain += Math.max(0, sgn * (fl.price - near.price)) * near.qty;
    if (f.caseId === null && f.evidence >= FUND_RULES.civilBar) {
      const plaintiff = victimOf(f);
      if (plaintiff && g.players[plaintiff] && g.players[f.managerId]) {
        const c = openCase(g, plaintiff, f.managerId, 'fund abuse', f.evidence, out, { harm: f.harm, gain: f.gain, fundId: f.id });
        f.caseId = c.id;
        say(g, out, f.managerId, 'fund', 'warn', { key: 'funds.case.opened', vars: { fund: f.name, harm: usd(f.harm) } });
        say(g, out, plaintiff, 'fund', 'info', { key: 'funds.case.opened.holder', vars: { fund: f.name } });
      }
    }
  }
}
