'use client';

// Create (lead-launchpad.md L2, L5, L6; R-10-6 as Phase 10): the launch form, then the creator console for the viewer's own tokens (the
// vesting schedule, the creator fees, the buzz items with their cost and the daily cap, the rug status, and cancel while it is allowed).
// The form picks one of the generated images (no uploads), takes a name, a ticker and a description of up to 140 characters, and
// checks each as the viewer types. The launch fee is $100. The world checks everything again at launch and refuses in three parts.
import { useState } from 'react';
import { money, pct } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { Button, Card, Empty, NumberField, TextField } from '@/components/ui';
import { LP } from '@/world/launchpad/constants';
import { iconSvg } from '@/world/launchpad/icon';
import { moderateText } from '@/world/launchpad/moderate';
import type { LaunchpadView } from '@/world/launchpad/view';
import { TAGLINES, allocationFromPct, centsFromDollars, clientCheck, descRefusalCode, refusalCopy, refusalOf, taglineKey, tokens as fmtTokens, type RefusalCopy } from './copy';
import { BuzzButtons } from './Buzz';
import { Fact, FlagChip, RefusalBox, Section, StatusChip, TokenIcon } from './Shared';

export function CreateTab({ lp, takenNames, onOpen }: {
  lp: LaunchpadView;
  takenNames: ReadonlySet<string>;
  onOpen: (ticker: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="lp-create">
      <LaunchForm lp={lp} takenNames={takenNames} onOpen={onOpen} />
      <CreatorConsole lp={lp} onOpen={onOpen} />
    </div>
  );
}

function LaunchForm({ lp, takenNames, onOpen }: { lp: LaunchpadView; takenNames: ReadonlySet<string>; onOpen: (ticker: string) => void }) {
  const act = useGame((s) => s.act);
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [tagline, setTagline] = useState<string>(TAGLINES[0]);
  const [art, setArt] = useState(0);
  const [desc, setDesc] = useState('');
  const [alloc, setAlloc] = useState('0');
  const [dev, setDev] = useState('');
  const [sent, setSent] = useState<{ name: string; ticker: string } | null>(null);
  const [refusal, setRefusal] = useState<RefusalCopy | null>(null);

  const allocTokens = allocationFromPct(alloc);
  const allocOk = allocTokens !== null && Number.isInteger(allocTokens) && allocTokens >= 0 && allocTokens <= LP.ALLOC_MAX;
  const devText = dev.trim();
  const devCents = devText === '' ? 0 : centsFromDollars(devText);
  const devOk = devText === '' || devCents !== null;
  const nameOk = name.trim().length >= LP.NAME_MIN && name.trim().length <= LP.NAME_MAX;
  const tickerOk = /^[A-Z]{3,5}$/.test(ticker);
  const check = clientCheck(name.trim(), ticker, takenNames);
  // the description is optional; when it is written, the same filter the world runs checks it here, before it is sent
  const descMod = desc.trim() === '' ? null : moderateText(desc, LP.DESC_MAX);
  const descCheck = descMod && !descMod.ok ? refusalCopy(descRefusalCode(descMod.reason), { max: LP.DESC_MAX }) : null;
  const gate = lp.gate ? refusalOf(lp.gateData, lp.gate) : null;
  const canSubmit = gate === null && nameOk && tickerOk && check === null && allocOk && devOk && descCheck === null;
  const total = LP.LAUNCH_FEE + (devCents ?? 0) / 100;

  const submit = async () => {
    setSent(null);
    setRefusal(null);
    const input = {
      type: 'lp.launch' as const, name: name.trim(), ticker, tagline, allocation: allocTokens ?? 0, art,
      ...(desc.trim() !== '' ? { description: desc.trim() } : {}),
      ...(devCents ? { devBuyCents: devCents } : {}),
    };
    const r = await act(input, { silent: true });
    if (r.ok) {
      setSent({ name: name.trim(), ticker });
      setName('');
      setTicker('');
      setDesc('');
      setArt(0);
      setAlloc('0');
      setDev('');
    } else setRefusal(refusalOf(r.data, r.error ? undefined : 'unknown'));
  };

  return (
    <Card className="flex flex-col gap-4 p-4" >
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-title text-fg">{t('lp.create.title')}</h2>
        <p className="text-small text-fg-muted">{t('lp.create.intro')}</p>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-start gap-4">
        {tickerOk ? (
          <TokenIcon svg={iconSvg(ticker, art)} size={72} />
        ) : (
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-md border border-dashed border-ink-3 text-center text-micro text-fg-faint" data-testid="lp-icon-empty">
            {t('lp.create.iconEmpty')}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <TextField value={name} onChange={setName} placeholder={t('lp.create.name')} label={t('lp.create.name')} maxLength={LP.NAME_MAX} testId="lp-name" />
          <p className="text-caption text-fg-faint">{t('lp.create.nameHint', { min: LP.NAME_MIN, max: LP.NAME_MAX })}</p>
          <TextField
            value={ticker}
            onChange={(v) => setTicker(v.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder={t('lp.create.ticker')}
            label={t('lp.create.ticker')}
            maxLength={LP.TICKER_MAX}
            testId="lp-ticker"
            className="num w-40"
          />
          <p className="text-caption text-fg-faint">{t('lp.create.tickerHint', { min: LP.TICKER_MIN, max: LP.TICKER_MAX })}</p>
        </div>
      </div>

      {check && <RefusalBox copy={refusalCopy(check, { name: name.trim(), ticker })} testId="lp-check" />}
      {!check && name.trim() && tickerOk && <p className="text-caption text-gain" data-testid="lp-check-ok">{t('lp.create.checkOk')}</p>}

      <div className="flex flex-col gap-2" data-testid="lp-art">
        <span className="label">{t('lp.create.art')}</span>
        <div role="group" aria-label={t('lp.create.art')} className="grid grid-cols-4 gap-2">
          {Array.from({ length: LP.ART_VARIANTS }, (_, k) => (
            <button
              key={k}
              type="button"
              aria-pressed={art === k}
              data-testid={`lp-art-${k}`}
              onClick={() => setArt(k)}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 ${art === k ? 'border-brass/60 bg-brass/10' : 'border-ink-3 hover:border-brass/40'}`}
            >
              <TokenIcon svg={iconSvg(tickerOk ? ticker : 'LIVE', k)} size={48} />
              <span className="text-micro text-fg-faint">{t('lp.create.artN', { n: k + 1 })}</span>
            </button>
          ))}
        </div>
        <p className="text-caption text-fg-faint">{t('lp.create.artHint')}</p>
      </div>

      <div className="flex flex-col gap-1">
        <TextField value={desc} onChange={setDesc} placeholder={t('lp.create.desc')} label={t('lp.create.desc')} maxLength={LP.DESC_MAX} testId="lp-desc" />
        <p className="text-caption text-fg-faint" data-testid="lp-desc-count">{t('lp.create.descCount', { n: [...desc].length, max: LP.DESC_MAX })}</p>
        {descCheck && <RefusalBox copy={descCheck} testId="lp-desc-refusal" />}
      </div>

      <div className="flex flex-col gap-2">
        <span className="label">{t('lp.create.tagline')}</span>
        <div role="group" aria-label={t('lp.create.tagline')} className="grid grid-cols-1 gap-2 @md:grid-cols-2">
          {TAGLINES.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tagline === id}
              data-testid={`lp-tagline-${id}`}
              onClick={() => setTagline(id)}
              className={`rounded-md border px-3 py-2 text-left text-small ${tagline === id ? 'border-brass/60 bg-brass/10 text-fg' : 'border-ink-3 text-fg-muted hover:text-fg'}`}
            >
              {t(taglineKey(id))}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <NumberField value={alloc} onChange={setAlloc} label={t('lp.create.alloc')} suffix="%" min={0} step={0.1} testId="lp-alloc" />
          <p className="text-caption text-fg-faint" data-testid="lp-alloc-tokens">
            {allocOk ? t('lp.create.allocTokens', { tokens: fmtTokens(allocTokens ?? 0) }) : t('lp.create.allocRange', { max: pct(LP.ALLOC_MAX / LP.SUPPLY) })}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <NumberField value={dev} onChange={setDev} label={t('lp.create.devBuy')} suffix="$" min={0} step={1} testId="lp-devbuy" placeholder="0" />
          <p className="text-caption text-fg-faint">{t('lp.create.devBuyHint')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-ink-2 p-3 @md:grid-cols-4">
        <Fact label={t('lp.create.fee')} value={money(LP.LAUNCH_FEE)} testId="lp-fee" />
        <Fact label={t('lp.create.total')} value={money(total)} testId="lp-total" />
        <Fact label={t('lp.create.live')} value={`${lp.live.count} / ${lp.live.max}`} testId="lp-live" />
        <Fact label={t('lp.create.cap')} value={pct(LP.CREATOR_CAP / LP.SUPPLY)} />
      </div>
      <p className="text-caption text-fg-faint">{t('lp.create.limits', { hours: 24, max: LP.MAX_LIVE })}</p>

      {gate && <RefusalBox copy={gate} testId="lp-gate" />}
      {refusal && <RefusalBox copy={refusal} testId="lp-launch-refusal" />}
      {sent && (
        <div role="status" className="flex flex-wrap items-center gap-3 text-small text-gain" data-testid="lp-launch-sent">
          <span>{t('lp.create.sent', { name: sent.name, ticker: sent.ticker })}</span>
          <Button size="sm" variant="outline" testId="lp-launch-open" onClick={() => onOpen(sent.ticker)}>{t('lp.create.openPage')}</Button>
        </div>
      )}

      <div>
        <Button variant="brass" disabled={!canSubmit} testId="lp-launch" onClick={submit}>
          {t('lp.create.submit', { fee: money(LP.LAUNCH_FEE) })}
        </Button>
      </div>
    </Card>
  );
}

function CreatorConsole({ lp, onOpen }: { lp: LaunchpadView; onOpen: (ticker: string) => void }) {
  const act = useGame((s) => s.act);
  const [cancelled, setCancelled] = useState<Record<string, RefusalCopy | null>>({});
  const [done, setDone] = useState<string | null>(null);
  const cancel = async (ticker: string) => {
    setDone(null);
    setCancelled((c) => ({ ...c, [ticker]: null }));
    const r = await act({ type: 'lp.cancel', ticker }, { silent: true });
    if (r.ok) setDone(t('lp.console.cancelled', { ticker }));
    else setCancelled((c) => ({ ...c, [ticker]: refusalOf(r.data, r.error ? undefined : 'unknown') }));
  };
  return (
    <Section title={t('lp.console.title')} testId="lp-console">
      {lp.console.length === 0 ? (
        <Empty title={t('lp.console.empty')} />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="lp-console-rows">
          {lp.console.map((c) => {
            return (
              <li key={c.ticker} className="flex flex-col gap-3 rounded-md border border-ink-2 p-3" data-testid={`lp-console-${c.ticker}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <TokenIcon svg={iconSvg(c.ticker, c.art)} size={36} />
                  <span className="break-words font-medium text-fg">{c.name}</span>
                  <span className="num text-caption text-brass">{c.ticker}</span>
                  <StatusChip status={c.status} />
                  {c.flag && <FlagChip reason={c.flag.reason} />}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 @md:grid-cols-4">
                  <Fact label={t('lp.console.fees')} value={money(c.fees)} testId={`lp-console-fees-${c.ticker}`} />
                  <Fact label={t('lp.console.alloc')} value={fmtTokens(c.allocation)} />
                  <Fact label={t('lp.console.unlocked')} value={c.status === 'graduated' ? fmtTokens(c.unlocked) : t('lp.vest.afterGrad')} testId={`lp-console-unlocked-${c.ticker}`} />
                  <Fact label={t('lp.console.cap')} value={`${pct(c.capUsed / LP.SUPPLY)} / ${pct(c.capMax / LP.SUPPLY)}`} />
                </div>
                <p className="text-caption text-fg-muted">
                  {c.flag ? t('lp.console.flagged', { reason: t(`lp.reason.${c.flag.reason}`) }) : t('lp.console.noFlag')}
                </p>
                <BuzzButtons ticker={c.ticker} promosToday={c.promos} testPrefix={`lp-console-buzz`} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" testId={`lp-console-open-${c.ticker}`} onClick={() => onOpen(c.ticker)}>{t('lp.console.open')}</Button>
                  {c.cancellable && (
                    <Button size="sm" variant="danger" testId={`lp-cancel-${c.ticker}`} onClick={() => cancel(c.ticker)}>{t('lp.console.cancel')}</Button>
                  )}
                  {c.cancellable && <span className="text-caption text-fg-faint">{t('lp.console.cancelNote')}</span>}
                </div>
                {cancelled[c.ticker] && <RefusalBox copy={cancelled[c.ticker]!} testId={`lp-cancel-refusal-${c.ticker}`} />}
              </li>
            );
          })}
        </ul>
      )}
      {done && <p role="status" className="text-small text-gain" data-testid="lp-cancelled">{done}</p>}
    </Section>
  );
}
