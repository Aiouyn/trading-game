'use client';

// The notification center the status-strip bell opens (velvet-desktop-os.md, Notifications; P2-096). UX stage 2: it lists
// the desk notices (every toast the desktop raised, so a notice that left the screen is still here: day closes, coach tips,
// While You Were Away) above the save's inbox, newest first. The shell only reads the inbox (DECISIONS C-13). Its footer
// opens Messages on the inbox tab.
import { t, tm } from '@/i18n';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import { TONE_BAR } from '@/components/Shell';
import { openFromShell } from './openApp';

/** How many notices the bell panel lists from the inbox (P2-096). */
export const BELL_MAX = 50;

export function BellPanel() {
  const open = useGame((s) => s.inboxOpen);
  const setInbox = useGame((s) => s.setInbox);
  const inbox = useGame((s) => s.me?.inbox);
  const notices = useGame((s) => s.notices);
  if (!open) return null;
  const items = (inbox ?? []).slice(-BELL_MAX).reverse();
  const desk = notices.slice().reverse();
  return (
    <section className="os-bell-panel" role="dialog" aria-labelledby="bell-panel-title" data-testid="bell-panel">
      <header className="os-bell-head">
        <h2 id="bell-panel-title" className="label">{t('bell.title')}</h2>
        <button type="button" className="os-bell-close" data-testid="bell-close" aria-label={t('common.close')} onClick={() => setInbox(false)}>✕</button>
      </header>
      <ul className="os-bell-list" data-testid="bell-list">
        {desk.length > 0 && <li className="label px-4 pb-1 pt-2 text-fg-faint" data-testid="bell-desk-title">{t('bell.desk')}</li>}
        {desk.map((n) => (
          <li key={n.id} className="os-bell-item" data-testid="bell-desk-item">
            <span className={`os-bell-tone ${TONE_BAR[n.tone]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-small text-fg">{n.text}</p>
            </div>
          </li>
        ))}
        {items.map((n) => (
          <li key={n.id} className="os-bell-item" data-testid="bell-item">
            <span className={`os-bell-tone ${TONE_BAR[n.tone]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-small text-fg">{tm(n.msg, n.text)}</p>
              <p className="num text-caption text-fg-faint">{clockLabel(n.tick, 720)} · {t(`inbox.kind.${n.kind}`)}</p>
            </div>
          </li>
        ))}
        {!items.length && !desk.length && <li className="px-4 py-6 text-center text-small text-fg-faint">{t('bell.empty')}</li>}
      </ul>
      <footer className="os-bell-foot">
        <button
          type="button"
          className="os-tool"
          data-testid="bell-open-messages"
          onClick={() => {
            setInbox(false);
            openFromShell('messages', {}, { focus: true });
          }}
        >
          {t('bell.openMessages')}
        </button>
      </footer>
    </section>
  );
}
