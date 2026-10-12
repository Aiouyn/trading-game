'use client';

// Research Desk (Velvet 7, velvet-research-desk.md; R3 Operator). A private room that explains why an asset moved over closed
// days. Unlocked once for a fee, then a weekly upkeep from cash; a lapsed desk keeps its files readable and takes no new
// queries. Every number and sentence in a dossier is the server's; this screen picks a window and lays the answer out.
import { useMemo, useState } from 'react';
import { DESK } from '@/content/learning';
import { rankIndex } from '@/content/lifestyle';
import { money, signedPct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card } from '@/components/ui';
import type { DeskDossier } from '@/world/ledger-types';
import { Dossier } from '@/components/apps/desk/Dossier';

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export function ResearchDesk() {
  const me = useGame((s) => s.me)!;
  const config = useGame((s) => s.config);
  const selected = useGame((s) => s.selected);
  const act = useGame((s) => s.act);
  const desk = me.player.desk ?? null;
  const win = me.trading.desk;
  const atOperator = rankIndex(me.player.rankId) >= rankIndex(DESK.minRank);
  const [dossier, setDossier] = useState<DeskDossier | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);

  const assets = useMemo(
    () => config.assets.filter((a) => a.assetClass === 'stock' && a.listed !== false && !a.delisted),
    [config.assets],
  );

  return (
    <div className="os-body flex flex-col gap-4" data-testid="research">
      <p className="text-small text-fg-muted">{t('research.intro')}</p>

      {!desk && !atOperator && (
        <div className="flex flex-col gap-3">
          <p className="text-small text-fg-muted" data-testid="research-locked">{t('research.locked', { rank: t('rank.R3') })}</p>
          <DeskSample />
        </div>
      )}

      {!desk && atOperator && (
        <Card className="flex flex-col gap-3 p-4" data-testid="desk-unlock">
          <h2 className="font-serif text-title text-fg">{t('desk.unlock.title')}</h2>
          <p className="text-small text-fg-muted">{t('desk.unlock.sub', { cost: money(DESK.unlockCost), upkeep: money(DESK.weeklyUpkeep) })}</p>
          <DeskSample />
          {!confirmUnlock ? (
            <Button variant="brass" size="md" onClick={() => setConfirmUnlock(true)} testId="desk-unlock-run">
              {t('desk.unlock.run', { total: money(DESK.unlockCost + DESK.weeklyUpkeep) })}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-small text-fg-muted">{t('desk.unlock.confirm', { total: money(DESK.unlockCost + DESK.weeklyUpkeep) })}</p>
              <Button variant="brass" size="md" onClick={async () => { await act({ type: 'desk.unlock' }); setConfirmUnlock(false); }} testId="desk-unlock-confirm">
                {t('desk.unlock.run', { total: money(DESK.unlockCost + DESK.weeklyUpkeep) })}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setConfirmUnlock(false)}>{t('common.cancel')}</Button>
            </div>
          )}
        </Card>
      )}

      {desk?.lapsed && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-small text-fg-muted" data-testid="desk-locked">{t('desk.lapsed')}</p>
          <p className="text-small text-fg-faint">{t('desk.locked.files')}</p>
          <Button variant="outline" size="md" onClick={() => void act({ type: 'desk.resume' })} testId="desk-resume">
            {t('desk.resume', { upkeep: money(DESK.weeklyUpkeep) })}
          </Button>
        </Card>
      )}

      {desk && !desk.lapsed && (
        <DeskQuery
          key={`${win.firstDay}-${win.lastClosed ?? 'none'}`}
          assets={assets}
          initialAsset={assets.some((a) => a.id === selected) ? selected : (assets[0]?.id ?? '')}
          firstDay={win.firstDay}
          lastClosed={win.lastClosed}
          today={win.today}
          onResult={setDossier}
        />
      )}

      {dossier && <Dossier d={dossier} upkeepDay={desk?.paidThroughDay} />}

      <section className="flex flex-col gap-2" aria-labelledby="research-files-title">
        <h2 id="research-files-title" className="os-label">{t('research.files')}</h2>
        {win.files.length === 0 ? (
          <p className="text-small text-fg-muted" data-testid="research-files-empty">{t('research.files.hint')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-2 rounded-lg border border-ink-3 bg-ink-1" data-testid="desk-files">
            {win.files.map((f) => (
              <li key={f.no}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left text-small hover:bg-ink-2"
                  aria-label={t('desk.file.open', { no: String(f.no).padStart(4, '0') })}
                  data-testid={`desk-file-${f.no}`}
                  onClick={async () => {
                    const r = await act({ type: 'desk.file', no: f.no }, { silent: true });
                    if (r.ok && r.data) setDossier(r.data as DeskDossier);
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="num text-caption text-fg-faint">{t('desk.file.title', { no: String(f.no).padStart(4, '0') })}</span>
                    <span className="truncate text-fg">{t('desk.file.row', { asset: f.assetId, from: f.from, to: f.to })}</span>
                  </span>
                  <span className={`num shrink-0 ${f.move >= 0 ? 'text-gain' : 'text-loss'}`}>{signedPct(f.move)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-caption text-fg-faint" data-testid="research-note">{t('research.note')}</p>
    </div>
  );
}

/** One sample file on the paywall, so a player sees what the desk writes before paying (UX stage 6, item 11). Fixed text, not game data. */
function DeskSample() {
  const from = 12;
  const to = 14;
  return (
    <figure className="flex flex-col gap-2 rounded-md border border-dashed border-ink-3 p-3" data-testid="desk-sample">
      <figcaption className="label text-fg-faint">{t('desk.sample.label')}</figcaption>
      <p className="font-serif text-body text-fg">{t('desk.header', { asset: 'HLCN', from, to })}</p>
      <p className="text-small text-fg-muted">{t('desk.memo.down', { asset: 'HLCN', pct: '4.2%', from, to })}</p>
      <p className="text-small text-fg-muted">{t('desk.memo.flow.sell', { pool: t('desk.pool.trend') })}</p>
      <p className="text-caption text-fg-faint">{t('desk.sample.note')}</p>
    </figure>
  );
}

/** The query bar: an asset, a window of two closed days, the presets, and the run. Only closed days can be picked. */
function DeskQuery({ assets, initialAsset, firstDay, lastClosed, today, onResult }: {
  assets: { id: string; name: string }[];
  initialAsset: string;
  firstDay: number;
  lastClosed: number | null;
  today: number;
  onResult: (d: DeskDossier) => void;
}) {
  const act = useGame((s) => s.act);
  const [asset, setAsset] = useState(initialAsset);
  const last = lastClosed ?? firstDay;
  const [to, setTo] = useState(last);
  const [from, setFrom] = useState(last);
  const [busy, setBusy] = useState(false);

  if (lastClosed === null) {
    return <p className="text-small text-fg-muted" data-testid="desk-pick">{t('desk.pick')}</p>;
  }

  const setToClamped = (v: number) => {
    const nt = clamp(Math.floor(v), firstDay, last);
    setTo(nt);
    setFrom((f) => clamp(f, firstDay, nt));
  };
  const setFromClamped = (v: number) => setFrom(clamp(Math.floor(v), firstDay, to));
  const preset = (lo: number) => { setFrom(clamp(lo, firstDay, last)); setTo(last); };

  const run = async () => {
    setBusy(true);
    try {
      const r = await act({ type: 'desk.query', assetId: asset, from, to });
      if (r.ok && r.data) onResult(r.data as DeskDossier);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-ink-3 bg-ink-1 p-4" data-testid="desk-query">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-caption text-fg-muted">
          {t('desk.query.asset')}
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="h-9 rounded-md border border-ink-3 bg-ink-0 px-2 text-small text-fg"
            data-testid="desk-query-asset"
          >
            {assets.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-fg-muted">
          {t('desk.query.from')}
          <input
            type="number"
            min={firstDay}
            max={to}
            step={1}
            value={from}
            onChange={(e) => setFromClamped(Number(e.target.value))}
            className="num h-9 rounded-md border border-ink-3 bg-ink-0 px-2 text-small text-fg"
            data-testid="desk-from"
          />
        </label>
        <label className="flex flex-col gap-1 text-caption text-fg-muted">
          {t('desk.query.to')}
          <input
            type="number"
            min={firstDay}
            max={last}
            step={1}
            value={to}
            onChange={(e) => setToClamped(Number(e.target.value))}
            className="num h-9 rounded-md border border-ink-3 bg-ink-0 px-2 text-small text-fg"
            data-testid="desk-to"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="quiet" onClick={() => preset(last)} testId="desk-preset-last">{t('desk.preset.last')}</Button>
        <Button size="sm" variant="quiet" onClick={() => preset(last - 6)} testId="desk-preset-week">{t('desk.preset.week')}</Button>
        <Button size="sm" variant="quiet" onClick={() => preset(last - 62)} testId="desk-preset-quarter">{t('desk.preset.quarter')}</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="num text-caption text-fg-faint" data-testid="desk-session">{t('desk.session', { day: today })}</span>
        <Button variant="brass" size="md" disabled={busy || !asset} onClick={run} testId="desk-run">{t('desk.query.run')}</Button>
      </div>
    </section>
  );
}
