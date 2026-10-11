'use client';

// Status strip (P2-050..P2-052, 34 px): the Quay mark and release, the launcher field, the clock and
// market state, then the rank chip, net worth with today's change, and the notification bell. In focus
// mode only the clock and net worth stay (P2-066); the other items carry `os-soft` and the CSS hides them.
// Below 1000 px the launcher field keeps its glyph and Ctrl K and drops the words (P2-057). The strip only
// reads the game store, and its buttons only open a panel or a drawer.
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { clockLabel } from '@/game/clock';
import { rankOrdinal } from '@/shell/ctx';
import { Glyph } from './glyphs';
import { NetWorthFigures } from './NetWorthFigures';
import { openApp, openLauncher } from './shellStore';
import { WorkspaceTabs } from './WorkspaceTabs';

export function StatusStrip() {
  const me = useGame((s) => s.me);
  const frame = useGame((s) => s.frame);
  const status = useGame((s) => s.status);
  const setInbox = useGame((s) => s.setInbox);
  const inboxOpen = useGame((s) => s.inboxOpen);
  const setChat = useGame((s) => s.setChat);
  const chatUnread = useGame((s) => s.chatUnread);
  const rankId = me?.rank.id ?? 'R0';
  const unread = me?.player.inboxUnread ?? 0;
  const ready = status === 'ready';
  return (
    <header className="os-strip" data-testid="os-strip">
      <span className="os-brand os-soft" data-testid="os-mark"><Glyph name="quay" size={20} /></span>
      <span className="os-wm os-soft">{t('shell.brand')}</span>
      <span className="os-rel os-soft">{t('shell.release', { n: rankOrdinal(rankId) })}</span>
      <button
        type="button"
        className="os-launch os-soft"
        data-testid="os-launcher-field"
        aria-label={t('shell.launch.label')}
        aria-haspopup="listbox"
        title={t('shell.launch.placeholder')}
        onClick={() => openLauncher()}
      >
        <Glyph name="search" size={14} />
        <span className="os-launch-text">{t('shell.launch.placeholder')}</span>
        <span className="os-kbd">{t('shell.keys.launcher')}</span>
      </button>
      <WorkspaceTabs />
      <div className="os-mid">
        <span className="os-clock" data-testid="os-clock">{clockLabel(frame?.tick ?? 0, 720)}</span>
        <span className="os-soft os-market items-center gap-1.5 text-caption text-fg-muted">
          <span className={`os-dot ${ready ? 'bg-gain' : 'bg-warn'}`} aria-hidden />
          {ready ? t('shell.market.open') : t('shell.market.reconnect')}
        </span>
      </div>
      <div className="os-right">
        <button type="button" className="os-chip os-soft" data-testid="os-rank" onClick={() => openApp('settings', {}, { focus: true })}>
          {rankId} · {t(`rank.${rankId}`)}
        </button>
        <NetWorthFigures />
        <button
          type="button"
          className="os-bell os-soft"
          data-testid="os-chat"
          aria-label={chatUnread > 0 ? t('shell.chat.unread', { n: chatUnread }) : t('shell.chat')}
          title={t('shell.chat')}
          onClick={() => {
            // The chat is Messages' second tab: opening it focuses Messages there (the OsRoot follows chatOpen too).
            setChat(true);
            openApp('messages', { view: 'chat' }, { focus: true });
          }}
        >
          <Glyph name="messages" size={18} />
          {chatUnread > 0 && <span className="os-bell-dot" aria-hidden />}
        </button>
        <button
          type="button"
          className="os-bell os-soft"
          data-testid="os-bell"
          aria-label={unread > 0 ? t('shell.bell', { n: unread }) : t('shell.bell.none')}
          aria-expanded={inboxOpen}
          aria-haspopup="dialog"
          onClick={() => setInbox(!inboxOpen)}
        >
          <Glyph name="bell" size={18} />
          {unread > 0 && <span className="os-bell-dot" aria-hidden />}
        </button>
      </div>
    </header>
  );
}
