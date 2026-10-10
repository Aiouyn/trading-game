'use client';

import { useGame, type Screen } from '@/game/store';
import { clockLabel } from '@/game/clock';
import { rankIndex } from '@/content/lifestyle';
import type { WireItem } from '@/world/types';
import { Icon, type IconName } from './icons';
import { ChatPanel } from './Social';

export const TONE_TEXT: Record<WireItem['tone'], string> = {
  gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', info: 'text-info', brass: 'text-brass',
};
const TONE_BAR: Record<WireItem['tone'], string> = {
  gain: 'bg-gain', loss: 'bg-loss', warn: 'bg-warn', info: 'bg-info', brass: 'bg-brass',
};

export interface NavItem { id: Screen; label: string; icon: IconName; rank?: string }

export const NAV: NavItem[] = [
  { id: 'market', label: 'Market', icon: 'market' },
  { id: 'portfolio', label: 'Portfolio', icon: 'portfolio' },
  { id: 'empire', label: 'Empire', icon: 'empire' },
  { id: 'estate', label: 'Estate', icon: 'estate' },
  { id: 'lab', label: 'AI Lab', icon: 'lab', rank: 'R2' },
  { id: 'security', label: 'Security', icon: 'security', rank: 'R3' },
  { id: 'court', label: 'Court', icon: 'court' },
  { id: 'social', label: 'Social', icon: 'social' },
  { id: 'wire', label: 'Wire', icon: 'wire' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

function useLocked() {
  const rankId = useGame((s) => s.me?.player.rankId ?? 'R0');
  return (n: NavItem) => !!n.rank && rankIndex(rankId) < rankIndex(n.rank);
}

/** Desktop and tablet rail. */
export function NavRail() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const chatUnread = useGame((s) => s.chatUnread);
  const setChat = useGame((s) => s.setChat);
  const locked = useLocked();
  return (
    <nav aria-label="Main" className="flex h-dvh w-[var(--rail-w)] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-ink-2 py-3">
      <div className="mb-2 font-serif text-title text-brass" aria-hidden>T</div>
      {NAV.map((n) => {
        const on = n.id === screen;
        const lock = locked(n);
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => setScreen(n.id)}
            aria-current={on ? 'page' : undefined}
            title={lock ? `${n.label} unlocks at a higher rank` : n.label}
            className={`relative flex w-15 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] tracking-normal ${on ? 'bg-ink-2 text-fg' : lock ? 'text-fg-disabled hover:bg-ink-2' : 'text-fg-faint hover:bg-ink-2 hover:text-fg'}`}
            data-testid={`nav-${n.id}`}
          >
            <Icon name={n.icon} size={20} />
            {n.label}
            {lock && <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />}
          </button>
        );
      })}
      <button type="button" onClick={() => setChat(true)} className="relative mt-auto flex w-15 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] text-fg-faint hover:bg-ink-2 hover:text-fg" data-testid="nav-chat">
        <Icon name="chat" size={20} />
        Chat
        {chatUnread > 0 && <span className="num absolute top-0.5 right-1.5 rounded-chip bg-brass px-1 text-[9px] text-on-brass">{chatUnread > 99 ? '99+' : chatUnread}</span>}
      </button>
    </nav>
  );
}

export function WireStrip() {
  const wire = useGame((s) => s.wire);
  const setScreen = useGame((s) => s.setScreen);
  const select = useGame((s) => s.select);
  return (
    <footer className="flex h-[34px] shrink-0 items-center gap-3 overflow-hidden border-t border-ink-2 bg-ink-0 px-4 text-caption" data-testid="wire-strip">
      <button type="button" onClick={() => setScreen('wire')} className="label shrink-0 text-brass hover:text-brass-hi">The Wire</button>
      {wire.length === 0 ? (
        <span className="text-fg-faint">Quiet markets. Headlines appear here when something happens.</span>
      ) : (
        <ul className="flex min-w-0 gap-6 whitespace-nowrap">
          {wire.slice(0, 10).map((w) => (
            <li key={w.id} className="flex items-baseline gap-2">
              <span className="num text-fg-faint">{clockLabel(w.tick, 720).replace('Day ', 'D')}</span>
              {w.assetId ? (
                <button type="button" onClick={() => { select(w.assetId!); setScreen('market'); }} className={`font-semibold hover:underline ${TONE_TEXT[w.tone]}`}>{w.tag}</button>
              ) : (
                <span className={`font-semibold ${TONE_TEXT[w.tone]}`}>{w.tag}</span>
              )}
              <span className="text-fg-muted">{w.text}</span>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}

export function InboxDrawer() {
  const open = useGame((s) => s.inboxOpen);
  const setInbox = useGame((s) => s.setInbox);
  const inbox = useGame((s) => s.me?.inbox ?? []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close inbox" className="absolute inset-0 bg-ink-0/60" onClick={() => setInbox(false)} />
      <aside role="dialog" aria-label="Inbox" className="relative flex h-full w-full max-w-md flex-col border-l border-ink-3 bg-ink-1 shadow-sheet" data-testid="inbox">
        <div className="flex items-center justify-between border-b border-ink-2 px-5 py-4">
          <h2 className="font-serif text-title">Inbox</h2>
          <button type="button" onClick={() => setInbox(false)} aria-label="Close" className="h-9 w-9 rounded-md text-fg-muted hover:bg-ink-2"><span aria-hidden>✕</span></button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {inbox.length === 0 && <li className="px-5 py-8 text-center text-fg-faint">Nothing yet.</li>}
          {inbox.map((n) => (
            <li key={n.id} className="flex gap-3 border-b border-ink-2 px-5 py-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_BAR[n.tone]}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-small text-fg">{n.text}</p>
                <p className="num mt-0.5 text-caption text-fg-faint">{clockLabel(n.tick, 720)} · {n.kind}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

export function ChatDrawer() {
  const open = useGame((s) => s.chatOpen);
  const setChat = useGame((s) => s.setChat);
  const dmTarget = useGame((s) => s.dmTarget);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close chat" className="absolute inset-0 bg-ink-0/60" onClick={() => setChat(false)} />
      <aside role="dialog" aria-label="Chat" className="relative flex h-full w-full max-w-md flex-col border-l border-ink-3 bg-ink-1 shadow-sheet" data-testid="chat-drawer">
        <div className="flex items-center justify-between border-b border-ink-2 px-5 py-4">
          <h2 className="font-serif text-title">Chat</h2>
          <button type="button" onClick={() => setChat(false)} aria-label="Close" className="h-9 w-9 rounded-md text-fg-muted hover:bg-ink-2"><span aria-hidden>✕</span></button>
        </div>
        <div className="min-h-0 flex-1"><ChatPanel key={dmTarget ?? 'world'} /></div>
      </aside>
    </div>
  );
}
