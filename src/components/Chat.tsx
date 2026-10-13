'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { npcChatMsg } from '@/world/text/npcChat';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import { usePublicPanel } from '@/game/usePublicPanel';
import { Button, TextField } from './ui';

/**
 * Chat channels: world, your country, your alliance and direct messages (velvet-desktop-os.md, Messages). The
 * Messages app shows it on its Chat tab; the strip's chat button and a profile's Message button open that tab.
 */
export function ChatPanel() {
  usePublicPanel('directory');
  const me = useGame((s) => s.me);
  const chat = useGame((s) => s.chat);
  const directory = useGame((s) => s.directory);
  const act = useGame((s) => s.act);
  const dmTarget = useGame((s) => s.dmTarget);
  const [channel, setChannel] = useState(dmTarget ?? 'world');
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const msgs = chat[channel] ?? [];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, channel]);
  const channels = useMemo(() => {
    if (!me) return [];
    const list = [
      { id: 'world', label: t('chat.world') },
      { id: `country:${me.player.country}`, label: t('chat.country', { country: me.player.country }) },
    ];
    if (me.player.allianceId) list.push({ id: `alliance:${me.player.allianceId}`, label: t('chat.alliance', { tag: me.alliance?.tag ?? '' }) });
    for (const ch of Object.keys(chat)) {
      if (!ch.startsWith('dm:')) continue;
      const other = ch.split(':').slice(1).find((x) => x !== me.player.id);
      list.push({ id: ch, label: t('chat.dm', { name: directory.find((d) => d.id === other)?.handle ?? t('chat.player') }) });
    }
    if (dmTarget && !list.some((c) => c.id === dmTarget)) {
      const other = dmTarget.split(':').slice(1).find((x) => x !== me.player.id);
      list.push({ id: dmTarget, label: t('chat.dm', { name: directory.find((d) => d.id === other)?.handle ?? t('chat.player') }) });
    }
    return list;
  }, [me, chat, directory, dmTarget]);
  if (!me) return null;
  const send = async () => {
    if (!text.trim()) return;
    const r = await act({ type: 'chat.send', channel, text });
    if (r.ok) setText('');
  };
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-panel">
      <div className="flex gap-1 overflow-x-auto border-b border-ink-2 px-3 py-2">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChannel(c.id)}
            aria-pressed={channel === c.id}
            className={`shrink-0 rounded-sm px-2 py-1 text-caption ${channel === c.id ? 'bg-ink-3 text-fg' : 'text-fg-faint hover:text-fg-muted'}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && <p className="text-center text-small text-fg-faint">{t('chat.empty')}</p>}
        {msgs.map((m) => {
          // a stored NPC line is shown in the viewer's language; the chat text itself stays English
          const line = directory.find((d) => d.id === m.playerId)?.npc ? npcChatMsg(m.text) : undefined;
          return (
            <div key={m.id} className="mb-2">
              <span className={`text-small font-semibold ${m.playerId === me.player.id ? 'text-brass' : 'text-fg'}`}>{m.handle}</span>
              <span className="num ml-2 text-caption text-fg-faint">{clockLabel(m.tick, 720).split(' · ')[1]}</span>
              <p className="text-small break-words text-fg-muted">{line ? t(line.key, line.vars) : m.text}</p>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="flex gap-2 border-t border-ink-2 p-3">
        <TextField value={text} onChange={setText} placeholder={t('chat.placeholder')} maxLength={280} className="h-10 flex-1" onEnter={send} testId="chat-input" />
        <Button onClick={send} testId="chat-send">{t('chat.send')}</Button>
      </div>
    </div>
  );
}
