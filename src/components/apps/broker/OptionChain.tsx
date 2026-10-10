'use client';

import { useState } from 'react';
import { listedExpiries, optionChain } from '@/engine';
import { money, price } from '@/game/format';
import { useGame } from '@/game/store';
import { isDelisted } from '@/game/universe';
import { t } from '@/i18n';
import { Button, NumberField, Segmented, Td, Th } from '@/components/ui';

const prem = (v: number) => v.toFixed(2);

/**
 * The option chain (Derivatives license), shown inline in the Broker. Buy calls if you think the price goes
 * up, puts if it goes down; the most you can lose is what you paid. Contracts are 100 units and settle in cash
 * at the close of their expiry day. Inline, not a modal: a modal would be clipped by its window.
 */
export function OptionChain({ underlying }: { underlying: string }) {
  const world = useGame((s) => s.world)!;
  const config = useGame((s) => s.config);
  const act = useGame((s) => s.act);
  const exps = listedExpiries(world);
  const [exp, setExp] = useState(exps[0] ?? 0);
  const [n, setN] = useState('1');
  if (isDelisted(config, underlying)) {
    return <p className="text-small text-loss" data-testid="chain-delisted">{t('broker.chain.delisted', { ticker: underlying })}</p>;
  }
  const chain = optionChain(world, underlying, exp);
  const i = world.config.assets.findIndex((a) => a.id === underlying);
  const spot = Math.exp(world.assets[i]!.lnP);
  const contracts = Math.max(1, Math.floor(Number(n) || 1));
  const buy = (id: string, label: string) => act({ type: 'option.trade', contractId: id, side: 'buy', qty: contracts }, { success: t('broker.chain.bought', { n: contracts, label }) });
  const today = Math.ceil(world.tick / 720);
  return (
    <div data-testid="option-chain">
      <p className="text-small text-fg-muted">{t('broker.chain.intro', { ticker: underlying })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Segmented
          label={t('broker.chain.expiry')} size="sm" value={String(exp)} onChange={(v) => setExp(Number(v))}
          options={exps.map((e) => ({ value: String(e), label: t('broker.chain.expiryDay', { day: e + 1, d: Math.max(0, e + 1 - today) }) }))}
        />
        <NumberField label={t('broker.chain.contracts')} value={n} onChange={setN} className="w-44" step={1} />
        <span className="num ml-auto text-small text-fg-muted">{t('broker.chain.spot', { p: price(spot) })}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr>
              <Th right>{t('broker.chain.callBid')}</Th><Th right>{t('broker.chain.callAsk')}</Th><Th right>{t('broker.chain.delta')}</Th><Th />
              <Th right>{t('broker.chain.strike')}</Th><Th />
              <Th right>{t('broker.chain.putBid')}</Th><Th right>{t('broker.chain.putAsk')}</Th><Th right>{t('broker.chain.delta')}</Th><Th />
            </tr>
          </thead>
          <tbody>
            {chain.map((r) => {
              const itmCall = r.strike < spot;
              return (
                <tr key={r.strike} className="border-t border-ink-2">
                  <Td right num className={itmCall ? 'bg-ink-2' : ''}>{prem(r.call.bid)}</Td>
                  <Td right num className={itmCall ? 'bg-ink-2' : ''}>{prem(r.call.ask)}</Td>
                  <Td right num className="text-fg-faint">{r.call.delta.toFixed(2)}</Td>
                  <Td>
                    <Button size="sm" onClick={() => buy(r.call.id, `${underlying} ${r.strike} ${t('broker.chain.callsWord')}`)} testId={`buy-call-${r.strike}`}>
                      {t('broker.chain.callBtn', { cost: money(r.call.ask * 100 * contracts) })}
                    </Button>
                  </Td>
                  <Td right num className="font-semibold text-fg">{price(r.strike)}</Td>
                  <Td />
                  <Td right num className={!itmCall ? 'bg-ink-2' : ''}>{prem(r.put.bid)}</Td>
                  <Td right num className={!itmCall ? 'bg-ink-2' : ''}>{prem(r.put.ask)}</Td>
                  <Td right num className="text-fg-faint">{r.put.delta.toFixed(2)}</Td>
                  <Td>
                    <Button size="sm" onClick={() => buy(r.put.id, `${underlying} ${r.strike} ${t('broker.chain.putsWord')}`)} testId={`buy-put-${r.strike}`}>
                      {t('broker.chain.putBtn', { cost: money(r.put.ask * 100 * contracts) })}
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-caption text-fg-faint">{t('broker.chain.note')}</p>
    </div>
  );
}
