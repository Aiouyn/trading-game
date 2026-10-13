'use client';

import { useEffect, useRef, useState } from 'react';
import type { LessonOrderType } from '@/content/lessons';
import { money, assetPrice, qty, signedMoney, signedPct } from '@/game/format';
import { assetDefOf } from '@/game/store';
import { t } from '@/i18n';
import type { ActResult, SandboxCommand, SandboxView } from '@/sandbox/sandbox';
import { Button, Card, NumberField, Segmented, Select } from '@/components/ui';
import { sandboxErrorCode, sandboxRpc, type OpenedSandbox } from './sandboxRpc';

/**
 * A trading desk on one sandbox: the order form, the paper account and the step control. The lessons, the practice
 * account, the scenarios and the weekly challenge all use it, so every paper trade is shown the same way. It only talks
 * to the sandbox client (sandboxRpc); the live store is not read.
 */

/** The reasons the engine gives for a refused order, as copy keys (anything else is 'other'). */
const REASON_KEY: Record<string, string> = {
  'insufficient cash': 'sandbox.reason.insufficient-cash',
  'insufficient position': 'sandbox.reason.insufficient-position',
  'insufficient buying power': 'sandbox.reason.insufficient-buying-power',
  'unknown-order': 'sandbox.reason.not-open',
  'not-open': 'sandbox.reason.not-open',
  'run-complete': 'sandbox.reason.run-complete',
};

export function reasonText(reason: string | null): string {
  return t(REASON_KEY[reason ?? ''] ?? 'sandbox.reason.other');
}

/**
 * A sensible starting price for a new order, a few per cent away from the market, so the form starts from a price the
 * engine accepts. The learner sets the real price.
 */
export function startPrice(market: number, side: 'buy' | 'sell', type: LessonOrderType): number {
  if (type === 'limit') return side === 'buy' ? market * 0.97 : market * 1.03;
  if (type === 'stop') return side === 'sell' ? market * 0.95 : market * 1.05;
  return market;
}

/**
 * The label every paper-money surface carries: the practice tint and the words "not your real money". It sits above each
 * sandbox (lessons, the practice account, scenarios, the challenge), so paper money is never mistaken for the live game.
 */
export function PracticeBanner({ testId = 'practice-banner' }: { testId?: string }) {
  return (
    <div className="practice-banner" role="note" data-testid={testId}>
      <span className="font-semibold">{t('practice.banner')}</span>
      <span className="text-caption">{t('practice.banner.sub')}</span>
    </div>
  );
}

export interface DeskState {
  view: SandboxView;
  prices: Record<string, number>;
}

export interface DeskProps {
  sb: OpenedSandbox;
  /** the test id prefix of this desk (practice, lesson, scenario, challenge) */
  prefix: string;
  /** the stocks offered in the order form, with their class */
  assets: readonly { id: string; assetClass: string }[];
  /** the stock the form starts on */
  defaultAsset: string;
  /** the order types the form offers */
  types: readonly LessonOrderType[];
  /** the quantity the form starts with */
  defaultQty: number;
  /** called with each order the learner placed and the sandbox's answer */
  onAct?: (command: SandboxCommand, result: ActResult) => void;
  /** called with the sandbox state after every change (a lesson checks it) */
  onState?: (state: DeskState) => void;
  /** a line above the form, such as a lesson's setup line */
  note?: string;
}

type Side = 'buy' | 'sell';
type Order = Extract<SandboxCommand, { type: 'place' }>['order'];

/** The sandbox's state as the desk reads it: the account view and the market's prices. */
export async function readDesk(id: string): Promise<DeskState> {
  const [view, market] = await Promise.all([sandboxRpc.view(id), sandboxRpc.market(id)]);
  return { view, prices: market.prices };
}

export function PracticeDesk({ sb, prefix, assets, defaultAsset, types, defaultQty, onAct, onState, note }: DeskProps) {
  const [state, setState] = useState<DeskState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asset, setAsset] = useState(defaultAsset);
  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<LessonOrderType>(types[0] ?? 'market');
  const [qtyText, setQtyText] = useState(String(defaultQty));
  /** the learner's own price, once typed; null means "the form's suggested price" */
  const [priceEdit, setPriceEdit] = useState<string | null>(null);
  const alive = useRef(true);
  // callbacks are read through refs, so a parent that passes new functions each render cannot re-run the loads
  const onStateRef = useRef(onState);
  const onActRef = useRef(onAct);
  useEffect(() => {
    onStateRef.current = onState;
    onActRef.current = onAct;
  });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /** Reload the state after a change. Results land only while the desk is mounted. Called from handlers only. */
  async function reload(): Promise<void> {
    try {
      const next = await readDesk(sb.id);
      if (!alive.current) return;
      setState(next);
      onStateRef.current?.(next);
    } catch (e) {
      if (alive.current) setNotice(t('practice.error.generic') + ' ' + sandboxErrorCode(e));
    }
  }

  useEffect(() => {
    let live = true;
    readDesk(sb.id)
      .then((next) => {
        if (!live || !alive.current) return;
        setState(next);
        onStateRef.current?.(next);
      })
      .catch((e: unknown) => {
        if (live && alive.current) setNotice(t('practice.error.generic') + ' ' + sandboxErrorCode(e));
      });
    return () => { live = false; };
  }, [sb.id]);

  if (!state) return <p className="text-small text-fg-faint" data-testid={`${prefix}-loading`}>{t('practice.loading')}</p>;

  const { view, prices } = state;
  const finished = view.complete;
  const priceNow = prices[asset];
  const suggested = priceNow !== undefined && type !== 'market' ? String(Number(startPrice(priceNow, side, type).toFixed(2))) : '';
  const priceText = priceEdit ?? suggested;
  const holdings = view.portfolio.positions.filter((p) => Math.abs(p.qty) > 1e-9);
  const needsPrice = type === 'limit' || type === 'stop';

  /** Change one form field; a new side, type or stock drops a typed price back to the suggestion. */
  function choose(change: () => void) {
    change();
    setPriceEdit(null);
  }

  async function place() {
    const order: Order = { assetId: asset, side, type, qty: Number(qtyText) };
    if (type === 'limit') order.limitPrice = Number(priceText);
    if (type === 'stop') order.stopPrice = Number(priceText);
    const command: SandboxCommand = { type: 'place', order };
    setBusy(true);
    try {
      const result = await sandboxRpc.act(sb.id, command);
      onActRef.current?.(command, result);
      setNotice(result.ok ? t('practice.placed') : reasonText(result.reason));
    } catch (e) {
      setNotice(t('practice.error.generic') + ' ' + sandboxErrorCode(e));
    } finally {
      setBusy(false);
      void reload();
    }
  }

  async function cancel(orderId: string) {
    try {
      const result = await sandboxRpc.act(sb.id, { type: 'cancel', orderId });
      setNotice(result.ok ? t('practice.cancelled') : reasonText(result.reason));
    } catch (e) {
      setNotice(t('practice.error.generic') + ' ' + sandboxErrorCode(e));
    }
    void reload();
  }

  async function advance() {
    setBusy(true);
    try {
      await sandboxRpc.step(sb.id, view.ticksPerDay);
      setNotice(null);
    } catch (e) {
      setNotice(t('practice.error.generic') + ' ' + sandboxErrorCode(e));
    } finally {
      setBusy(false);
      void reload();
    }
  }

  /** Steps whole days until the run's last tick. Each step is one game day, so the page stays responsive. */
  async function playToEnd() {
    setBusy(true);
    try {
      let v = view;
      let guard = 0;
      while (!v.complete && guard < 400) {
        await sandboxRpc.step(sb.id, v.ticksPerDay);
        v = await sandboxRpc.view(sb.id);
        if (!alive.current) return;
        guard++;
      }
      setNotice(t('practice.finished'));
    } catch (e) {
      setNotice(t('practice.error.generic') + ' ' + sandboxErrorCode(e));
    } finally {
      setBusy(false);
      void reload();
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`${prefix}-desk`}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-small sm:grid-cols-4">
        <div><dt className="label text-fg-faint">{t('practice.cash')}</dt><dd className="num" data-testid={`${prefix}-cash`}>{money(view.portfolio.cash)}</dd></div>
        <div><dt className="label text-fg-faint">{t('practice.equity')}</dt><dd className="num" data-testid={`${prefix}-equity`}>{money(view.equity)}</dd></div>
        <div><dt className="label text-fg-faint">{t('practice.return')}</dt><dd className="num" data-testid={`${prefix}-return`}>{signedPct(view.returnPct)}</dd></div>
        <div><dt className="label text-fg-faint">{t('practice.fees')}</dt><dd className="num" data-testid={`${prefix}-fees`}>{money(view.portfolio.feesPaid)}</dd></div>
      </dl>
      <p className="text-caption text-fg-faint" data-testid={`${prefix}-day`}>{t('practice.day', { day: view.day + 1 })}</p>

      {note && <p className="text-small text-fg-muted" data-testid={`${prefix}-note`}>{note}</p>}

      <Card className="flex flex-col gap-3 p-3" data-testid={`${prefix}-form`}>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label={t('practice.asset')}
            value={asset}
            onChange={(v) => choose(() => setAsset(v))}
            options={assets.map((a) => ({ value: a.id, label: a.id }))}
            testId={`${prefix}-asset`}
          />
          <Segmented
            label={t('practice.side')}
            size="sm"
            value={side}
            onChange={(v) => choose(() => setSide(v as Side))}
            options={[
              { value: 'buy', label: t('common.buy'), testId: `${prefix}-side-buy` },
              { value: 'sell', label: t('common.sell'), testId: `${prefix}-side-sell` },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {types.length > 1 && (
            <Segmented
              label={t('practice.type')}
              size="sm"
              value={type}
              onChange={(v) => choose(() => setType(v as LessonOrderType))}
              options={types.map((k) => ({ value: k, label: t(`practice.type.${k}`), testId: `${prefix}-type-${k}` }))}
            />
          )}
          <NumberField label={t('practice.qty')} value={qtyText} onChange={setQtyText} min={0} testId={`${prefix}-qty`} className="w-40" />
          {needsPrice && (
            <NumberField
              label={type === 'stop' ? t('practice.price.stop') : t('practice.price.limit')}
              value={priceText}
              onChange={setPriceEdit}
              min={0}
              testId={`${prefix}-price`}
              className="w-44"
            />
          )}
        </div>
        <p className="text-caption text-fg-faint" data-testid={`${prefix}-now`}>
          {priceNow !== undefined ? `${t('practice.price.now')} ${assetPrice(assetDefOf(asset) ?? { assetClass: 'stock' }, priceNow)}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="brass" onClick={place} disabled={busy || finished} testId={`${prefix}-place`}>{t('practice.place')}</Button>
          <Button variant="outline" onClick={advance} disabled={busy || finished} testId={`${prefix}-step`}>{t('practice.step')}</Button>
          <Button variant="ghost" onClick={playToEnd} disabled={busy || finished} testId={`${prefix}-play-end`}>{t('practice.playEnd')}</Button>
        </div>
        {notice && <p className="text-small text-fg-muted" role="status" data-testid={`${prefix}-notice`}>{notice}</p>}
        {finished && <p className="text-small text-fg" data-testid={`${prefix}-finished`}>{t('practice.finished')}</p>}
      </Card>

      <section className="flex flex-col gap-1" data-testid={`${prefix}-positions`}>
        <h3 className="label text-fg-faint">{t('practice.positions')}</h3>
        {holdings.length === 0 && <p className="text-small text-fg-faint">{t('practice.noPositions')}</p>}
        {holdings.map((p) => (
          <div key={p.assetId} className="flex items-center justify-between gap-2 border-t border-ink-2 py-1 text-small" data-testid={`${prefix}-position-${p.assetId}`}>
            <span className="font-semibold">{p.assetId}</span>
            <span className="num text-fg-muted">{qty(p.qty)}</span>
            <span className="num">{assetPrice(assetDefOf(p.assetId) ?? { assetClass: 'stock' }, p.price)}</span>
            <span className={`num ${p.unrealizedPnl < 0 ? 'text-loss' : 'text-gain'}`}>{signedMoney(p.unrealizedPnl)}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-1" data-testid={`${prefix}-orders`}>
        <h3 className="label text-fg-faint">{t('practice.orders')}</h3>
        {view.openOrders.length === 0 && <p className="text-small text-fg-faint">{t('practice.noOrders')}</p>}
        {view.openOrders.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-2 border-t border-ink-2 py-1 text-small" data-testid={`${prefix}-order-${o.id}`}>
            <span>{t(o.side === 'buy' ? 'common.buy' : 'common.sell')} {qty(o.qty)} {o.assetId} · {orderTypeText(o.type)}</span>
            <Button variant="ghost" size="sm" onClick={() => cancel(o.id)} disabled={busy} testId={`${prefix}-cancel-${o.id}`}>{t('practice.cancel')}</Button>
          </div>
        ))}
      </section>
    </div>
  );
}

/** The copy for an order type: the three the form offers, and the engine's other types under their own name. */
function orderTypeText(type: string): string {
  return type === 'market' || type === 'limit' || type === 'stop' ? t(`practice.type.${type}`) : type;
}
