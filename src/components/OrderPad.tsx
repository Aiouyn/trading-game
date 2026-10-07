'use client';

import { useMemo, useState } from 'react';
import { buyingPower, commission, estimateFill, type OrderType, type Side } from '@/engine';
import { licenseFor } from '@/content/lifestyle';
import { money, price, qty as fmtQty } from '@/game/format';
import { CONFIG, isIndex, useGame } from '@/game/store';
import { Button, Card, KV, LockGlyph, NumberField, Segmented } from './ui';

const TYPE_OPTS: { value: OrderType; label: string; testId: string }[] = [
  { value: 'market', label: 'Market', testId: 'type-market' },
  { value: 'limit', label: 'Limit', testId: 'type-limit' },
  { value: 'stop', label: 'Stop', testId: 'type-stop' },
  { value: 'stop_limit', label: 'Stop-lim', testId: 'type-stop_limit' },
  { value: 'trailing', label: 'Trail', testId: 'type-trailing' },
];

const TYPE_HELP: Record<OrderType, string> = {
  market: 'Fills at the next tick at the best available price.',
  limit: 'Fills only at your price or better. May never fill.',
  stop: 'Waits until the price crosses your stop, then trades at market. Classic stop-loss.',
  stop_limit: 'Crosses the stop, then only fills at your limit or better.',
  trailing: 'A stop that follows the price by a set %, locking in gains.',
};

function num(s: string): number {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

export function OrderPad() {
  const selected = useGame((s) => s.selected);
  const preset = useGame((s) => s.ticketPreset);
  // a new asset or a new preset starts a fresh ticket
  return <Ticket key={`${selected}-${preset?.nonce ?? 0}`} preset={preset} />;
}

function Ticket({ preset }: { preset: ReturnType<typeof useGame.getState>['ticketPreset'] }) {
  const world = useGame((s) => s.world);
  const me = useGame((s) => s.me);
  const playerId = useGame((s) => s.playerId);
  const selected = useGame((s) => s.selected);
  const act = useGame((s) => s.act);
  const setSheet = useGame((s) => s.setTradeSheet);
  const [side, setSide] = useState<Side>(preset?.side ?? 'buy');
  const [type, setType] = useState<OrderType>(preset?.type ?? 'market');
  const [q, setQ] = useState(preset?.qty !== undefined ? String(preset.qty) : '');
  const [limit, setLimit] = useState(preset?.limitPrice !== undefined ? preset.limitPrice.toFixed(2) : '');
  const [stop, setStop] = useState(preset?.stopPrice !== undefined ? preset.stopPrice.toFixed(2) : '');
  const [trail, setTrail] = useState('5');
  const [tif, setTif] = useState<'gtc' | 'day'>('gtc');
  const [bracket, setBracket] = useState(false);
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');


  const ctx = useMemo(() => {
    if (!world || !me || !playerId || isIndex(selected)) return null;
    const i = CONFIG.assets.findIndex((a) => a.id === selected);
    const def = CONFIG.assets[i];
    if (!def || def.listed === false) return null;
    const a = world.assets[i]!;
    return { def, mid: Math.exp(a.lnP), halted: a.haltUntil !== -1 && a.haltUntil > world.tick };
  }, [world, me, playerId, selected]);

  if (!world || !me || !playerId) return null;
  if (!ctx) {
    return (
      <Card className="p-4" data-testid="order-pad">
        <h2 className="font-serif text-title">Trade</h2>
        <p className="mt-2 text-small text-fg-muted">Indices can’t be traded directly. Pick a stock, coin, commodity, currency or bond fund.</p>
      </Card>
    );
  }
  const { def, mid, halted } = ctx;
  const lic = licenseFor(me.player.rankId);
  const locked = !lic.classes.includes(def.assetClass);
  const acct = me.account!;
  const held = acct.positions[selected]?.qty ?? 0;
  const whole = def.assetClass === 'stock';
  const firstTrade = me.player.stats.trades === 0 && !me.player.onboarding.skipped;
  const simple = firstTrade;
  const qtyN = num(q);
  const est = estimateFill(world, { assetId: selected, side, qty: Math.max(qtyN, whole ? 1 : 0.0001) });
  const refPrice = type === 'limit' || type === 'stop_limit' ? num(limit) || est.price : type === 'stop' ? num(stop) || est.price : est.price;
  const notional = qtyN * refPrice;
  const fee = commission(world, def, notional);
  const total = side === 'buy' ? notional + fee : notional - fee;
  const bp = buyingPower(world, playerId);
  const margin = (acct.maxLeverage ?? 1) > 1 || !!acct.canShort;
  const capCash = firstTrade ? acct.cash * 0.2 : Infinity;
  const budget = side === 'buy' ? Math.min(margin ? bp : acct.cash, capCash) : 0;
  const maxQty = side === 'buy'
    ? Math.max(0, (budget - (def.assetClass === 'crypto' ? 0 : 1)) / (est.price * 1.002))
    : held > 0 ? held : acct.canShort ? bp / est.price : 0;
  const roundQ = (x: number) => (whole ? Math.floor(x) : Math.floor(x * 1e4) / 1e4);
  const shorting = side === 'sell' && qtyN > Math.max(0, held) + 1e-9;

  let invalid: string | null = null;
  if (locked) invalid = `Needs the ${def.assetClass === 'stock' || def.assetClass === 'crypto' ? 'Retail' : 'Pro'} license`;
  else if (qtyN <= 0) invalid = null;
  else if (whole && !Number.isInteger(qtyN)) invalid = 'Whole shares only';
  else if (side === 'buy' && firstTrade && notional > capCash + 1e-6) invalid = 'First trade is capped at 20% of cash';
  else if (side === 'buy' && !margin && total > acct.cash + 1e-6) invalid = 'Not enough cash';
  else if (side === 'buy' && margin && notional > bp + Math.max(0, -held) * refPrice + 1e-6) invalid = 'Not enough buying power';
  else if (shorting && !acct.canShort) invalid = held > 0 ? 'You hold fewer' : 'Short selling needs the Pro license (Owner)';
  else if ((type === 'limit' || type === 'stop_limit') && num(limit) <= 0) invalid = 'Set a limit price';
  else if ((type === 'stop' || type === 'stop_limit') && num(stop) <= 0) invalid = 'Set a stop price';
  else if (type === 'trailing' && !(num(trail) > 0 && num(trail) < 50)) invalid = 'Trail between 0% and 50%';
  else if (bracket && (num(tp) <= 0 || num(sl) <= 0)) invalid = 'Set take-profit and stop-loss';
  else if (bracket && (side === 'buy' ? num(tp) <= num(sl) : num(tp) >= num(sl))) invalid = 'Take-profit must be on the profit side';

  const canSubmit = !invalid && qtyN > 0;
  const actionLabel = `${side === 'buy' ? (held < 0 ? 'Buy to cover' : 'Buy') : shorting ? 'Sell short' : 'Sell'} ${qtyN > 0 ? fmtQty(qtyN) : ''} ${selected}`.replace(/\s+/g, ' ');

  const submit = async () => {
    const order = {
      assetId: selected, side, type, qty: qtyN, tif,
      ...(type === 'limit' || type === 'stop_limit' ? { limitPrice: num(limit) } : {}),
      ...(type === 'stop' || type === 'stop_limit' ? { stopPrice: num(stop) } : {}),
      ...(type === 'trailing' ? { trailPct: num(trail) / 100 } : {}),
      ...(bracket ? { takeProfit: num(tp), stopLoss: num(sl) } : {}),
    };
    const r = await act({ type: 'order.place', order });
    if (r.ok) {
      setQ('');
      useGame.getState().toast({ tone: 'info', text: type === 'market' ? `${actionLabel}: fills at the next tick` : `${actionLabel}: order working` });
      if (type !== 'market') setSheet(false);
    }
  };

  return (
    <Card className="p-4" data-testid="order-pad">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-title">Trade</h2>
        <span className="text-caption text-fg-faint">{lic.name} license{margin ? ` · ${acct.maxLeverage}× margin` : ''}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-caption">
        <span className="num text-fg-muted">{selected} · mid {price(mid)}</span>
        {held !== 0 && <span className="num text-fg-faint">You hold {fmtQty(held)}</span>}
      </div>

      {locked ? (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-ink-3 p-3" data-testid="locked-ticket">
          <LockGlyph />
          <p className="text-small text-fg-muted">{def.name} needs the Pro license, earned at Owner ($250k net worth).</p>
        </div>
      ) : (
        <>
          <Segmented label="Side" className="mt-3 w-full" value={side} onChange={(v) => setSide(v as Side)}
            options={[{ value: 'buy', label: held < 0 ? 'Buy / Cover' : 'Buy', testId: 'side-buy' }, { value: 'sell', label: held > 0 || !acct.canShort ? 'Sell' : 'Sell / Short', testId: 'side-sell' }]} />
          {!simple && (
            <Segmented label="Order type" size="sm" className="mt-2 w-full" value={type} onChange={(v) => setType(v as OrderType)} options={TYPE_OPTS} />
          )}
          <p className="mt-1.5 text-caption text-fg-faint">{TYPE_HELP[type]}</p>

          <NumberField className="mt-3" label="Quantity" value={q} onChange={setQ} suffix={whole ? 'shares' : 'units'} step={whole ? 1 : 'any'} testId="order-qty" />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[0.1, 0.25, 0.5, 1].map((f) => (
              <button key={f} type="button" onClick={() => setQ(String(roundQ(maxQty * f)))}
                className="h-9 rounded-md border border-ink-3 text-caption text-fg-muted hover:border-brass/50 hover:text-fg" data-testid={`chip-${f === 1 ? 'Max' : Math.round(f * 100)}`}>
                {f === 1 ? (firstTrade && side === 'buy' ? 'Max 20%' : 'Max') : `${Math.round(f * 100)}%`}
              </button>
            ))}
          </div>
          {firstTrade && side === 'buy' && <p className="mt-1.5 text-caption text-fg-muted" data-testid="first-trade-cap">First trade is capped at 20% of cash.</p>}

          {(type === 'limit' || type === 'stop_limit') && <NumberField className="mt-2" label="Limit" value={limit} onChange={setLimit} suffix="$" testId="order-limit" />}
          {(type === 'stop' || type === 'stop_limit') && <NumberField className="mt-2" label="Stop" value={stop} onChange={setStop} suffix="$" testId="order-stop" />}
          {type === 'trailing' && <NumberField className="mt-2" label="Trail" value={trail} onChange={setTrail} suffix="%" testId="order-trail" />}

          {!simple && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Segmented label="Time in force" size="sm" value={tif} onChange={(v) => setTif(v as 'gtc' | 'day')} options={[{ value: 'gtc', label: 'Good till cancel' }, { value: 'day', label: 'Day' }]} />
              <label className="ml-auto flex items-center gap-2 text-caption text-fg-muted">
                <input type="checkbox" checked={bracket} onChange={(e) => {
                  setBracket(e.target.checked);
                  if (e.target.checked && !tp) {
                    const up = side === 'buy' ? 1 : -1;
                    setTp((est.price * (1 + up * 0.08)).toFixed(2));
                    setSl((est.price * (1 - up * 0.04)).toFixed(2));
                  }
                }} data-testid="bracket-toggle" />
                Bracket
              </label>
            </div>
          )}
          {bracket && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NumberField label="Take profit" value={tp} onChange={setTp} testId="order-tp" />
              <NumberField label="Stop loss" value={sl} onChange={setSl} testId="order-sl" />
            </div>
          )}

          <div className="mt-4 border-t border-ink-2 pt-3">
            <KV k={side === 'buy' ? 'Ask (est.)' : 'Bid (est.)'} v={price(est.price)} />
            <KV k="Notional" v={money(notional)} />
            <KV k={`Fee ${def.assetClass === 'crypto' ? '0.20%' : def.assetClass === 'forex' ? '0.02%' : '0.10%'}`} v={money(fee)} />
            <KV k="Slippage" v={`${est.slippageBps.toFixed(1)} bp`} />
            <KV k={<span className="font-semibold text-fg">Total</span>} v={<span className="font-semibold" data-testid="order-total">{money(total)}</span>} />
            <KV k={margin ? 'Buying power' : 'Cash after'} v={<span className="text-fg-muted">{money(margin ? bp - (side === 'buy' || shorting ? notional : 0) : acct.cash - (side === 'buy' ? total : -total))}</span>} />
            {shorting && <p className="mt-1 text-caption text-warn">Short: you profit if it falls, you pay a borrow fee daily, and losses are unlimited.</p>}
            {margin && side === 'buy' && notional > acct.cash && <p className="mt-1 text-caption text-warn">Uses margin: you borrow at the policy rate + 3%. Below 30% equity you get a margin call; below 20% the broker sells for you.</p>}
          </div>
          {invalid && <p className="mt-2 text-caption text-warn" data-testid="order-invalid">{invalid}</p>}
          {halted && <p className="mt-2 text-caption text-warn">Halted: your order waits for the reopen.</p>}
          <Button variant="brass" size="lg" className="mt-3 w-full" disabled={!canSubmit} onClick={submit} testId="order-submit">{actionLabel}</Button>
          <p className="mt-2 text-center text-caption text-fg-faint" data-testid="honest-note">Prices can fall. That’s the game.</p>
        </>
      )}
    </Card>
  );
}
