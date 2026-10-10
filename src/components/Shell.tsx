'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useGame, type Screen } from '@/game/store';
import { clockLabel } from '@/game/clock';
import { rankIndex } from '@/content/lifestyle';
import type { WireItem } from '@/world/types';
import { Icon, type IconName } from './icons';
import { OrderPad } from './OrderPad';
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

const PHONE_TABS: Screen[] = ['market', 'portfolio', 'empire', 'estate'];

export function TabBar() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const setMore = useGame((s) => s.setMore);
  const moreOn = !PHONE_TABS.includes(screen);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex h-[var(--tabbar-h)] border-t border-ink-2 bg-ink-0 pb-[env(safe-area-inset-bottom)]">
      {NAV.filter((n) => PHONE_TABS.includes(n.id)).map((n) => {
        const on = n.id === screen;
        return (
          <button key={n.id} type="button" onClick={() => setScreen(n.id)} aria-current={on ? 'page' : undefined}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-micro tracking-normal ${on ? 'text-brass-hi' : 'text-fg-faint'}`} data-testid={`tab-${n.id}`}>
            <Icon name={n.icon} />
            {n.label}
          </button>
        );
      })}
      <button type="button" onClick={() => setMore(true)} className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-micro tracking-normal ${moreOn ? 'text-brass-hi' : 'text-fg-faint'}`} data-testid="tab-more">
        <Icon name="more" />
        More
      </button>
    </nav>
  );
}

export function MoreSheet() {
  const open = useGame((s) => s.moreOpen);
  const setMore = useGame((s) => s.setMore);
  const setScreen = useGame((s) => s.setScreen);
  const setChat = useGame((s) => s.setChat);
  const locked = useLocked();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink-0/70" onClick={() => setMore(false)} />
      <div role="dialog" aria-modal="true" aria-label="More" className="relative rounded-t-lg border-t border-ink-3 bg-ink-1 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-sheet" data-testid="more-sheet">
        <div className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => !PHONE_TABS.includes(n.id)).map((n) => (
            <button key={n.id} type="button" onClick={() => setScreen(n.id)} className={`flex flex-col items-center gap-1.5 rounded-md border border-ink-3 py-4 text-small ${locked(n) ? 'text-fg-disabled' : 'text-fg-muted'}`} data-testid={`more-${n.id}`}>
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
          <button type="button" onClick={() => { setMore(false); setChat(true); }} className="flex flex-col items-center gap-1.5 rounded-md border border-ink-3 py-4 text-small text-fg-muted" data-testid="more-chat">
            <Icon name="chat" />
            Chat
          </button>
          <Link href="/credits" className="flex flex-col items-center gap-1.5 rounded-md border border-ink-3 py-4 text-small text-fg-muted" data-testid="more-credits">
            <Icon name="star" />
            Credits
          </Link>
        </div>
      </div>
    </div>
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

export function TradeSheet() {
  const open = useGame((s) => s.tradeSheetOpen);
  const setOpen = useGame((s) => s.setTradeSheet);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      <button type="button" aria-label="Close trade" className="absolute inset-0 bg-ink-0/70" onClick={() => setOpen(false)} />
      <div role="dialog" aria-modal="true" aria-label="Trade" className="relative max-h-[88dvh] overflow-y-auto rounded-t-lg border-t border-ink-3 bg-ink-1 pb-[env(safe-area-inset-bottom)] shadow-sheet">
        <div className="sticky top-0 z-10 flex justify-center bg-ink-1 pt-2">
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close trade" className="flex h-11 w-24 items-start justify-center">
            <span className="mt-1 h-1 w-10 rounded-chip bg-ink-3" />
          </button>
        </div>
        <div className="[&>section]:rounded-none [&>section]:border-0">
          <OrderPad />
        </div>
      </div>
    </div>
  );
}

export function Toasts({ phone = false }: { phone?: boolean }) {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  // The store owns the hold timers (src/shell/holds.ts), so this column only draws and dismisses on click.
  return (
    <div aria-live="polite" className={`pointer-events-none fixed z-[60] flex flex-col gap-2 ${phone ? 'inset-x-4 bottom-[calc(var(--tabbar-h)+76px)]' : 'bottom-12 right-6 w-96 items-end'}`}>
      {toasts.map((t) => (
        <button key={t.id} type="button" onClick={() => dismiss(t.id)} role="status"
          className="pointer-events-auto flex w-full overflow-hidden rounded-md border border-ink-3 bg-ink-1 text-left shadow-sheet" data-testid="toast">
          <span className={`w-1 shrink-0 ${TONE_BAR[t.tone]}`} aria-hidden />
          <span className="px-4 py-3 text-small text-fg">{t.text}</span>
        </button>
      ))}
    </div>
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
