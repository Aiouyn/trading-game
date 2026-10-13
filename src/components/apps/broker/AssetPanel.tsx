'use client';

import { earningsInfo, indexMembers, newsBand, type WorldConfig, type WorldState } from '@/engine';
import { consensusLabel, earningsGrade } from '@/content/news';
import { rankIndex } from '@/content/lifestyle';
import { compactMoney, money, price, signedPct, dec } from '@/game/format';
import { assetDefOf, isIndex, useGame } from '@/game/store';
import { isUntradable } from '@/game/universe';
import { t } from '@/i18n';
import { openApp } from '@/components/os/shellStore';
import { Button, Card, LockGlyph } from '@/components/ui';
import { DepthByPool, ShortInterestRow } from './MarketStructure';

/** The band a report's move has reached (the Wire uses the same four bands). The age counts from the report's open. */
function pricedInBand(config: WorldConfig, world: WorldState, ticker: string, lastDay: number): string {
  const ageTicks = Math.max(0, world.tick - lastDay * config.ticksPerDay);
  return t(`broker.band.${newsBand(config, ticker, 'earnings', ageTicks)}`);
}

/**
 * Everything about the Broker's asset: fundamentals the player may see, the simplified earnings story,
 * the analyst note, the option chain entry, and the market structure (short interest and depth). It never
 * shows a true value. An index card lists its members (indexMembers, as of the last review).
 */
export function AssetPanel({ ticker, onOptions, chainOpen }: { ticker: string; onOptions: () => void; chainOpen: boolean }) {
  const world = useGame((s) => s.world)!;
  const me = useGame((s) => s.me)!;
  const config = useGame((s) => s.config);
  const act = useGame((s) => s.act);
  if (isIndex(ticker)) {
    const idx = config.indices.find((i) => i.id === ticker)!;
    const members = indexMembers(world, idx);
    return (
      <Card className="p-4" data-testid="asset-panel">
        <h3 className="font-serif text-title">{idx.name}</h3>
        <p className="mt-1 text-small text-fg-muted">{t('broker.index.about', { n: members.length })}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" data-testid="index-members">
          {members.map((id) => (
            <li key={id} className="num rounded-chip border border-ink-3 px-2 py-0.5 text-caption text-fg-muted">{id}</li>
          ))}
        </ul>
      </Card>
    );
  }
  const def = assetDefOf(ticker)!;
  const i = config.assets.findIndex((a) => a.id === ticker);
  const a = world.assets[i]!;
  const px = Math.exp(a.lnP);
  const e = earningsInfo(world, ticker);
  const note = me.player.notes[ticker];
  const rIdx = rankIndex(me.player.rankId);
  const cap = def.sharesOutstanding ? def.sharesOutstanding * px : null;
  // a name that no longer trades has no options either: no chain button (held contracts show without a close control)
  const optionsListed = config.options?.underlyings.includes(ticker) && !isUntradable(config, ticker);
  const canOptions = !!me.account?.canOptions;
  const band = e?.last ? pricedInBand(config, world, ticker, e.last.day) : null;
  const untradable = isUntradable(config, ticker);
  return (
    <Card className="p-4" data-testid="asset-panel">
      {untradable && (
        <p className="mb-2 text-small text-loss" data-testid={def.delisted ? 'delisted-note' : 'untradable-note'}>
          {t(def.delisted ? 'broker.delisted.note' : 'broker.notTradable.note')}
        </p>
      )}
      <p className="text-small text-fg-muted">{t(`asset.blurb.${def.id}`)}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-small sm:grid-cols-3">
        {cap && <Mini k={t('broker.fund.cap')} v={compactMoney(cap)} />}
        <Mini k={t('broker.fund.vol')} v={t('broker.perYear', { v: `${Math.round(def.vol * 100)}%` })} />
        {!!def.dividendYield && <Mini k={t('broker.fund.dividend')} v={t('broker.perYear', { v: `${dec(def.dividendYield * 100, 1)}%` })} />}
        {def.duration !== undefined && <Mini k={t('broker.fund.duration')} v={`${dec(def.duration, 1)}×`} />}
        <Mini k={t('broker.fund.spread')} v={t('broker.bp', { v: def.spreadBps ?? 10 })} />
        <Mini k={t('broker.fund.adv')} v={compactMoney(def.advNotional ?? 1e9)} />
      </div>

      {e && (
        <div className="mt-4 rounded-md border border-ink-3 p-3" data-testid="earnings-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="label">{t('broker.earnings')}</div>
            {band && <span className="rounded-chip border border-brass/50 px-2 py-0.5 text-micro text-brass" data-testid="priced-in" title={t('broker.pricedIn.hint')}>{t('broker.pricedIn', { band })}</span>}
          </div>
          {e.daysAway >= 0 && (
            <p className="mt-1 text-small text-fg">
              {t('broker.nextReport', {
                when: e.daysAway === 0 ? t('broker.when.todayOpen') : e.daysAway === 1 ? t('broker.when.tomorrowOpen') : t('broker.when.inGameDays', { n: e.daysAway }),
              })}
              {e.consensus !== null && (() => {
                const c = consensusLabel(e.consensus);
                const lean = c.lean === 'Split' ? t('broker.lean.split') : `${c.lean === 'Beat' ? t('broker.lean.beat') : t('broker.lean.miss')} ${'★'.repeat(c.stars)}`;
                return <> {t('broker.analysts')} <span className={c.lean === 'Beat' ? 'text-gain' : c.lean === 'Miss' ? 'text-loss' : 'text-fg-muted'}>{lean}</span>.</>;
              })()}
              {e.rumor !== null && (
                <> <span className="text-warn">{t('broker.whisper', { dir: e.rumor > 0 ? t('broker.lean.beat') : t('broker.lean.miss') })}</span> {t('broker.whisperNote')}</>
              )}
            </p>
          )}
          {e.last && (() => {
            const grade = earningsGrade(e.last.surprise);
            return (
              <p className="mt-1 text-small text-fg-muted">
                {t('broker.lastReport.label')}{' '}
                <span className={e.last.move >= 0 ? 'text-gain' : 'text-loss'}>
                  {t('broker.lastReport.grade', { grade, verdict: t(`broker.verdict.${grade}`) })}
                </span>
                {t('broker.lastReport.move', { move: signedPct(e.last.move) })}
              </p>
            );
          })()}
          <p className="mt-1 text-caption text-fg-faint">{t('broker.earnings.explain')}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {def.assetClass !== 'forex' && def.assetClass !== 'bond' && (
          rIdx >= 1 ? (
            <Button size="sm" onClick={() => act({ type: 'note.buy', assetId: ticker }, { success: t('broker.noteDelivered', { ticker }) })} testId="buy-note">
              {t('broker.buyNote', { cost: money(me.noteCost) })}
            </Button>
          ) : <span className="text-caption text-fg-faint">{t('broker.notesLocked')}</span>
        )}
        {optionsListed && (canOptions
          ? <Button size="sm" onClick={onOptions} testId="open-chain">{chainOpen ? t('broker.chain.hide') : t('broker.optionChain')}</Button>
          : <span className="flex items-center gap-1 text-caption text-fg-faint"><LockGlyph size={14} /> {t('broker.optionsLocked')}</span>)}
        <Button size="sm" onClick={() => openApp('broker', { ticker }, { fresh: true, focus: true })} testId="broker-new-window">{t('broker.newWindow')}</Button>
      </div>
      {note && (
        <div className="mt-3 rounded-md border border-brass/40 bg-brass/[0.05] p-3" data-testid="note">
          <div className="flex items-center justify-between">
            <span className="label text-brass">{note.desk}</span>
            <span className="num text-caption text-fg-faint">{t('broker.noteAge', { days: Math.max(0, Math.round((world.tick - note.tick) / world.config.ticksPerDay)) })}</span>
          </div>
          <p className="mt-1 text-small text-fg">
            <span className={note.rating.includes('buy') ? 'text-gain' : note.rating.includes('ell') ? 'text-loss' : 'text-fg-muted'}>{note.rating}</span>.{' '}
            {t('broker.note.fair', {
              fv: price(note.fairValue), band: Math.round(note.band * 100), diff: signedPct(note.fairValue / px - 1),
            })}
          </p>
          <p className="mt-1 text-caption text-fg-faint">{t('broker.note.explain')}</p>
        </div>
      )}

      <div className="mt-4 border-t border-ink-2 pt-3" data-testid="market-structure">
        <div className="label">{t('broker.structure')}</div>
        <div className="mt-1.5 flex flex-col gap-2">
          <ShortInterestRow ticker={ticker} />
          <DepthByPool ticker={ticker} />
        </div>
      </div>
    </Card>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2 py-0.5"><span className="text-fg-faint">{k}</span><span className="num text-fg-muted">{v}</span></div>;
}

