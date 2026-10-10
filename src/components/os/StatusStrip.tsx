'use client';

// Status strip (P2-050..P2-052, 34 px): the Quay mark and release, the clock and market state, then
// the rank chip, net worth with today's change, and the notification bell. The launcher field comes
// with Phase 2 step 2. The strip only reads the game store; it never changes a value.
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { clockLabel } from '@/game/clock';
import { money, signedPct, tone, toneText } from '@/game/format';
import { rankOrdinal } from '@/shell/ctx';
import { Glyph } from './glyphs';
import { openApp } from './shellStore';

export function StatusStrip() {
  const me = useGame((s) => s.me);
  const frame = useGame((s) => s.frame);
  const status = useGame((s) => s.status);
  const setInbox = useGame((s) => s.setInbox);
  const rankId = me?.rank.id ?? 'R0';
  const nw = me?.netWorth.total ?? 0;
  const dayStart = me?.player.dayStart.netWorth ?? nw;
  const today = nw - dayStart;
  const todayPct = dayStart ? today / dayStart : 0;
  const unread = me?.player.inboxUnread ?? 0;
  const ready = status === 'ready';
  return (
    <header className="os-strip" data-testid="os-strip">
      <span className="os-brand" data-testid="os-mark"><Glyph name="quay" size={20} /></span>
      <span className="os-wm">{t('shell.brand')}</span>
      <span className="os-rel">{t('shell.release', { n: rankOrdinal(rankId) })}</span>
      <div className="os-mid">
        <span className="os-clock" data-testid="os-clock">{clockLabel(frame?.tick ?? 0, 720)}</span>
        <span className="flex items-center gap-1.5 text-caption text-fg-muted">
          <span className={`os-dot ${ready ? 'bg-gain' : 'bg-warn'}`} aria-hidden />
          {ready ? t('shell.market.open') : t('shell.market.reconnect')}
        </span>
      </div>
      <div className="os-right">
        <button type="button" className="os-chip" data-testid="os-rank" onClick={() => openApp('settings')}>
          {rankId} · {t(`rank.${rankId}`)}
        </button>
        <span className="os-nw" data-testid="os-networth">
          {money(nw)} <span className={toneText[tone(today)]}>{signedPct(todayPct)}</span>
        </span>
        <button
          type="button"
          className="os-bell"
          data-testid="os-bell"
          aria-label={unread > 0 ? t('shell.bell', { n: unread }) : t('shell.bell.none')}
          onClick={() => setInbox(true)}
        >
          <Glyph name="bell" size={18} />
          {unread > 0 && <span className="os-bell-dot" aria-hidden />}
        </button>
      </div>
    </header>
  );
}
