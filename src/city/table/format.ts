import { money, signedPct } from '@/game/format';
import type { Ccy, MoneyString } from '../data/types';

/**
 * Money for display only, through the shared format module (17 §3.4). FDL renders as `$`
 * (22 §1); other currencies keep the amount and add the code until the format module grows a
 * currency-aware helper [open: Front Dev]. No arithmetic is done on the amount.
 */
export function moneyText(amount: MoneyString, ccy: Ccy): string {
  if (!/^-?\d+(\.\d+)?$/.test(amount)) return 'unavailable';
  const s = money(Number(amount));
  return ccy === 'FDL' ? s : `${s.replace('$', '')} ${ccy}`;
}

/** PnLChip-style day return: arrow + sign + colour token name. null → "unavailable". */
export function pnl(bp: number | null): { text: string; tone: 'gain' | 'loss' | 'flat' | 'none' } {
  if (bp === null || !Number.isFinite(bp)) return { text: 'unavailable', tone: 'none' };
  if (bp === 0) return { text: signedPct(0), tone: 'flat' };
  return bp > 0 ? { text: `▲ ${signedPct(bp / 10_000)}`, tone: 'gain' } : { text: `▼ ${signedPct(bp / 10_000)}`, tone: 'loss' };
}
