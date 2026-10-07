'use client';

import { useGame } from '@/game/store';
import { clockParts } from '@/game/clock';
import { compactMoney, money, signedMoney, signedPct, tone, toneText } from '@/game/format';
import { Icon } from './icons';
import { BrassChip, Flash, Progress, TickRing } from './ui';

const REGIME_LABEL: Record<string, string> = { expansion: 'Expansion', overheating: 'Overheating', contraction: 'Recession', recovery: 'Recovery' };

/** Serif net worth with the cents at 65% in fg-muted (DESIGN §3). */
export function NetWorth({ value, size = 'hero' }: { value: number; size?: 'hero' | 'hero-lg' }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs).toLocaleString('en-US');
  const cents = (abs % 1).toFixed(2).slice(1);
  return (
    <Flash value={Math.round(value)}>
      <span className={`font-serif ${size === 'hero' ? 'text-hero' : 'text-hero-lg'} text-fg`} data-testid="net-worth">
        {neg ? '−' : ''}${whole}<span className="text-[65%] text-fg-muted">{cents}</span>
      </span>
    </Flash>
  );
}

function useHeaderData() {
  const me = useGame((s) => s.me);
  const frame = useGame((s) => s.frame);
  const directory = useGame((s) => s.directory);
  const nw = me?.netWorth.total ?? 0;
  const dayStart = me?.player.dayStart.netWorth ?? nw;
  const today = nw - dayStart;
  const rival = me?.player.rivalId ? directory.find((d) => d.id === me.player.rivalId) : null;
  const contracts = me?.contracts ?? [];
  return { me, frame, nw, today, todayPct: dayStart ? today / dayStart : 0, rival, contracts };
}

function Clock({ size = 30 }: { size?: number }) {
  const frame = useGame((s) => s.frame);
  const tickMs = useGame((s) => s.tickMs);
  const status = useGame((s) => s.status);
  const tick = frame?.tick ?? 0;
  const c = clockParts(tick, 720);
  return (
    <div className="flex items-center gap-3" data-testid="game-clock">
      <div className="text-right">
        <div className="num text-body text-fg">Day {c.day} · {c.hhmm}</div>
        <div className="flex items-center justify-end gap-1.5 text-caption text-fg-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${status === 'ready' ? 'bg-gain' : 'bg-warn'}`} aria-hidden />
          {status === 'ready' ? `${REGIME_LABEL[frame?.regime ?? 'expansion']} · Port Avalon` : 'Reconnecting…'}
        </div>
      </div>
      <TickRing tick={tick} ms={tickMs} paused={status !== 'ready'} size={size} />
    </div>
  );
}

export function TopBar() {
  const { me, nw, today, todayPct, rival, contracts, frame } = useHeaderData();
  const setInbox = useGame((s) => s.setInbox);
  const setScreen = useGame((s) => s.setScreen);
  const openProfile = useGame((s) => s.openProfile);
  if (!me) return null;
  const r = me.rank;
  const done = contracts.filter((c) => c.done && !c.claimed).length;
  const unread = me.player.inboxUnread;
  return (
    <header className="relative flex h-[var(--topbar-h)] shrink-0 items-center gap-6 border-b border-ink-2 px-6" data-testid="top-bar">
      {r.id === 'R0' && <Crack />}
      <div className="min-w-0">
        <div className="label">Net worth</div>
        <NetWorth value={nw} />
      </div>
      <div className="hidden min-w-0 lg:block">
        <div className="label">Today</div>
        <div className={`num text-body ${toneText[tone(today)]}`} data-testid="today-pnl">{signedMoney(today)} {signedPct(todayPct)}</div>
      </div>
      <div className="min-w-0 flex-1 max-w-xs">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setScreen('profile')}><BrassChip>{r.id} · {r.name}</BrassChip></button>
          {r.next && <span className="num truncate text-caption text-fg-faint">{compactMoney(nw)} / {compactMoney(r.next.threshold)} to {r.next.name}</span>}
        </div>
        <Progress value={r.progress} className="mt-2" label={`Progress to ${r.next?.name ?? 'the top'}`} />
      </div>
      <div className="hidden min-w-0 xl:block">
        <div className="label">Rival</div>
        {rival ? (
          <button type="button" onClick={() => openProfile(rival.id)} className="num truncate text-small text-fg hover:underline" data-testid="rival">
            {rival.handle} <span className="text-loss">+{compactMoney(rival.netWorth - nw)} ahead</span>
          </button>
        ) : <div className="text-small text-brass">You lead the world</div>}
      </div>
      <button type="button" onClick={() => setScreen('profile')} className="hidden min-w-0 text-left 2xl:block" data-testid="contracts-chip">
        <div className="label">This hour</div>
        <div className="num text-small text-fg">{contracts.filter((c) => c.done).length}/{contracts.length} contracts{done ? <span className="ml-1 text-brass"> · claim {done}</span> : null}</div>
      </button>
      <div className="ml-auto flex items-center gap-4">
        <div className="hidden text-right lg:block">
          <div className="label">Policy rate</div>
          <div className="num text-small text-fg-muted">{frame?.rates ? `${(frame.rates.policy * 100).toFixed(2)}%` : '—'}</div>
        </div>
        <Clock />
        <button type="button" onClick={() => setInbox(true)} className="relative h-10 w-10 rounded-md text-fg-muted hover:bg-ink-2 hover:text-fg" aria-label={`Inbox, ${unread} unread`} data-testid="inbox-button">
          <span className="flex justify-center"><Icon name="bell" /></span>
          {unread > 0 && <span className="num absolute top-1 right-1 rounded-chip bg-brass px-1 text-[9px] text-on-brass">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </div>
    </header>
  );
}

export function PhoneHeader() {
  const { me, nw, today, todayPct } = useHeaderData();
  const setInbox = useGame((s) => s.setInbox);
  if (!me) return null;
  const r = me.rank;
  const unread = me.player.inboxUnread;
  return (
    <header className="relative px-4 pt-4" data-testid="phone-header">
      {r.id === 'R0' && <Crack phone />}
      <div className="flex items-center justify-between gap-2">
        <BrassChip>{r.id} · {r.name}</BrassChip>
        <div className="flex items-center gap-2">
          <Clock size={22} />
          <button type="button" onClick={() => setInbox(true)} className="relative h-10 w-10 rounded-md text-fg-muted" aria-label={`Inbox, ${unread} unread`} data-testid="inbox-button">
            <span className="flex justify-center"><Icon name="bell" /></span>
            {unread > 0 && <span className="num absolute top-1 right-1 rounded-chip bg-brass px-1 text-[9px] text-on-brass">{unread}</span>}
          </button>
        </div>
      </div>
      <div className="mt-4 label">Net worth</div>
      <NetWorth value={nw} size="hero-lg" />
      <div className={`num mt-1 text-small ${toneText[tone(today)]}`}><span className="label mr-2 text-fg-faint">Today</span>{signedMoney(today)} {signedPct(todayPct)}</div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={r.progress} className="flex-1" label="Rank progress" />
        {r.next && <span className="num shrink-0 text-caption text-fg-faint">{compactMoney(nw)} / {compactMoney(r.next.threshold)} to {r.next.name}</span>}
      </div>
    </header>
  );
}

/** The R0 hairline crack (DESIGN §6d). */
function Crack({ phone = false }: { phone?: boolean }) {
  return (
    <svg className={`pointer-events-none absolute ${phone ? 'top-0 left-0' : 'top-0 right-40'} h-16 w-40 opacity-50`} viewBox="0 0 160 64" aria-hidden data-testid="shell-crack">
      <path d="M2 2 L38 18 L52 12 L80 34 L96 30 L130 56" fill="none" className="stroke-fg-disabled" strokeWidth="1" />
      <path d="M52 12 L60 2" fill="none" className="stroke-fg-disabled" strokeWidth="0.8" />
    </svg>
  );
}

export { money };
