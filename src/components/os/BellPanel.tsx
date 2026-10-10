'use client';

// The notification panel the status-strip bell opens (velvet-desktop-os.md, Notifications; P2-096): the last 50
// notices of this save's inbox, newest first. The shell only reads the inbox (DECISIONS C-13). Its footer opens
// Messages on the inbox tab.
import { t } from '@/i18n';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import { TONE_BAR } from '@/components/Shell';
import { openFromShell } from './openApp';

/** How many notices the bell panel lists (P2-096). */
export const BELL_MAX = 50;

export function BellPanel() {
  const open = useGame((s) => s.inboxOpen);
  const setInbox = useGame((s) => s.setInbox);
  const inbox = useGame((s) => s.me?.inbox);
  if (!open) return null;
  const items = (inbox ?? []).slice(-BELL_MAX).reverse();
  return (
    <section className="os-bell-panel" role="dialog" aria-labelledby="bell-panel-title" data-testid="bell-panel">
      <header className="os-bell-head">
        <h2 id="bell-panel-title" className="label">{t('bell.title')}</h2>
        <button type="button" className="os-bell-close" data-testid="bell-close" aria-label={t('common.close')} onClick={() => setInbox(false)}>✕</button>
      </header>
      <ul className="os-bell-list" data-testid="bell-list">
        {items.map((n) => (
          <li key={n.id} className="os-bell-item" data-testid="bell-item">
            <span className={`os-bell-tone ${TONE_BAR[n.tone]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-small text-fg">{n.text}</p>
              <p className="num text-caption text-fg-faint">{clockLabel(n.tick, 720)} · {t(`inbox.kind.${n.kind}`)}</p>
            </div>
          </li>
        ))}
        {!items.length && <li className="px-4 py-6 text-center text-small text-fg-faint">{t('bell.empty')}</li>}
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
