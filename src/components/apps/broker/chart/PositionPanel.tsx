'use client';

/**
 * The long and short position tools' risk panel (R-10-5): the risk in dollars and in percent of equity (synced both ways), the
 * quantity the stop distance allows, the reward to risk, the spread and fees, and the net P&L at the target and the stop. It
 * places the position as an order: a market, limit or stop entry, with the target and the stop attached as a bracket (the
 * engine places both legs when the entry fills, and one cancels the other).
 */
import { useState } from 'react';
import { buyingPower, estimateFill, type OrderType, type Side } from '@/engine';
import { useGame } from '@/game/store';
import { fmtNumber, money, pctUnit, price as fmtPrice, signedMoney } from '@/game/format';
import { t } from '@/i18n';
import type { ChartDrawing } from '@/world/drawings';
import { changeRefusal } from '../ticketMath';
import { seriesInfo } from '../seriesInfo';
import { positionLevels, positionValid } from './geometry';
import { riskOf, riskPctOf, riskUsdOf, type Direction } from './risk';
import { useDrawings } from './drawingStore';

/** The default risk when the position has none yet: 1% of equity (the retail rule of thumb). */
export const DEFAULT_RISK_PCT = 1;

/** How the entry is sent: at the market, or a limit or stop order at the entry price. */
export type EntryType = 'market' | 'limit' | 'stop';

export function PositionPanel({ assetId, drawing, onPlaced }: { assetId: string; drawing: ChartDrawing; onPlaced?: () => void }) {
  const world = useGame((s) => s.world);
  const def = useGame((s) => s.config.assets.find((a) => a.id === assetId));
  const me = useGame((s) => s.me);
  const canShort = useGame((s) => s.me?.account?.canShort ?? false);
  const playerId = useGame((s) => s.playerId);
  const rankId = useGame((s) => s.me?.player.rankId ?? 'R0');
  const act = useGame((s) => s.act);
  const [entry, setEntry] = useState<EntryType>('market');
  const [busy, setBusy] = useState(false);
  // the last refusal the engine gave the placement, shown under the button until the next attempt
  const [refusal, setRefusal] = useState<string | null>(null);
  const lv = positionLevels(drawing);
  // the live mid: a market entry sends its target and stop at the drawn distances from the mid (the drawn entry is a reference)
  const mid = world && assetId ? seriesInfo(world, assetId, rankId).price : 0;
  const dir = drawing.kind === 'short' ? 'short' : 'long';
  const equity = me?.player.netWorth ?? 0;
  const pos = drawing.position ?? { riskUsd: riskUsdOf(DEFAULT_RISK_PCT, equity), riskPct: DEFAULT_RISK_PCT };
  if (!lv) return null;

  const side: Side = dir === 'long' ? 'buy' : 'sell';
  const spreadBps = def?.spreadBps ?? 10;
  // the fee of one leg at the entry size: the engine's own estimate (its schedule, the minimum and the cap)
  const feeFor = (qty: number) => {
    if (!world || !(qty > 0)) return 0;
    try { return estimateFill(world, { assetId, side, qty }).fee; } catch { return 0; }
  };
  const qtyStep = def?.qtyStep ?? 1;
  // the buying power caps the size: a position the account cannot pay for is sized down, not sent to be refused
  const bp = world && playerId ? buyingPower(world, playerId) : 0;
  const maxQty = lv.entry > 0 ? bp / lv.entry : 0;
  const base = { direction: dir, entry: lv.entry, stop: lv.stop, target: lv.target, equity, riskUsd: pos.riskUsd, spreadBps, qtyStep, maxQty } as const;
  const provisional = riskOf({ ...base, feePerLeg: 0 });
  const r = riskOf({ ...base, feePerLeg: feeFor(provisional.qty) });
  const capped = provisional.qty > 0 && r.qty < floorQtyOf(dir, pos.riskUsd, lv, spreadBps, qtyStep);
  const valid = positionValid(drawing);

  /** The risk is one of two synced fields: a dollar edit sets the percent, and a percent edit the dollars. */
  const setRisk = (patch: { riskUsd: number } | { riskPct: number }) => {
    const riskUsd = 'riskUsd' in patch ? Math.max(0, patch.riskUsd) : riskUsdOf(patch.riskPct, equity);
    const riskPct = 'riskPct' in patch ? Math.max(0, patch.riskPct) : riskPctOf(patch.riskUsd, equity);
    const st = useDrawings.getState();
    st.commit(assetId, (st.byAsset[assetId] ?? []).map((x) => (x.id === drawing.id ? { ...x, position: { riskUsd, riskPct, feePerUnit: r.qty > 0 ? r.fees / 2 / r.qty : 0 } } : x)));
  };

  /** Places the position: a market, limit or stop entry for the quantity, with the target and the stop as the bracket. */
  const place = async () => {
    if (!valid || r.qty <= 0 || busy) return;
    const price = roundTick(lv.entry);
    const type: OrderType = entry === 'market' ? 'market' : entry === 'limit' ? 'limit' : 'stop';
    const shift = entry === 'market' && mid > 0 ? mid - lv.entry : 0;
    const order = {
      assetId, side, type, qty: r.qty, tif: 'gtc' as const,
      ...(type === 'limit' ? { limitPrice: price } : {}),
      ...(type === 'stop' ? { stopPrice: price } : {}),
      takeProfit: roundTick(lv.target + shift), stopLoss: roundTick(lv.stop + shift),
    };
    setBusy(true);
    const res = await act({ type: 'order.place', order }, { silent: true });
    setBusy(false);
    if (res.ok) {
      setRefusal(null);
      useGame.getState().toast({ tone: 'info', text: t('broker.position.placed', { ticker: assetId, qty: fmtNumber(r.qty, 0, 4) }) });
      onPlaced?.();
    } else {
      const c = changeRefusal(res.error ?? '', side, canShort);
      const text = t(c.key, c.vars);
      setRefusal(text);
      useGame.getState().toast({ tone: 'loss', text });
    }
  };

  const why = !valid ? t('broker.position.badSides') : r.qty <= 0 ? t('broker.position.noQty') : null;
  const pct = (p: number) => `${fmtNumber(((p / lv.entry) - 1) * 100, 2, 2)}${pctUnit()}`;
  return (
    <div className="space-y-1.5" data-testid="position-panel" data-direction={dir}>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-caption">
        <label className="text-fg-faint">
          {t('broker.position.riskUsd')}
          <input
            type="number" min={0} step="any" data-testid="position-risk-usd" value={Number(pos.riskUsd.toFixed(2))}
            onChange={(e) => setRisk({ riskUsd: Number(e.target.value) || 0 })}
            className="num mt-0.5 w-full rounded-sm border border-ink-3 bg-ink-0 px-1.5 py-0.5 text-fg"
          />
        </label>
        <label className="text-fg-faint">
          {t('broker.position.riskPct')}
          <input
            type="number" min={0} step="0.1" data-testid="position-risk-pct" value={Number(pos.riskPct.toFixed(3))}
            onChange={(e) => setRisk({ riskPct: Number(e.target.value) || 0 })}
            className="num mt-0.5 w-full rounded-sm border border-ink-3 bg-ink-0 px-1.5 py-0.5 text-fg"
          />
        </label>
      </div>
      <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-caption">
        <dt className="text-fg-faint">{t('broker.position.qty')}</dt><dd data-testid="position-qty" className="text-fg">{fmtNumber(r.qty, 0, 4)}</dd>
        <dt className="text-fg-faint">{t('broker.position.entry')}</dt><dd className="text-fg">{fmtPrice(lv.entry)}</dd>
        <dt className="text-fg-faint">{t('broker.position.target')}</dt><dd className="text-gain" data-testid="position-target">{fmtPrice(lv.target)} <span className="text-fg-faint">{pct(lv.target)}</span></dd>
        <dt className="text-fg-faint">{t('broker.position.stop')}</dt><dd className="text-loss" data-testid="position-stop">{fmtPrice(lv.stop)} <span className="text-fg-faint">{pct(lv.stop)}</span></dd>
        <dt className="text-fg-faint">{t('broker.position.rr')}</dt><dd data-testid="position-rr" className="text-fg">{fmtNumber(r.rr, 0, 2)}</dd>
        <dt className="text-fg-faint">{t('broker.position.spread')}</dt><dd className="text-fg-muted">{money(r.spreadCost)}</dd>
        <dt className="text-fg-faint">{t('broker.position.fees')}</dt><dd className="text-fg-muted">{money(r.fees)}</dd>
        <dt className="text-fg-faint">{t('broker.position.netTarget')}</dt><dd data-testid="position-net-target" className={r.netAtTarget >= 0 ? 'text-gain' : 'text-loss'}>{signedMoney(r.netAtTarget)}</dd>
        <dt className="text-fg-faint">{t('broker.position.netStop')}</dt><dd data-testid="position-net-stop" className={r.netAtStop >= 0 ? 'text-gain' : 'text-loss'}>{signedMoney(r.netAtStop)}</dd>
      </dl>
      <div role="radiogroup" aria-label={t('broker.position.entryType')} className="flex gap-1">
        {(['market', 'limit', 'stop'] as const).map((k) => (
          <button
            key={k} type="button" role="radio" aria-checked={entry === k} data-testid={`position-entry-${k}`} onClick={() => setEntry(k)}
            className={`h-6 flex-1 rounded-sm border px-1 text-micro ${entry === k ? 'border-brass/60 text-brass-hi' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
          >
            {t(`broker.position.entry.${k}`)}
          </button>
        ))}
      </div>
      <button
        type="button" data-testid="position-place" disabled={!valid || r.qty <= 0 || busy} onClick={() => void place()}
        className={`h-8 w-full rounded-md text-small font-semibold disabled:opacity-40 ${dir === 'long' ? 'bg-gain/80 text-ink-0' : 'bg-loss/80 text-ink-0'}`}
      >
        {t(dir === 'long' ? 'broker.position.placeLong' : 'broker.position.placeShort', { type: t(`broker.position.entry.${entry}`) })}
      </button>
      {why && <p className="text-micro text-fg-faint" data-testid="position-why">{why}</p>}
      {capped && <p className="text-micro text-fg-faint" data-testid="position-capped">{t('broker.position.capped')}</p>}
      {entry === 'market' && mid > 0 && Math.abs(mid - lv.entry) > 1e-9 && (
        <p className="text-micro text-fg-faint" data-testid="position-shift">{t('broker.position.shifted', { price: fmtPrice(mid) })}</p>
      )}
      {refusal && <p className="text-micro text-loss" data-testid="position-refusal" role="alert">{refusal}</p>}
    </div>
  );
}

/** The quantity the risk alone would size (before the buying power caps it), to tell the panel the cap has bitten. */
function floorQtyOf(dir: Direction, riskUsd: number, lv: { entry: number; stop: number; target: number }, spreadBps: number, qtyStep: number): number {
  return riskOf({ direction: dir, entry: lv.entry, stop: lv.stop, target: lv.target, equity: 0, riskUsd, spreadBps, feePerLeg: 0, qtyStep }).qty;
}

/** A level as it is sent: seven significant figures, so the float noise of a drag never reaches the order. */
function roundTick(p: number): number {
  return Number(p.toPrecision(7));
}
