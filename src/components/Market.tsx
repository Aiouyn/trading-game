'use client';

import { useMemo, useState } from 'react';
import { earningsInfo, indexLevel, optionQuote, parseContract, portfolio, sectorName, REGIONS, type AssetClass, type WorldState } from '@/engine';
import { consensusLabel, earningsGrade, gradeVerdict } from '@/content/news';
import { licenseFor, LICENSES, rankIndex } from '@/content/lifestyle';
import { dayOpen, RANGES, sparkline, type RangeId } from '@/game/history';
import { INDICATORS } from '@/game/indicators';
import { compactMoney, money, pct, price, qty, signedChange, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { CONFIG, INDEX_IDS, assetDefOf, isIndex, useGame } from '@/game/store';
import { PriceChart } from './PriceChart';
import { OptionChain } from './Options';
import { Button, Card, CardHeader, Chip, ConfirmButton, Flash, LockGlyph, Modal, Segmented, Sparkline, Td, Th, TextField } from './ui';

export interface SeriesInfo {
  id: string; name: string; sector: string; cls: AssetClass | 'index'; tradable: boolean; locked: boolean;
  price: number; change: number; changePct: number; halted: boolean; blurb: string; region?: string;
}

export function seriesInfo(world: WorldState, id: string, rankId: string): SeriesInfo {
  const h = useGame.getState().history;
  if (isIndex(id)) {
    const p = indexLevel(world, id);
    const o = dayOpen(h, id) ?? p;
    const idx = CONFIG.indices.find((i) => i.id === id)!;
    return { id, name: idx.name, sector: 'index', cls: 'index', tradable: false, locked: false, price: p, change: p - o, changePct: o ? p / o - 1 : 0, halted: false, blurb: `${idx.members.length} members, weighted by market value.` };
  }
  const i = CONFIG.assets.findIndex((a) => a.id === id);
  const def = CONFIG.assets[i]!;
  const a = world.assets[i]!;
  const p = Math.exp(a.lnP);
  const o = Math.exp(a.lnOpen);
  const lic = licenseFor(rankId);
  return {
    id, name: def.name, sector: def.sector, cls: def.assetClass, tradable: def.listed !== false, locked: !lic.classes.includes(def.assetClass),
    price: p, change: p - o, changePct: p / o - 1, halted: a.haltUntil !== -1 && a.haltUntil > world.tick, blurb: def.blurb ?? '', region: def.region,
  };
}

const RANGE_OPTS = RANGES.map((r) => ({ value: r, label: r, testId: `range-${r}` }));

export function ChartCard({ phone = false }: { phone?: boolean }) {
  const world = useGame((s) => s.world)!;
  useGame((s) => s.historyRev);
  const rankId = useGame((s) => s.me?.player.rankId ?? 'R0');
  const selected = useGame((s) => s.selected);
  const range = useGame((s) => s.range);
  const setRange = useGame((s) => s.setRange);
  const mode = useGame((s) => s.chartMode);
  const setMode = useGame((s) => s.setChartMode);
  const indicators = useGame((s) => s.indicators);
  const toggle = useGame((s) => s.toggleIndicator);
  const info = seriesInfo(world, selected, rankId);
  const day = useGame.getState().history.series[selected]?.daily.at(-1);
  const t = toneText[tone(info.change)];
  const ranges = phone ? RANGE_OPTS.filter((r) => r.value !== '1Q') : RANGE_OPTS;
  const region = REGIONS.find((r) => r.id === info.region);
  return (
    <Card className="flex flex-col p-4" data-testid="chart-card">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-body font-semibold text-fg" data-testid="chart-ticker">{info.id}</span>
            <span className="truncate text-small text-fg-muted">{info.name}</span>
            <Chip>{info.cls === 'index' ? 'Index' : sectorName(info.sector)}</Chip>
            {region && <Chip title={region.name}>{region.flag}</Chip>}
            {info.halted && <Chip className="border-warn/60 text-warn">Halted</Chip>}
            {info.locked && <Chip className="border-steel/60 text-steel"><LockGlyph size={12} /> Pro license</Chip>}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <Flash value={info.price} className="num text-price text-fg"><span data-testid="chart-price">{price(info.price)}</span></Flash>
            <span className={`num text-small ${t}`}>{signedChange(info.change, info.price)} ({signedPct(info.changePct)})</span>
            <span className="text-caption text-fg-faint">today</span>
          </div>
          {day && !phone && (
            <div className="num mt-1 flex flex-wrap gap-4 text-caption text-fg-faint">
              <span>O <span className="text-fg-muted">{price(day.open)}</span></span>
              <span>H <span className="text-fg-muted">{price(day.high)}</span></span>
              <span>L <span className="text-fg-muted">{price(day.low)}</span></span>
              {day.volume !== undefined && <span>Vol <span className="text-fg-muted">{compactNum(day.volume)}</span></span>}
              <EarningsBadge assetId={info.id} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Chart range" size="sm" options={ranges} value={range} onChange={(v) => setRange(v as RangeId)} />
          <Segmented label="Chart style" size="sm" options={[{ value: 'candles', label: 'Candles' }, { value: 'line', label: 'Line' }]} value={mode} onChange={(v) => setMode(v as 'candles' | 'line')} />
        </div>
      </div>
      {!phone && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Indicators">
          {INDICATORS.map((ind) => (
            <button key={ind.id} type="button" title={ind.hint} onClick={() => toggle(ind.id)} aria-pressed={!!indicators[ind.id]}
              className={`rounded-chip border px-2 py-0.5 text-micro ${indicators[ind.id] ? 'border-brass/60 bg-brass/10 text-brass-hi' : 'border-ink-3 text-fg-faint hover:text-fg-muted'}`} data-testid={`ind-${ind.id}`}>
              {ind.label}
            </button>
          ))}
        </div>
      )}
      <div className={`mt-3 ${phone ? 'h-56' : 'h-[min(46vh,420px)] min-h-64'}`}>
        <PriceChart assetId={info.id} />
      </div>
    </Card>
  );
}

function compactNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(n < 10 ? 2 : 0);
}

export function EarningsBadge({ assetId }: { assetId: string }) {
  const world = useGame((s) => s.world);
  if (!world || isIndex(assetId)) return null;
  const e = earningsInfo(world, assetId);
  if (!e || e.daysAway < 0 || e.daysAway > 10) return null;
  return <span className="text-brass">◆ Earnings {e.daysAway === 0 ? 'today' : e.daysAway === 1 ? 'tomorrow' : `in ${e.daysAway} days`}</span>;
}

/** Everything about the selected asset: fundamentals, simplified earnings, analyst note, options. */
export function AssetPanel() {
  const world = useGame((s) => s.world)!;
  const me = useGame((s) => s.me)!;
  const selected = useGame((s) => s.selected);
  const act = useGame((s) => s.act);
  const [chain, setChain] = useState(false);
  if (isIndex(selected)) {
    const idx = CONFIG.indices.find((i) => i.id === selected)!;
    return (
      <Card className="p-4" data-testid="asset-panel">
        <h3 className="font-serif text-title">{idx.name}</h3>
        <p className="mt-1 text-small text-fg-muted">An index of {idx.members.length} names, weighted by market value. Indices can’t be traded directly; buy the members or a bond fund.</p>
      </Card>
    );
  }
  const def = assetDefOf(selected)!;
  const i = CONFIG.assets.findIndex((a) => a.id === selected);
  const a = world.assets[i]!;
  const px = Math.exp(a.lnP);
  const e = earningsInfo(world, selected);
  const note = me.player.notes[selected];
  const rIdx = rankIndex(me.player.rankId);
  const cap = def.sharesOutstanding ? def.sharesOutstanding * px : null;
  const optionsListed = CONFIG.options?.underlyings.includes(selected);
  const canOptions = !!me.account?.canOptions;
  return (
    <Card className="p-4" data-testid="asset-panel">
      <p className="text-small text-fg-muted">{def.blurb}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-small sm:grid-cols-3">
        {cap && <Mini k="Market value" v={compactMoney(cap)} />}
        <Mini k="Volatility" v={`${Math.round(def.vol * 100)}% / yr`} />
        {!!def.dividendYield && <Mini k="Dividend" v={`${(def.dividendYield * 100).toFixed(1)}% / yr`} />}
        {def.duration !== undefined && <Mini k="Rate sensitivity" v={`${def.duration.toFixed(1)}×`} />}
        <Mini k="Spread" v={`${def.spreadBps ?? 10} bp`} />
        <Mini k="Daily volume" v={compactMoney(def.advNotional ?? 1e9)} />
      </div>

      {e && (
        <div className="mt-4 rounded-md border border-ink-3 p-3" data-testid="earnings-card">
          <div className="label">Earnings</div>
          {e.daysAway >= 0 && (
            <p className="mt-1 text-small text-fg">
              Next report {e.daysAway === 0 ? 'before today’s open' : e.daysAway === 1 ? 'tomorrow, before the open' : `in ${e.daysAway} game days`}.
              {e.consensus !== null && (() => {
                const c = consensusLabel(e.consensus);
                return <> Analysts: <span className={c.lean === 'Beat' ? 'text-gain' : c.lean === 'Miss' ? 'text-loss' : 'text-fg-muted'}>{c.lean === 'Split' ? 'split' : `${c.lean.toLowerCase()} ${'★'.repeat(c.stars)}`}</span>.</>;
              })()}
              {e.rumor !== null && <> <span className="text-warn">Whisper: {e.rumor > 0 ? 'beat' : 'miss'}</span> (whispers are right about 7 times in 10).</>}
            </p>
          )}
          {e.last && (
            <p className="mt-1 text-small text-fg-muted">
              Last report: <span className={e.last.move >= 0 ? 'text-gain' : 'text-loss'}>grade {earningsGrade(e.last.surprise)} · {gradeVerdict(earningsGrade(e.last.surprise))}</span>, shares {signedPct(e.last.move)} that day.
            </p>
          )}
          <p className="mt-1 text-caption text-fg-faint">Reports move the stock by the size of the surprise. After a big report, the move tends to keep drifting for a few days.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {def.assetClass !== 'forex' && def.assetClass !== 'bond' && (
          rIdx >= 1 ? (
            <Button size="sm" onClick={() => act({ type: 'note.buy', assetId: selected }, { success: `Analyst note on ${selected} delivered` })} testId="buy-note">
              Analyst note · {money(me.noteCost)}
            </Button>
          ) : <span className="text-caption text-fg-faint">Analyst notes unlock at Hustler.</span>
        )}
        {optionsListed && (canOptions
          ? <Button size="sm" onClick={() => setChain(true)} testId="open-chain">Option chain</Button>
          : <span className="flex items-center gap-1 text-caption text-fg-faint"><LockGlyph size={14} /> Options: Derivatives license (Operator, $5M)</span>)}
      </div>
      {note && (
        <div className="mt-3 rounded-md border border-brass/40 bg-brass/[0.05] p-3" data-testid="note">
          <div className="flex items-center justify-between">
            <span className="label text-brass">{note.desk}</span>
            <span className="num text-caption text-fg-faint">{Math.max(0, Math.round((world.tick - note.tick) / 720))} days old</span>
          </div>
          <p className="mt-1 text-small text-fg">
            <span className={note.rating.includes('buy') ? 'text-gain' : note.rating.includes('ell') ? 'text-loss' : 'text-fg-muted'}>{note.rating}</span>.
            Fair value <span className="num">{price(note.fairValue)}</span> ± {Math.round(note.band * 100)}%, {signedPct(note.fairValue / px - 1)} from here.
          </p>
          <p className="mt-1 text-caption text-fg-faint">Prices drift back toward fair value over weeks, not minutes. Notes age; buy a fresh one after big news.</p>
        </div>
      )}
      <Modal open={chain} onClose={() => setChain(false)} title={`${selected} options`} wide testId="chain-modal">
        <OptionChain underlying={selected} />
      </Modal>
    </Card>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2 py-0.5"><span className="text-fg-faint">{k}</span><span className="num text-fg-muted">{v}</span></div>;
}

type UniverseTab = 'watch' | 'stock' | 'crypto' | 'commodity' | 'forex' | 'bond' | 'index';

/** Watchlist plus the full universe, searchable by name, ticker or sector. */
export function Watchlist() {
  const world = useGame((s) => s.world)!;
  const me = useGame((s) => s.me)!;
  useGame((s) => s.historyRev);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const act = useGame((s) => s.act);
  const [tab, setTab] = useState<UniverseTab>('watch');
  const [q, setQ] = useState('');
  const watch = me.player.watchlist;
  const ids = useMemo(() => {
    const all = [...INDEX_IDS, ...CONFIG.assets.filter((a) => a.listed !== false).map((a) => a.id)];
    let list = tab === 'watch' ? watch : tab === 'index' ? INDEX_IDS : CONFIG.assets.filter((a) => a.assetClass === tab && a.listed !== false).map((a) => a.id);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = all.filter((id) => {
        const d = assetDefOf(id);
        return id.toLowerCase().includes(s) || d?.name.toLowerCase().includes(s) || (d && sectorName(d.sector).toLowerCase().includes(s));
      });
    }
    return list;
  }, [tab, q, watch]);
  const h = useGame.getState().history;
  return (
    <Card className="flex min-h-0 flex-col" data-testid="watchlist">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-title">Markets</h2>
          <span className="num text-caption text-fg-faint">{ids.length}</span>
        </div>
        <TextField value={q} onChange={setQ} placeholder="Search 170+ assets" className="mt-3 h-9 w-full text-small" testId="asset-search" />
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {([['watch', 'Watch'], ['stock', 'Stocks'], ['crypto', 'Crypto'], ['commodity', 'Commod.'], ['forex', 'FX'], ['bond', 'Bonds'], ['index', 'Indices']] as [UniverseTab, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setTab(id); setQ(''); }} className={`shrink-0 rounded-sm px-2 py-1 text-caption ${tab === id && !q ? 'bg-ink-3 text-fg' : 'text-fg-faint hover:text-fg-muted'}`} data-testid={`uni-${id}`}>{label}</button>
          ))}
        </div>
      </div>
      <ul className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {ids.map((id) => {
          const info = seriesInfo(world, id, me.player.rankId);
          const on = id === selected;
          const inWatch = watch.includes(id);
          return (
            <li key={id} className={`group flex items-center ${on ? 'bg-ink-2 shadow-[inset_2px_0_0_var(--color-brass)]' : 'hover:bg-ink-2'}`}>
              <button type="button" onClick={() => select(id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left" data-testid={`watch-${id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="num text-small font-semibold text-fg">{id}</span>
                    {info.locked && <LockGlyph size={12} />}
                  </div>
                  <div className="truncate text-caption text-fg-faint">{info.name}</div>
                </div>
                <Sparkline data={sparkline(h, id, 1, 32)} width={52} height={20} className="hidden sm:block" />
                <div className="text-right">
                  <Flash value={info.price} className="num text-small text-fg">{price(info.price)}</Flash>
                  <div className={`num text-caption ${toneText[tone(info.changePct)]}`}>{signedPct(info.changePct)}</div>
                </div>
              </button>
              <button type="button" aria-label={inWatch ? `Remove ${id} from watchlist` : `Add ${id} to watchlist`} title={inWatch ? 'Remove from watchlist' : 'Add to watchlist'}
                onClick={() => act({ type: 'watch.set', assetIds: inWatch ? watch.filter((x) => x !== id) : [...watch, id] }, { silent: true })}
                className={`mr-2 h-8 w-8 shrink-0 rounded-md text-caption ${inWatch ? 'text-brass' : 'text-fg-disabled opacity-0 group-hover:opacity-100'}`}>★</button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function TickerStrip() {
  const world = useGame((s) => s.world)!;
  const me = useGame((s) => s.me)!;
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="ticker-strip">
      {me.player.watchlist.map((id) => {
        const info = seriesInfo(world, id, me.player.rankId);
        const on = id === selected;
        return (
          <button key={id} type="button" onClick={() => select(id)} className={`flex min-h-11 shrink-0 flex-col rounded-md border px-3 py-1.5 text-left ${on ? 'border-brass/60 bg-ink-2' : 'border-ink-3 bg-ink-1'}`} data-testid={`watch-${id}`}>
            <span className="num text-caption font-semibold text-fg">{id}</span>
            <span className={`num text-caption ${toneText[tone(info.changePct)]}`}>{signedPct(info.changePct)}</span>
          </button>
        );
      })}
    </div>
  );
}

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
  return (
    <Card data-testid="positions">
      <CardHeader title="Positions" right={<span className="num text-caption text-fg-faint" data-testid="cash">Cash {money(pf.cash)} · Unrealized <span className={toneText[tone(pf.unrealizedPnl)]}>{signedMoney(pf.unrealizedPnl)}</span></span>} />
      {pf.positions.length === 0 ? (
        <p className="px-4 pb-6 text-small text-fg-faint">No positions yet. Pick something on the right and buy a little to start.</p>
      ) : phone ? (
        <ul>
          {pf.positions.map((p) => (
            <li key={p.assetId} className="flex items-center gap-3 border-t border-ink-2 px-4 py-3" data-testid={`position-${p.assetId}`}>
              <button type="button" onClick={() => select(p.assetId)} className="min-w-0 flex-1 text-left">
                <div className="num text-small font-semibold">{p.assetId} {p.qty < 0 && <span className="text-loss">short</span>}</div>
                <div className="num text-caption text-fg-faint">{qty(p.qty)} @ {price(p.avgCost)}</div>
              </button>
              <div className="text-right">
                <div className="num text-small">{money(p.marketValue)}</div>
                <div className={`num text-caption ${toneText[tone(p.unrealizedPnl)]}`}>{signedMoney(p.unrealizedPnl)} {signedPct(p.unrealizedPct)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead><tr><Th>Asset</Th><Th right>Qty</Th><Th right>Avg</Th><Th right>Last</Th><Th right>Value</Th><Th right>P&L</Th><Th right>Weight</Th><Th right>5D</Th><Th /></tr></thead>
            <tbody>
              {pf.positions.map((p) => (
                <tr key={p.assetId} className="border-t border-ink-2 hover:bg-ink-2" data-testid={`position-${p.assetId}`}>
                  <Td><button type="button" onClick={() => select(p.assetId)} className="text-left"><div className="num font-semibold">{p.assetId}{p.qty < 0 && <span className="ml-1.5 text-micro text-loss">SHORT</span>}</div><div className="text-caption text-fg-faint">{assetDefOf(p.assetId)?.name}</div></button></Td>
                  <Td right num>{qty(p.qty)}</Td>
                  <Td right num>{price(p.avgCost)}</Td>
                  <Td right num><Flash value={p.price}>{price(p.price)}</Flash></Td>
                  <Td right num>{money(p.marketValue)}</Td>
                  <Td right num className={toneText[tone(p.unrealizedPnl)]}>{signedMoney(p.unrealizedPnl)}<div className="text-caption">{signedPct(p.unrealizedPct)}</div></Td>
                  <Td right num>{pct(p.weight)}</Td>
                  <Td right><Sparkline data={sparkline(h, p.assetId, 5)} /></Td>
                  <Td right><ConfirmButton confirm="Close" onConfirm={() => act({ type: 'position.close', assetId: p.assetId }, { success: `Closing ${p.assetId} at the next tick` })} testId={`close-${p.assetId}`}>Close</ConfirmButton></Td>
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
  const act = useGame((s) => s.act);
  const opts = Object.entries(me.account?.options ?? {});
  if (!opts.length) return null;
  return (
    <div className="border-t border-ink-2 px-4 py-3">
      <div className="label mb-2">Options</div>
      <OptionRows rows={opts} world={world} onClose={(id, n) => act({ type: 'option.trade', contractId: id, side: 'sell', qty: n }, { success: 'Option sold' })} />
    </div>
  );
}

function OptionRows({ rows, world, onClose }: { rows: [string, { qty: number; avgCost: number }][]; world: WorldState; onClose: (id: string, n: number) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(([id, pos]) => {
        const c = parseContract(id)!;
        const q = optionQuote(world, c);
        const pnl = (q.bid - pos.avgCost) * 100 * pos.qty;
        return (
          <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-small" data-testid={`option-${id}`}>
            <span className="num">{c.underlying} {c.strike} {c.kind === 'call' ? 'Call' : 'Put'} · day {c.expiryDay + 1} · ×{pos.qty}</span>
            <span className="num text-fg-muted">bid {price(q.bid)} · {q.daysLeft.toFixed(1)} days left</span>
            <span className={`num ${toneText[tone(pnl)]}`}>{signedMoney(pnl)}</span>
            <Button size="sm" onClick={() => onClose(id, pos.qty)}>Sell</Button>
          </li>
        );
      })}
    </ul>
  );
}

export function OpenOrders() {
  const me = useGame((s) => s.me)!;
  const act = useGame((s) => s.act);
  const open = me.orders.filter((o) => o.status === 'open');
  if (!open.length) return null;
  const typeLabel = (t: string) => ({ market: 'Market', limit: 'Limit', stop: 'Stop', stop_limit: 'Stop-limit', trailing: 'Trailing' } as Record<string, string>)[t] ?? t;
  return (
    <Card data-testid="open-orders">
      <CardHeader title="Open orders" />
      <ul>
        {open.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-2 px-4 py-2.5 text-small" data-testid={`order-${o.id}`}>
            <span className={`num font-semibold ${o.side === 'buy' ? 'text-gain' : 'text-loss'}`}>{o.side === 'buy' ? 'Buy' : 'Sell'}</span>
            <span className="num">{qty(o.qty - o.filledQty)} {o.assetId}</span>
            <span className="text-fg-muted">{typeLabel(o.type)}{o.ocoGroup ? ' (bracket)' : ''}</span>
            {o.limitPrice !== undefined && <span className="num text-fg-muted">limit {price(o.limitPrice)}</span>}
            {o.stopPrice !== undefined && <span className="num text-fg-muted">stop {price(o.stopPrice)}</span>}
            {o.type === 'trailing' && <span className="num text-fg-muted">trail {(o.trailPct! * 100).toFixed(1)}% from {price(o.trailRef ?? 0)}</span>}
            {o.filledQty > 0 && <span className="num text-brass">{qty(o.filledQty)} / {qty(o.qty)} filled</span>}
            <span className="text-caption text-fg-faint">{o.tif === 'day' ? 'day' : 'GTC'}</span>
            <button type="button" onClick={() => act({ type: 'order.cancel', orderId: o.id })} className="ml-auto text-caption text-fg-muted underline hover:text-fg" data-testid="cancel-order">Cancel</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function LicenseLadder() {
  const rankId = useGame((s) => s.me?.player.rankId ?? 'R0');
  return (
    <ul className="flex flex-col gap-2">
      {LICENSES.map((l) => {
        const have = rankIndex(rankId) >= rankIndex(l.rank);
        return (
          <li key={l.id} className={`rounded-md border p-3 ${have ? 'border-brass/40' : 'border-ink-3'}`}>
            <div className="flex items-center justify-between"><span className="font-semibold">{l.name}</span>{have ? <span className="text-caption text-brass">Held</span> : <span className="flex items-center gap-1 text-caption text-fg-faint"><LockGlyph size={12} /> {l.rank}</span>}</div>
            <p className="mt-1 text-caption text-fg-muted">{l.blurb}</p>
          </li>
        );
      })}
    </ul>
  );
}

export { compactNum };
