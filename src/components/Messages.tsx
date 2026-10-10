'use client';

import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import { ChatPanel } from './Chat';
import { TONE_BAR } from './Shell';

type Tab = 'inbox' | 'chat';

/**
 * Messages, one app with two tabs (velvet-desktop-os.md, app 4; DECISIONS C-13): the inbox (private notices:
 * fills, margin calls, court, security) and the chat. The chat tab is open while it shows: the store's chat
 * flag clears the unread count then. The strip's chat button and a profile's Message button set that flag, and
 * this app switches to the chat tab.
 */
export function MessagesView({ view }: { view?: string }) {
  const chatOpen = useGame((s) => s.chatOpen);
  const dmTarget = useGame((s) => s.dmTarget);
  const unread = useGame((s) => s.me?.player.inboxUnread ?? 0);
  const chatUnread = useGame((s) => s.chatUnread);
  const [tab, setTab] = useState<Tab>(view === 'chat' ? 'chat' : 'inbox');
  // The chat flag wins: the strip and a profile raise it, and the tab follows it without an effect.
  const active: Tab = chatOpen ? 'chat' : tab;

  useEffect(() => {
    useGame.getState().setChat(active === 'chat');
  }, [active]);

  useEffect(() => () => useGame.getState().setChat(false), []);

  // Showing the inbox reads it (the bell's list does the same when it opens).
  useEffect(() => {
    if (active === 'inbox' && unread > 0) void useGame.getState().act({ type: 'inbox.read' }, { silent: true });
  }, [active, unread]);

  const show = (next: Tab) => {
    setTab(next);
    useGame.getState().setChat(next === 'chat');
  };

  return (
    <div className="os-body flex h-full min-h-0 flex-col gap-2" data-testid="social-view">
      <div role="tablist" className="flex gap-1 border-b border-ink-2">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'inbox'}
          data-testid="tab-inbox"
          onClick={() => show('inbox')}
          className={`px-3 py-2 text-small ${active === 'inbox' ? 'border-b-2 border-brass text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          {t('messages.tab.inbox')}
          {unread > 0 && active !== 'inbox' && <span className="num ml-2 text-caption text-brass">{unread}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'chat'}
          data-testid="tab-chat"
          onClick={() => show('chat')}
          className={`px-3 py-2 text-small ${active === 'chat' ? 'border-b-2 border-brass text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          {t('messages.tab.chat')}
          {chatUnread > 0 && active !== 'chat' && <span className="num ml-2 text-caption text-brass">{chatUnread}</span>}
        </button>
      </div>
      {active === 'inbox' ? <InboxList /> : <div className="min-h-0 flex-1"><ChatPanel key={dmTarget ?? 'world'} /></div>}
    </div>
  );
}

/** The inbox, newest first. Each notice keeps its tone bar, its time and its kind. */
export function InboxList() {
  const inbox = useGame((s) => s.me?.inbox ?? []);
  const items = inbox.slice().reverse();
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="inbox">
      {items.map((n) => (
        <li key={n.id} className="flex gap-3 border-t border-ink-2 py-2.5" data-testid="inbox-item">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_BAR[n.tone]}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-small text-fg">{n.text}</p>
            <p className="num mt-0.5 text-caption text-fg-faint">{clockLabel(n.tick, 720)} · {t(`inbox.kind.${n.kind}`)}</p>
          </div>
        </li>
      ))}
      {!items.length && <li className="py-8 text-center text-small text-fg-faint">{t('inbox.empty')}</li>}
    </ul>
  );
}
