'use client';

import { portfolio } from '@/engine';
import { clockParts, SPEEDS, tickMs, type Speed } from '@/game/clock';
import { compactMoney, money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { rankProgress } from '@/game/rank';
import { PLAYER, useGame } from '@/game/store';
import { TickRing } from './ui';

function usePlayer() {
  const world = useGame((s) => s.world)!;
  const pf = portfolio(world, PLAYER);
  const rp = rankProgress(pf.peakEquity, pf.equity, pf.startingCash);
  const dayBase = pf.equity - pf.dayPnl;
  return { world, pf, rp, dayPct: dayBase > 0 ? pf.dayPnl / dayBase : 0 };
}

function NetWorth({ value, size }: { value: number; size: 'hero' | 'hero-lg' }) {
  const s = money(value);
  const dot = s.lastIndexOf('.');
  return (
    <h1 className={`font-serif tracking-tight text-fg ${size === 'hero' ? 'text-hero' : 'text-hero-lg'}`} data-testid="net-worth">
      <span className="sr-only">Net worth </span>
      {s.slice(0, dot)}
      <span className="text-fg-muted">{s.slice(dot)}</span>
    </h1>
  );
}

function RankChip() {
  const { rp } = usePlayer();
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-chip border border-brass-lo/60 px-2.5 text-caption text-brass-hi" data-testid="rank-chip">
      <span className="num text-micro text-brass">{rp.rank.id}</span>
      <span className="font-medium">{rp.rank.name}</span>
    </span>
  );
}

function RankProgress({ className = '' }: { className?: string }) {
  const { rp, pf } = usePlayer();
  if (!rp.next) return null;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-chip bg-ink-3"
        role="progressbar"
        aria-label={`Progress to ${rp.next.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(rp.progress * 100)}
      >
        <div className="h-full rounded-chip bg-brass" style={{ width: `${Math.max(2, rp.progress * 100)}%` }} />
      </div>
      <span className="num whitespace-nowrap text-caption text-fg-faint">
        {compactMoney(pf.equity)} / {compactMoney(rp.next.threshold)} to {rp.next.name}
      </span>
    </div>
  );
}

function Clock({ ring }: { ring: number }) {
  const world = useGame((s) => s.world)!;
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const c = clockParts(world.tick, world.config.ticksPerDay);
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-right">
        <div className="num text-body text-fg" data-testid="game-clock">
          Day {c.day} <span className="text-fg-faint">&middot;</span> {c.hhmm}
        </div>
        <div className="flex items-center justify-end gap-1.5 text-caption text-fg-faint" data-testid="market-state">
          <span className="size-1.5 rounded-full bg-gain" aria-hidden />
          Market open &middot; Port Avalon
        </div>
      </div>
      <TickRing tick={world.tick} ms={tickMs(speed)} paused={paused} size={ring} />
    </div>
  );
}

function SpeedControl({ compact = false }: { compact?: boolean }) {
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const setSpeed = useGame((s) => s.setSpeed);
  const togglePause = useGame((s) => s.togglePause);
  const btn = 'flex items-center justify-center rounded-sm font-medium transition-colors duration-[var(--dur-fast)]';
  if (compact) {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] as Speed;
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={togglePause} className={`${btn} size-11 text-fg-muted`} aria-label={paused ? 'Resume' : 'Pause'} data-testid="pause">
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button type="button" onClick={() => setSpeed(next)} className={`${btn} num h-11 min-w-11 px-1 text-caption text-fg-muted`} aria-label={`Speed ${speed}x, tap for ${next}x`} data-testid="speed">
          {speed}&times;
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center rounded-md border border-ink-3 bg-ink-0 p-0.5" role="group" aria-label="Game speed">
      <button type="button" onClick={togglePause} className={`${btn} size-7 ${paused ? 'bg-ink-3 text-fg' : 'text-fg-faint hover:text-fg-muted'}`} aria-label={paused ? 'Resume' : 'Pause'} aria-pressed={paused} data-testid="pause">
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setSpeed(s)}
          aria-pressed={!paused && speed === s}
          data-testid={`speed-${s}`}
          className={`${btn} num h-7 px-2 text-caption ${!paused && speed === s ? 'bg-ink-3 text-fg' : 'text-fg-faint hover:text-fg-muted'}`}
        >
          {s}&times;
        </button>
      ))}
    </div>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="fill-current">
      <rect x="2" y="1.5" width="3" height="9" rx="0.75" />
      <rect x="7" y="1.5" width="3" height="9" rx="0.75" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="fill-current">
      <path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5Z" />
    </svg>
  );
}

function Today() {
  const { pf, dayPct } = usePlayer();
  const t = toneText[tone(pf.dayPnl)];
  return (
    <div className="flex items-baseline gap-2" data-testid="today-pnl">
      <span className="label">Today</span>
      <span className={`num text-small ${t}`}>{signedMoney(pf.dayPnl)}</span>
      <span className={`num text-small ${t}`}>{signedPct(dayPct)}</span>
    </div>
  );
}

/** Desktop and tablet top bar (≥768). */
export function TopBar() {
  const { pf } = usePlayer();
  return (
    <header className="flex min-h-[var(--topbar-h)] items-center gap-6 border-b border-ink-2 px-5">
      <div className="flex min-w-0 flex-col">
        <span className="label">Net worth</span>
        <div className="flex items-baseline gap-4">
          <NetWorth value={pf.equity} size="hero" />
          <Today />
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 flex-col gap-1.5 lg:flex">
        <div><RankChip /></div>
        <RankProgress className="max-w-80" />
      </div>
      <div className="ml-auto flex items-center gap-4">
        <SpeedControl />
        <Clock ring={30} />
      </div>
    </header>
  );
}

/** Phone header (<768). */
export function PhoneHeader() {
  const { pf } = usePlayer();
  return (
    <header className="flex flex-col gap-3 px-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <RankChip />
        <div className="flex items-center gap-1">
          <SpeedControl compact />
          <PhoneClock />
        </div>
      </div>
      <div>
        <span className="label">Net worth</span>
        <NetWorth value={pf.equity} size="hero-lg" />
        <div className="mt-1"><Today /></div>
      </div>
      <RankProgress />
    </header>
  );
}

function PhoneClock() {
  const world = useGame((s) => s.world)!;
  const speed = useGame((s) => s.speed);
  const paused = useGame((s) => s.paused);
  const c = clockParts(world.tick, world.config.ticksPerDay);
  return (
    <div className="flex items-center gap-2">
      <span className="num text-small text-fg" data-testid="game-clock">
        Day {c.day} <span className="text-fg-faint">&middot;</span> {c.hhmm}
      </span>
      <TickRing tick={world.tick} ms={tickMs(speed)} paused={paused} size={22} />
    </div>
  );
}
