'use client';

import { optionQuote, parseContract, portfolio, type WorldConfig, type WorldState } from '@/engine';
import { LICENSES, rankIndex } from '@/content/lifestyle';
import { sparkline } from '@/game/history';
import { price, pct, qty, signedMoney, signedPct, tone, toneText, money } from '@/game/format';
import { assetDefOf, useGame } from '@/game/store';
import { isDelisted, isUntradable } from '@/game/universe';
import { t } from '@/i18n';
import type { FillReason } from '@/engine/ledger-types';
import type { LedgerFill } from '@/world/ledger-types';
import { Button, Card, CardHeader, ConfirmButton, Flash, LockGlyph, Sparkline, Td, Th } from './ui';

/** The reason label for a fill (M13): what put the units on the books. */
export function reasonLabel(r: FillReason): string {
  return t(`holdings.reason.${r}`);
}

/** The last fill's reason for each asset, from the owner's fills (chronological, so the last one wins). */
export function lastReasonByAsset(fills: readonly LedgerFill[]): Map<string, FillReason> {
  const out = new Map<string, FillReason>();
  for (const f of fills) out.set(f.assetId, f.reason);
  return out;
}

/** DRIP on or off for one position (Phase 3 section 3): the server keeps it, so it survives a reload. */
export function DripToggle({ assetId }: { assetId: string }) {
  const on = useGame((s) => s.me?.trading?.plans?.drip.includes(assetId) ?? false);
  const act = useGame((s) => s.act);
  return (
    <button
      type="button" aria-pressed={on} title={t('holdings.dripTitle')} data-testid={`drip-${assetId}`}
      onClick={() => void act({ type: 'drip.set', assetId, on: !on }, { success: t(on ? 'holdings.dripOff' : 'holdings.dripOn', { ticker: assetId }) })}
      className={`rounded-chip border px-2 py-0.5 text-micro ${on ? 'border-brass/60 bg-brass/10 text-brass-hi' : 'border-ink-3 text-fg-faint hover:text-fg-muted'}`}
    >
      {t('holdings.drip')}
    </button>
  );
}

/**
 * The holdings the Portfolio and the Broker show: positions with their cash line, held options, the order
 * list (all open orders, or one ticker's when `assetId` is given), and the license ladder for Profile.
 * Moved here from the old Market screen module (Phase 2 step 3); no rule changed.
 */
export function Positions({ phone = false }: { phone?: boolean }) {
  const world = useGame((s) => s.world)!;
  const me = useGame((s) => s.me)!;
  const playerId = useGame((s) => s.playerId)!;
  useGame((s) => s.historyRev);
  const select = useGame((s) => s.select);
  const act = useGame((s) => s.act);
  if (!me.account) return null;
  const pf = portfolio(world, playerId);
  const h = useGame.getState().history;
  const reasons = lastReasonByAsset(me.trading?.fills ?? []);
  const lastFill = (assetId: string) => (reasons.has(assetId) ? t('holdings.lastFill', { reason: reasonLabel(reasons.get(assetId)!) }) : null);
  return (
    <Card data-testid="positions">
      <CardHeader
        title={t('holdings.positions')}
        right={(
          <span className="num text-caption text-fg-faint" data-testid="cash">
            {t('holdings.cash', { cash: money(pf.cash) })} · {t('holdings.unrealized')} <span className={toneText[tone(pf.unrealizedPnl)]}>{signedMoney(pf.unrealizedPnl)}</span>
          </span>
        )}
      />
      {pf.positions.length === 0 ? (
        <p className="px-4 pb-6 text-small text-fg-faint">{t('holdings.empty')}</p>
      ) : phone ? (
        <ul>
          {pf.positions.map((p) => (
            <li key={p.assetId} className="flex flex-wrap items-center gap-3 border-t border-ink-2 px-4 py-3" data-testid={`position-${p.assetId}`}>
              <button type="button" onClick={() => select(p.assetId)} className="min-w-0 flex-1 text-left">
                <div className="num text-small font-semibold">{p.assetId} {p.qty < 0 && <span className="text-loss">{t('holdings.short')}</span>}</div>
                <div className="num text-caption text-fg-faint">{qty(p.qty)} @ {price(p.avgCost)}</div>
                {lastFill(p.assetId) && <div className="text-caption text-fg-faint" data-testid={`position-reason-${p.assetId}`}>{lastFill(p.assetId)}</div>}
              </button>
              <div className="text-right">
                <div className="num text-small">{money(p.marketValue)}</div>
                <div className={`num text-caption ${toneText[tone(p.unrealizedPnl)]}`}>{signedMoney(p.unrealizedPnl)} {signedPct(p.unrealizedPct)}</div>
              </div>
              <DripToggle assetId={p.assetId} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr>
                <Th>{t('holdings.col.asset')}</Th><Th right>{t('holdings.col.qty')}</Th><Th right>{t('holdings.col.avg')}</Th><Th right>{t('holdings.col.last')}</Th>
                <Th right>{t('holdings.col.value')}</Th><Th right>{t('holdings.col.pnl')}</Th><Th right>{t('holdings.col.weight')}</Th><Th right>{t('holdings.col.fiveDay')}</Th><Th>{t('holdings.col.drip')}</Th><Th />
              </tr>
            </thead>
            <tbody>
              {pf.positions.map((p) => (
                <tr key={p.assetId} className="border-t border-ink-2 hover:bg-ink-2" data-testid={`position-${p.assetId}`}>
                  <Td>
                    <button type="button" onClick={() => select(p.assetId)} className="text-left">
                      <div className="num font-semibold">{p.assetId}{p.qty < 0 && <span className="ml-1.5 text-micro text-loss">{t('holdings.short').toUpperCase()}</span>}</div>
                      <div className="text-caption text-fg-faint">{assetDefOf(p.assetId)?.name}</div>
                      {lastFill(p.assetId) && <div className="text-caption text-fg-faint" data-testid={`position-reason-${p.assetId}`}>{lastFill(p.assetId)}</div>}
                    </button>
                  </Td>
                  <Td right num>{qty(p.qty)}</Td>
                  <Td right num>{price(p.avgCost)}</Td>
                  <Td right num><Flash value={p.price}>{price(p.price)}</Flash></Td>
                  <Td right num>{money(p.marketValue)}</Td>
                  <Td right num className={toneText[tone(p.unrealizedPnl)]}>{signedMoney(p.unrealizedPnl)}<div className="text-caption">{signedPct(p.unrealizedPct)}</div></Td>
                  <Td right num>{pct(p.weight)}</Td>
                  <Td right><Sparkline data={sparkline(h, p.assetId, 5)} /></Td>
                  <Td><DripToggle assetId={p.assetId} /></Td>
                  <Td right>
                    <ConfirmButton
                      confirm={t('holdings.close')}
                      onConfirm={() => act({ type: 'position.close', assetId: p.assetId }, { success: t('holdings.closing', { ticker: p.assetId }) })}
                      testId={`close-${p.assetId}`}
                    >
                      {t('holdings.close')}
                    </ConfirmButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OptionPositions />
    </Card>
  );
}

function OptionPositions() {
  const me = useGame((s) => s.me)!;
  const world = useGame((s) => s.world)!;
  const config = useGame((s) => s.config);
  const act = useGame((s) => s.act);
  const opts = Object.entries(me.account?.options ?? {});
  if (!opts.length) return null;
  return (
    <div className="border-t border-ink-2 px-4 py-3">
      <div className="label mb-2">{t('holdings.options')}</div>
      <OptionRows rows={opts} world={world} config={config} onClose={(id, n) => act({ type: 'option.trade', contractId: id, side: 'sell', qty: n }, { success: t('holdings.optionSold') })} />
    </div>
  );
}

/** Held contracts. On a delisted underlying they stay visible (they are still owned) but carry no close control. */
function OptionRows({ rows, world, config, onClose }: { rows: [string, { qty: number; avgCost: number }][]; world: WorldState; config: WorldConfig; onClose: (id: string, n: number) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(([id, pos]) => {
        const c = parseContract(id)!;
        const q = optionQuote(world, c);
        const pnl = (q.bid - pos.avgCost) * 100 * pos.qty;
        const dead = isUntradable(config, c.underlying);
        return (
          <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-small" data-testid={`option-${id}`}>
            <span className="num">
              {t('holdings.optionLine', {
                ticker: c.underlying, strike: c.strike, kind: t(c.kind === 'call' ? 'holdings.call' : 'holdings.put'), day: c.expiryDay + 1, qty: pos.qty,
              })}
            </span>
            <span className="num text-fg-muted">{t('holdings.bid', { p: price(q.bid), d: q.daysLeft.toFixed(1) })}</span>
            <span className={`num ${toneText[tone(pnl)]}`}>{signedMoney(pnl)}</span>
            {dead
              ? <span className="text-caption text-loss" data-testid={`option-delisted-${id}`}>{t(isDelisted(config, c.underlying) ? 'holdings.optionDelisted' : 'holdings.optionUntradable', { ticker: c.underlying })}</span>
              : <Button size="sm" onClick={() => onClose(id, pos.qty)}>{t('common.sell')}</Button>}
          </li>
        );
      })}
    </ul>
  );
}

/** Open orders: every open order, or only one ticker's when `assetId` is given (the Broker shows its own). */
export function OpenOrders({ assetId }: { assetId?: string } = {}) {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const open = me.orders.filter((o) => o.status === 'open' && (assetId === undefined || o.assetId === assetId));
  if (!open.length) return null;
  const typeLabel = (ty: string) => ({ market: t('order.market'), limit: t('order.limit'), stop: t('order.stop'), stop_limit: t('order.stop_limit'), trailing: t('order.trailing') } as Record<string, string>)[ty] ?? ty;
  return (
    <Card data-testid="open-orders">
      <CardHeader title={t('holdings.openOrders')} />
      <ul>
        {open.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-2 px-4 py-2.5 text-small" data-testid={`order-${o.id}`}>
            <span className={`num font-semibold ${o.side === 'buy' ? 'text-gain' : 'text-loss'}`}>{o.side === 'buy' ? t('common.buy') : t('common.sell')}</span>
            <span className="num">{qty(o.qty - o.filledQty)} {o.assetId}</span>
            <span className="text-fg-muted">{typeLabel(o.type)}{o.ocoGroup ? t('holdings.bracketTag') : ''}</span>
            {o.limitPrice !== undefined && <span className="num text-fg-muted">{t('holdings.limitAt', { p: price(o.limitPrice) })}</span>}
            {o.stopPrice !== undefined && <span className="num text-fg-muted">{t('holdings.stopAt', { p: price(o.stopPrice) })}</span>}
            {o.type === 'trailing' && <span className="num text-fg-muted">{t('holdings.trail', { pct: (o.trailPct! * 100).toFixed(1), p: price(o.trailRef ?? 0) })}</span>}
            {o.filledQty > 0 && <span className="num text-brass">{t('holdings.filled', { filled: qty(o.filledQty), qty: qty(o.qty) })}</span>}
            <span className="text-caption text-fg-faint">{o.tif === 'day' ? t('broker.day') : t('broker.gtcShort')}</span>
            <button type="button" onClick={() => act({ type: 'order.cancel', orderId: o.id })} className="ml-auto text-caption text-fg-muted underline hover:text-fg" data-testid="cancel-order">
              {t('common.cancel')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The license ladder on Profile: which licenses the player holds, and the rank each one needs. */
export function LicenseLadder() {
  const rankId = useGame((s) => s.me?.player.rankId ?? 'R0');
  return (
    <ul className="flex flex-col gap-2">
      {LICENSES.map((l) => {
        const have = rankIndex(rankId) >= rankIndex(l.rank);
        return (
          <li key={l.id} className={`rounded-md border p-3 ${have ? 'border-brass/40' : 'border-ink-3'}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{l.name}</span>
              {have ? <span className="text-caption text-brass">{t('holdings.held')}</span> : <span className="flex items-center gap-1 text-caption text-fg-faint"><LockGlyph size={12} /> {l.rank}</span>}
            </div>
            <p className="mt-1 text-caption text-fg-muted">{t(`license.blurb.${l.id}`)}</p>
          </li>
        );
      })}
    </ul>
  );
}

