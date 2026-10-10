'use client';

import { useGame } from '@/game/store';
import { clockLabel } from '@/game/clock';
import type { WireItem } from '@/world/types';
import { ChatPanel } from './Social';

export const TONE_TEXT: Record<WireItem['tone'], string> = {
  gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', info: 'text-info', brass: 'text-brass',
};
const TONE_BAR: Record<WireItem['tone'], string> = {
  gain: 'bg-gain', loss: 'bg-loss', warn: 'bg-warn', info: 'bg-info', brass: 'bg-brass',
};

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
