'use client';

import { useState } from 'react';
import { listedExpiries, optionChain } from '@/engine';
import { money, price } from '@/game/format';

import { useGame } from '@/game/store';
import { isDelisted } from '@/game/universe';
import { Button, NumberField, Segmented, Td, Th } from './ui';

const prem = (v: number) => v.toFixed(2);

/**
 * The option chain (Derivatives license). Buy calls if you think the price goes up, puts if it
 * goes down; the most you can lose is what you paid. Contracts are 100 units and settle in cash
 * at the close of their expiry day.
 */
export function OptionChain({ underlying }: { underlying: string }) {
  const world = useGame((s) => s.world)!;
  const config = useGame((s) => s.config);
  const act = useGame((s) => s.act);
  const exps = listedExpiries(world);
  const [exp, setExp] = useState(exps[0] ?? 0);
  const [n, setN] = useState('1');
  if (isDelisted(config, underlying)) {
    return <p className="text-small text-loss" data-testid="chain-delisted">{underlying} is delisted: its options no longer trade.</p>;
  }
  const chain = optionChain(world, underlying, exp);
  const i = world.config.assets.findIndex((a) => a.id === underlying);
  const spot = Math.exp(world.assets[i]!.lnP);
  const contracts = Math.max(1, Math.floor(Number(n) || 1));
  const buy = (id: string, label: string) => act({ type: 'option.trade', contractId: id, side: 'buy', qty: contracts }, { success: `Bought ${contracts} ${label}` });
  return (
    <div data-testid="option-chain">
      <p className="text-small text-fg-muted">
        A <b className="text-fg">call</b> pays if {underlying} ends above the strike; a <b className="text-fg">put</b> pays if it ends below. One contract covers 100 units. The most you can lose is the premium.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Segmented label="Expiry" size="sm" value={String(exp)} onChange={(v) => setExp(Number(v))}
          options={exps.map((e) => ({ value: String(e), label: `Day ${e + 1} (${Math.max(0, e + 1 - Math.ceil(world.tick / 720))}d)` }))} />
        <NumberField label="Contracts" value={n} onChange={setN} className="w-44" step={1} />
        <span className="num ml-auto text-small text-fg-muted">Spot {price(spot)}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr><Th right>Call bid</Th><Th right>Call ask</Th><Th right>Δ</Th><Th /><Th right>Strike</Th><Th /><Th right>Put bid</Th><Th right>Put ask</Th><Th right>Δ</Th><Th /></tr>
          </thead>
          <tbody>
            {chain.map((r) => {
              const itmCall = r.strike < spot;
              return (
                <tr key={r.strike} className="border-t border-ink-2">
                  <Td right num className={itmCall ? 'bg-ink-2' : ''}>{prem(r.call.bid)}</Td>
                  <Td right num className={itmCall ? 'bg-ink-2' : ''}>{prem(r.call.ask)}</Td>
                  <Td right num className="text-fg-faint">{r.call.delta.toFixed(2)}</Td>
                  <Td><Button size="sm" onClick={() => buy(r.call.id, `${underlying} ${r.strike} calls`)} testId={`buy-call-${r.strike}`}>Call {money(r.call.ask * 100 * contracts)}</Button></Td>
                  <Td right num className="font-semibold text-fg">{price(r.strike)}</Td>
                  <Td />
                  <Td right num className={!itmCall ? 'bg-ink-2' : ''}>{prem(r.put.bid)}</Td>
                  <Td right num className={!itmCall ? 'bg-ink-2' : ''}>{prem(r.put.ask)}</Td>
                  <Td right num className="text-fg-faint">{r.put.delta.toFixed(2)}</Td>
                  <Td><Button size="sm" onClick={() => buy(r.put.id, `${underlying} ${r.strike} puts`)} testId={`buy-put-${r.strike}`}>Put {money(r.put.ask * 100 * contracts)}</Button></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-caption text-fg-faint">Prices come from the option model on live volatility; they rise when markets get jumpy and melt as expiry nears. Shaded rows are in the money.</p>
    </div>
  );
}
