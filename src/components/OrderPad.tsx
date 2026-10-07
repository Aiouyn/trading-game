'use client';

import { useState } from 'react';
import { openOrders, quote } from '@/engine';
import type { Order, OrderType, Side } from '@/engine';
import { tickMs } from '@/game/clock';
import { compactMoney, money, price, qty as fmtQty } from '@/game/format';
import { licenseCheck, lockedText, type LicenseCheck } from '@/game/license';
import { PLAYER, useGame } from '@/game/store';
import { FIRST_TRADE_CAP, assetDef, chipQty, isWhole, previewTicket, type TicketInput } from '@/game/ticket';
import { Card, LockGlyph, Segmented, TickRing } from './ui';

const CHIPS = [
  { label: '10%', f: 0.1 },
  { label: '25%', f: 0.25 },
  { label: '50%', f: 0.5 },
  { label: 'Max', f: 1 },
];

function parse(s: string): number {
  const v = Number(s.replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

/**
 * Trade ticket on Quant's order API: estimateFill for the live preview, placeOrder to submit.
 * Market orders fill on the next tick, so a pending order shows the tick ring until its fill.
 */
export function OrderPad({ onPlaced }: { onPlaced?: (o: Order) => void }) {
  const world = useGame((s) => s.world)!;
  const selected = useGame((s) => s.selected);
  const submit = useGame((s) => s.submitOrder);
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const cancel = useGame((s) => s.cancel);

  const [side, setSide] = useState<Side>('buy');
  const [type, setType] = useState<OrderType>('market');
  const [qtyText, setQtyText] = useState('');
  const [limitText, setLimitText] = useState('');
  const [stopText, setStopText] = useState('');

  const tradable = world.config.assets.some((a) => a.id === selected);
  if (!tradable) {
    return (
      <Card className="p-4" data-testid="order-pad">
        <h2 className="font-serif text-title text-fg">Trade</h2>
        <p className="mt-2 text-small text-fg-muted">The GX Index is a benchmark, not something you can buy yet. Pick a stock, coin or commodity from the watchlist to trade it.</p>
      </Card>
    );
  }

  const def = assetDef(world, selected);
  const q = quote(world, selected);
  const lic = licenseCheck(world, PLAYER, selected);
  if (!lic.ok) return <LockedTicket assetId={selected} ask={q.price} check={lic} />;
  const unit = isWhole(def) ? 'shares' : 'units';
  const ticket: TicketInput = {
    assetId: selected,
    side,
    type,
    qty: parse(qtyText),
    limitPrice: type === 'limit' ? parse(limitText) || undefined : undefined,
    stopPrice: type === 'stop' ? parse(stopText) || undefined : undefined,
  };
  const pv = previewTicket(world, PLAYER, ticket);
  const capped = side === 'buy' && Number.isFinite(pv.cap);
  const held = world.accounts[PLAYER]?.positions[selected]?.qty ?? 0;

  const setTypeAndSeed = (t: OrderType) => {
    setType(t);
    if (t === 'limit' && !limitText) setLimitText(q.price.toFixed(q.price >= 1 ? 2 : 4));
    if (t === 'stop' && !stopText) setStopText(q.price.toFixed(q.price >= 1 ? 2 : 4));
  };

  const place = () => {
    if (pv.block) return;
    const o = submit({ ...ticket, tif: type === 'market' ? undefined : 'gtc' });
    if (o && o.status !== 'rejected') {
      setQtyText('');
      onPlaced?.(o);
    }
  };

  const verb = side === 'buy' ? 'Buy' : 'Sell';
  const label = `${verb} ${ticket.qty > 0 ? fmtQty(ticket.qty) + ' ' : ''}${selected}`;
  const showReason = pv.block && pv.block !== 'Enter a quantity' ? pv.block : null;
  const pending = openOrders(world, PLAYER).find((o) => o.assetId === selected && o.type === 'market');

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="order-pad">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-title text-fg">Trade <span className="num text-body text-fg-muted">{selected}</span></h2>
        <span className="num text-caption text-fg-faint">
          {side === 'buy' ? 'Ask' : 'Bid'} <span className="text-fg">{price(previewTicket(world, PLAYER, { ...ticket, type: 'market', qty: isWhole(def) ? 1 : 0.0001 }).price)}</span>
        </span>
      </div>

      <Segmented<Side>
        label="Side"
        value={side}
        onChange={setSide}
        options={[{ value: 'buy', label: 'Buy', testId: 'side-buy' }, { value: 'sell', label: 'Sell', testId: 'side-sell' }]}
        className="w-full"
      />
      <Segmented<OrderType>
        label="Order type"
        value={type}
        onChange={setTypeAndSeed}
        size="sm"
        options={[
          { value: 'market', label: 'Market', testId: 'type-market' },
          { value: 'limit', label: 'Limit', testId: 'type-limit' },
          { value: 'stop', label: 'Stop', testId: 'type-stop' },
        ]}
        className="w-full"
      />

      <label className="flex flex-col gap-1">
        <span className="label">Quantity</span>
        <span className={`flex h-11 items-center rounded-md border bg-ink-0 px-3 ${showReason ? 'border-warn/70' : 'border-ink-3 focus-within:border-brass-lo'}`}>
          <input
            inputMode={isWhole(def) ? 'numeric' : 'decimal'}
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="0"
            className="num w-full min-w-0 bg-transparent text-right text-body text-fg outline-none placeholder:text-fg-disabled"
            aria-label={`Quantity in ${unit}`}
            data-testid="order-qty"
          />
          <span className="ml-2 text-caption text-fg-faint">{unit}</span>
        </span>
        {showReason && <span key={showReason} className="text-caption text-warn" data-testid="order-reason">{showReason}</span>}
      </label>

      {type !== 'market' && (
        <label className="flex flex-col gap-1">
          <span className="label">{type === 'limit' ? 'Limit price' : 'Stop price'}</span>
          <span className="flex h-11 items-center rounded-md border border-ink-3 bg-ink-0 px-3 focus-within:border-brass-lo">
            <input
              inputMode="decimal"
              value={type === 'limit' ? limitText : stopText}
              onChange={(e) => (type === 'limit' ? setLimitText : setStopText)(e.target.value.replace(/[^0-9.,]/g, ''))}
              className="num w-full min-w-0 bg-transparent text-right text-body text-fg outline-none"
              aria-label={type === 'limit' ? 'Limit price' : 'Stop price'}
              data-testid="order-price"
            />
          </span>
        </label>
      )}

      <div className="grid grid-cols-4 gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => {
              const n = chipQty(world, PLAYER, ticket, c.f);
              setQtyText(n > 0 ? String(n) : '');
            }}
            className="num h-11 rounded-md border border-ink-3 text-caption text-fg-muted hover:border-fg-disabled hover:text-fg"
            data-testid={`chip-${c.label.replace('%', '')}`}
          >
            {c.f === 1 && capped ? `Max ${Math.round(FIRST_TRADE_CAP * 100)}%` : c.label}
          </button>
        ))}
      </div>

      {capped && (
        <p className="text-caption text-fg-muted" data-testid="first-trade-cap">
          First trade is capped at {Math.round(FIRST_TRADE_CAP * 100)}% of cash (<span className="num">{money(pv.cap)}</span>).
        </p>
      )}
      {side === 'sell' && (
        <p className="text-caption text-fg-muted">You hold <span className="num text-fg">{fmtQty(held)}</span> {unit}.</p>
      )}

      <dl className="num grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-ink-2 pt-3 text-small">
        <dt className="font-sans text-fg-faint">{type === 'market' ? 'Est. price' : 'Worst price'}</dt>
        <dd className="text-right text-fg">{ticket.qty > 0 ? price(pv.price) : '\u2014'}</dd>
        <dt className="font-sans text-fg-faint">{side === 'buy' ? 'Est. cost' : 'Est. proceeds'}</dt>
        <dd className="text-right text-fg">{money(pv.notional)}</dd>
        <dt className="font-sans text-fg-faint">Fee</dt>
        <dd className="text-right text-fg">{money(pv.fee)}</dd>
        <dt className="font-sans text-fg-faint">Slippage</dt>
        <dd className="text-right text-fg">{money(pv.slippage)} <span className="text-fg-faint">&middot; {pv.slippageBps.toFixed(1)} bps</span></dd>
        <dt className="font-sans font-medium text-fg">Total</dt>
        <dd className="text-right font-medium text-fg" data-testid="order-total">{money(pv.total)}</dd>
        <dt className="font-sans text-fg-faint">Cash after</dt>
        <dd className={`text-right ${pv.cashAfter < 0 ? 'text-loss' : 'text-fg-muted'}`}>{money(pv.cashAfter)}</dd>
      </dl>

      {pending ? (
        <PendingRow order={pending} halted={q.halted} tick={world.tick} ms={tickMs(speed)} paused={paused} onCancel={() => cancel(pending.id)} />
      ) : (
        <button
          type="button"
          onClick={place}
          disabled={!!pv.block}
          className={`h-12 w-full text-body ${pv.block ? 'cursor-not-allowed rounded-md bg-ink-3 font-medium text-fg-disabled' : 'btn-brass'}`}
          data-testid="order-submit"
        >
          {label}
        </button>
      )}
      {type !== 'market' && !pending && <p className="-mt-1 text-caption text-fg-faint">Limit and stop orders stay open until they fill or you cancel them.</p>}
    </Card>
  );
}

/** A market order waiting for the next tick: the tick ring fills until the fill (DESIGN.md §6a). */
function PendingRow({ order, halted, tick, ms, paused, onCancel }: { order: Order; halted: boolean; tick: number; ms: number; paused: boolean; onCancel: () => void }) {
  return (
    <div className="flex h-12 items-center gap-3 rounded-md border border-ink-3 bg-ink-2 px-3" data-testid="order-pending" role="status">
      {halted ? <PauseGlyph /> : <TickRing tick={tick} ms={ms} paused={paused} size={22} label="Filling at the next tick" />}
      <span className="min-w-0 flex-1 truncate text-small text-fg">
        {halted ? 'Waits for reopen' : 'Filling at next tick'}
        <span className="num ml-2 text-caption text-fg-muted">{order.side === 'buy' ? 'Buy' : 'Sell'} {fmtQty(order.qty - order.filledQty)} {order.assetId}</span>
      </span>
      <button type="button" onClick={onCancel} className="h-11 px-1 text-small text-fg-muted underline-offset-4 hover:text-fg hover:underline" data-testid="cancel-order">
        Cancel
      </button>
    </div>
  );
}

/** Ticket for an asset the player's license does not cover yet: watchable, not tradable. */
function LockedTicket({ assetId, ask, check }: { assetId: string; ask: number; check: Extract<LicenseCheck, { ok: false }> }) {
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="order-pad">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-title text-fg">
          Trade <span className="num text-small text-fg-muted">{assetId}</span>
        </h2>
        <span className="num text-caption text-fg-faint">Ask {price(ask)}</span>
      </div>
      <div className="flex items-start gap-3 rounded-md border border-ink-3 bg-ink-0 p-3" data-testid="license-locked">
        <LockGlyph />
        <div className="min-w-0">
          <p className="text-small font-medium text-fg">{lockedText(check, compactMoney)}</p>
          <p className="mt-1 text-caption text-fg-muted">
            The {check.license.name} license opens {check.license.unlocks}. You can follow {assetId} on the chart until then.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-chip bg-ink-3"
          role="progressbar"
          aria-label={`Progress to ${check.rank.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(check.progress * 100)}
          data-testid="license-progress"
        >
          <div className="h-full rounded-chip bg-brass" style={{ width: `${Math.max(2, check.progress * 100)}%` }} />
        </div>
        <span className="num whitespace-nowrap text-caption text-fg-faint">
          {compactMoney(check.equity)} / {compactMoney(check.rank.threshold)} to {check.rank.name}
        </span>
      </div>
      <button type="button" disabled className="h-12 w-full cursor-not-allowed rounded-md bg-ink-3 text-body font-medium text-fg-disabled" data-testid="order-submit">
        Locked until {check.rank.name}
      </button>
    </Card>
  );
}

function PauseGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-label="Halted" role="img" className="shrink-0 fill-steel">
      <rect x="6.5" y="5" width="3" height="12" rx="1" />
      <rect x="12.5" y="5" width="3" height="12" rx="1" />
    </svg>
  );
}

/**
 * The "Open orders" strip under Positions: every open order except a market order that is
 * already shown in the ticket. Partial fills show "18 / 40 filled" with a thin brass bar.
 */
export function OpenOrders() {
  const world = useGame((s) => s.world)!;
  const selected = useGame((s) => s.selected);
  const cancel = useGame((s) => s.cancel);
  const open = openOrders(world, PLAYER).filter((o) => !(o.type === 'market' && o.assetId === selected));
  if (open.length === 0) return null;
  return (
    <Card className="px-4 py-3" data-testid="open-orders">
      <h2 className="label mb-1">Open orders</h2>
      <ul>
        {open.map((o) => {
          const halted = quote(world, o.assetId).halted;
          const trigger =
            o.type === 'limit' ? `Limit ${price(o.limitPrice ?? 0)}` :
            o.type === 'stop' ? `Stop ${price(o.stopPrice ?? 0)}${o.triggered ? ' \u00b7 triggered' : ''}` :
            halted ? 'Market \u00b7 waits for reopen' : 'Market \u00b7 next tick';
          return (
            <li key={o.id} className="flex min-h-11 items-center gap-3 border-t border-ink-2 py-1.5 first:border-t-0" data-testid="open-order">
              <span className={`num w-10 text-small font-semibold ${o.side === 'buy' ? 'text-gain' : 'text-loss'}`}>{o.side === 'buy' ? 'Buy' : 'Sell'}</span>
              <span className="num min-w-0 flex-1 text-small text-fg">
                {fmtQty(o.qty)} {o.assetId} <span className="text-fg-muted">{trigger}</span>
                {o.filledQty > 0 && (
                  <span className="mt-1 flex items-center gap-2 text-caption text-fg-muted">
                    {fmtQty(o.filledQty)} / {fmtQty(o.qty)} filled
                    <span className="h-0.5 w-20 overflow-hidden rounded-chip bg-ink-3">
                      <span className="block h-full bg-brass transition-[width] duration-[var(--dur-base)]" style={{ width: `${(o.filledQty / o.qty) * 100}%` }} />
                    </span>
                  </span>
                )}
              </span>
              <button type="button" onClick={() => cancel(o.id)} className="h-11 px-1 text-small text-fg-muted hover:text-fg" data-testid="cancel-order">
                Cancel
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
