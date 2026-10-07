'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LIFE_BY_ID, RANKS } from '@/content/lifestyle';
import { ACHIEVEMENTS } from '@/content/progression';
import { compactMoney, money } from '@/game/format';
import { clockLabel } from '@/game/clock';
import { useGame } from '@/game/store';
import { COUNTRIES } from '@/world/players';
import type { BoardRow } from '@/world/types';
import type { DirectoryRow } from '@/world/view';
import { BrassChip, Button, Card, CardHeader, Chip, ConfirmButton, Modal, NumberField, Select, Tabs, TextField } from './ui';

type BoardId = 'netWorth' | 'chapter' | 'climber' | 'tycoon' | 'trader' | 'prestige' | 'landlord' | 'alliance' | 'mostWanted' | 'defender' | 'country';

const BOARDS: { id: BoardId; label: string; fmt: (v: number) => string; hint: string }[] = [
  { id: 'netWorth', label: 'Net worth', fmt: compactMoney, hint: 'The Gilt List: everything you own, minus what you owe.' },
  { id: 'chapter', label: 'Richest this chapter', fmt: (v) => (v >= 0 ? '+' : '') + compactMoney(v), hint: 'Net worth gained since the chapter began.' },
  { id: 'climber', label: 'Fastest climber', fmt: (v) => `×${Math.exp(v).toFixed(2)}`, hint: 'Growth this chapter, from a $100k floor so fresh accounts can’t game it.' },
  { id: 'tycoon', label: 'Tycoon', fmt: (v) => `${compactMoney(v)}/day`, hint: 'Business income per game day.' },
  { id: 'trader', label: 'Trader', fmt: (v) => (v >= 0 ? '+' : '') + compactMoney(v), hint: 'Realized trading profit.' },
  { id: 'prestige', label: 'Prestige', fmt: (v) => `${Math.round(v).toLocaleString('en-US')} PP`, hint: 'Status from lifestyle and homes.' },
  { id: 'landlord', label: 'Landlord', fmt: compactMoney, hint: 'Property value held.' },
  { id: 'alliance', label: 'Alliances', fmt: compactMoney, hint: 'Members’ net worth plus treasury.' },
  { id: 'defender', label: 'Defender', fmt: (v) => `${Math.round(v)} pts`, hint: 'Hostile sessions cut and cases won.' },
  { id: 'mostWanted', label: 'Most Wanted', fmt: (v) => `${Math.round(v)} notoriety`, hint: 'Opt-in, cosmetic only.' },
  { id: 'country', label: 'My country', fmt: compactMoney, hint: 'Net worth among players from your country.' },
];

export function SocialView() {
  const [tab, setTab] = useState<'boards' | 'players' | 'alliances' | 'deals' | 'hall' | 'chat'>('boards');
  const me = useGame((s) => s.me)!;
  const offers = me.deals.filter((d) => d.status === 'offered' && d.toId === me.player.id).length;
  return (
    <div className="flex flex-col gap-4" data-testid="social-view">
      <Tabs tabs={[{ id: 'boards', label: 'Leaderboards' }, { id: 'players', label: 'Players' }, { id: 'alliances', label: 'Alliances' }, { id: 'deals', label: 'Deals', badge: offers }, { id: 'hall', label: 'Hall of Fame' }, { id: 'chat', label: 'Chat' }]} value={tab} onChange={setTab} />
      {tab === 'boards' && <Boards />}
      {tab === 'players' && <Players />}
      {tab === 'alliances' && <Alliances />}
      {tab === 'deals' && <Deals />}
      {tab === 'hall' && <Hall />}
      {tab === 'chat' && <Card className="h-[70dvh]"><ChatPanel /></Card>}
      <ProfileModal />
    </div>
  );
}

function Boards() {
  const pub = useGame((s) => s.pub);
  const me = useGame((s) => s.me)!;
  const openProfile = useGame((s) => s.openProfile);
  const [board, setBoard] = useState<BoardId>('netWorth');
  if (!pub) return null;
  const spec = BOARDS.find((b) => b.id === board)!;
  const rows: BoardRow[] = board === 'country' ? pub.boards.country[me.player.country] ?? [] : (pub.boards[board] as BoardRow[]);
  const myPos = pub.boards.nwRank[me.player.id];
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr] [&>*]:min-w-0">
      <Card className="flex gap-1 overflow-x-auto p-2 lg:block">
        {BOARDS.map((b) => (
          <button key={b.id} type="button" onClick={() => setBoard(b.id)} className={`block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-small lg:w-full ${board === b.id ? 'bg-ink-2 text-fg' : 'text-fg-muted hover:bg-ink-2'}`} data-testid={`board-${b.id}`}>{b.label}</button>
        ))}
      </Card>
      <Card data-testid="leaderboard">
        <CardHeader title={spec.label} sub={spec.hint} right={myPos ? <BrassChip>You: #{myPos} of {pub.players}</BrassChip> : undefined} />
        <ol>
          {rows.map((r, i) => (
            <li key={r.id} className={`flex items-center gap-3 border-t border-ink-2 px-4 py-2.5 ${r.id === me.player.id ? 'bg-brass/[0.06]' : ''}`}>
              <span className={`num w-8 text-right ${i < 3 ? 'text-brass-hi' : 'text-fg-faint'}`}>{i + 1}</span>
              <button type="button" onClick={() => board !== 'alliance' && openProfile(r.id)} className="min-w-0 flex-1 truncate text-left text-small hover:underline">
                {r.name} {r.npc && <span className="text-caption text-fg-faint">· NPC</span>}
              </button>
              {r.rankId && <span className="text-caption text-fg-faint">{RANKS.find((x) => x.id === r.rankId)?.name}</span>}
              {r.country && <span className="num text-caption text-fg-faint">{r.country}</span>}
              <span className="num w-28 text-right text-small">{spec.fmt(r.value)}</span>
            </li>
          ))}
          {!rows.length && <li className="px-4 py-6 text-center text-small text-fg-faint">Nobody here yet.</li>}
        </ol>
      </Card>
    </div>
  );
}

function Players() {
  const directory = useGame((s) => s.directory);
  const openProfile = useGame((s) => s.openProfile);
  const [q, setQ] = useState('');
  const [onlyHumans, setOnlyHumans] = useState(false);
  const list = directory.filter((d) => (!onlyHumans || !d.npc) && (!q || d.handle.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.netWorth - a.netWorth);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <TextField value={q} onChange={setQ} placeholder="Search players" className="h-9 flex-1" />
        <label className="flex items-center gap-2 text-caption text-fg-muted"><input type="checkbox" checked={onlyHumans} onChange={(e) => setOnlyHumans(e.target.checked)} /> Humans only</label>
      </div>
      <ul>
        {list.slice(0, 200).map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => openProfile(d.id)} className="flex w-full items-center gap-3 border-t border-ink-2 px-4 py-2.5 text-left hover:bg-ink-2" data-testid={`player-${d.handle}`}>
              <span className={`h-2 w-2 rounded-full ${d.online ? 'bg-gain' : 'bg-ink-3'}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-small">{d.handle}{d.allianceTag ? <span className="text-fg-faint"> [{d.allianceTag}]</span> : ''}{d.npc ? <span className="text-caption text-fg-faint"> · NPC</span> : ''}</span>
              <span className="text-caption text-fg-faint">{RANKS.find((r) => r.id === d.rankId)?.name}</span>
              <span className="num w-24 text-right text-small">{compactMoney(d.netWorth)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ProfileModal() {
  const id = useGame((s) => s.profileId);
  const openProfile = useGame((s) => s.openProfile);
  const directory = useGame((s) => s.directory);
  const me = useGame((s) => s.me);
  const act = useGame((s) => s.act);
  const openDm = useGame((s) => s.openDm);
  const [kind, setKind] = useState<'loan' | 'transfer'>('loan');
  const [amount, setAmount] = useState('10000');
  const [rate, setRate] = useState('10');
  const [term, setTerm] = useState('10');
  const d: DirectoryRow | undefined = directory.find((x) => x.id === id);
  if (!d || !me) return null;
  const self = d.id === me.player.id;
  return (
    <Modal open={!!id} onClose={() => openProfile(null)} title={<span>{d.handle}{d.title ? <span className="ml-2 text-small text-brass">{d.title}</span> : null}</span>} testId="profile-modal">
      <div className="flex flex-wrap gap-2">
        <BrassChip>{RANKS.find((r) => r.id === d.rankId)?.name}</BrassChip>
        <Chip>{COUNTRIES.find((c) => c.code === d.country)?.name ?? d.country}</Chip>
        {d.allianceTag && <Chip>[{d.allianceTag}]</Chip>}
        {d.npc && <Chip>NPC</Chip>}
        <Chip className={d.online ? 'border-gain/50 text-gain' : ''}>{d.online ? 'Online' : 'Offline'}</Chip>
      </div>
      {d.bio && <p className="mt-3 text-small text-fg-muted">“{d.bio}”</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 text-small sm:grid-cols-4">
        <div><div className="label">Net worth</div><div className="num">{compactMoney(d.netWorth)}</div></div>
        <div><div className="label">Prestige</div><div className="num">{Math.round(d.prestige)}</div></div>
        <div><div className="label">Businesses</div><div className="num">{d.businesses}</div></div>
        <div><div className="label">Properties</div><div className="num">{d.properties}</div></div>
        <div><div className="label">Reputation</div><div className="num">{Math.round(d.reputation)}</div></div>
        {d.notoriety > 0 && <div><div className="label">Notoriety</div><div className="num text-loss">{Math.round(d.notoriety)}</div></div>}
      </div>
      {d.lifestyle.length > 0 && (
        <div className="mt-4">
          <div className="label">Showcase</div>
          <div className="mt-1 flex flex-wrap gap-1.5">{[...new Set(d.lifestyle)].slice(0, 12).map((i) => <Chip key={i}>{LIFE_BY_ID.get(i)?.name ?? i}</Chip>)}</div>
        </div>
      )}
      {!self && (
        <div className="mt-5 border-t border-ink-2 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openDm(me.player.id < d.id ? `dm:${me.player.id}:${d.id}` : `dm:${d.id}:${me.player.id}`)}>Message</Button>
          </div>
          <div className="mt-4">
            <div className="label mb-2">Offer a deal</div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Kind" value={kind} onChange={setKind} options={[{ value: 'loan', label: 'Loan' }, { value: 'transfer', label: 'Gift (5% tax)' }]} />
              <NumberField label="$" value={amount} onChange={setAmount} />
              {kind === 'loan' && <NumberField label="Rate" value={rate} onChange={setRate} suffix="%/yr" />}
              {kind === 'loan' && <NumberField label="Term" value={term} onChange={setTerm} suffix="days" />}
            </div>
            <Button size="sm" variant="brass" className="mt-2" onClick={() => act({ type: 'deal.offer', kind, toId: d.id, amount: Number(amount), rate: Number(rate) / 100, termDays: Number(term), note: '' }, { success: 'Offer sent' })}>Send offer</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Alliances() {
  const pub = useGame((s) => s.pub);
  const me = useGame((s) => s.me)!;
  const directory = useGame((s) => s.directory);
  const act = useGame((s) => s.act);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [motto, setMotto] = useState('');
  const [amt, setAmt] = useState('1000');
  const mine = me.alliance;
  const handle = (id: string) => directory.find((d) => d.id === id)?.handle ?? id;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {mine ? (
        <Card className="p-4" data-testid="my-alliance">
          <h3 className="font-serif text-title">{mine.name} <span className="text-fg-faint">[{mine.tag}]</span></h3>
          {mine.motto && <p className="text-small text-fg-muted">“{mine.motto}”</p>}
          <p className="num mt-2 text-small">Treasury {money(mine.treasury)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <NumberField value={amt} onChange={setAmt} className="h-9 w-36" suffix="$" />
            <Button size="sm" onClick={() => act({ type: 'alliance.deposit', amount: Number(amt) })}>Deposit</Button>
            {mine.members[me.player.id] !== 'member' && <Button size="sm" onClick={() => act({ type: 'alliance.withdraw', amount: Number(amt) })}>Withdraw</Button>}
          </div>
          <ul className="mt-3">
            {Object.entries(mine.members).map(([id, role]) => (
              <li key={id} className="flex items-center justify-between border-t border-ink-2 py-2 text-small">
                <span>{handle(id)} <span className="text-caption text-fg-faint">· {role}</span></span>
                {mine.ownerId === me.player.id && id !== me.player.id && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => act({ type: 'alliance.promote', playerId: id })}>{role === 'officer' ? 'Demote' : 'Promote'}</Button>
                    <ConfirmButton confirm="Remove" onConfirm={() => act({ type: 'alliance.kick', playerId: id })}>Kick</ConfirmButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3"><ConfirmButton confirm="Leave" onConfirm={() => act({ type: 'alliance.leave' })}>Leave alliance</ConfirmButton></div>
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="font-serif text-title">Found an alliance</h3>
          <p className="mt-1 text-small text-fg-muted">$25,000 charter. Up to 20 members, a shared treasury, a private channel and a shared defense bonus.</p>
          <div className="mt-3 flex flex-col gap-2">
            <TextField value={name} onChange={setName} placeholder="Name" maxLength={32} />
            <TextField value={tag} onChange={(v) => setTag(v.toUpperCase())} placeholder="Tag (2–5)" maxLength={5} />
            <TextField value={motto} onChange={setMotto} placeholder="Motto" maxLength={80} />
            <Button variant="brass" onClick={() => act({ type: 'alliance.create', name, tag, motto }, { success: 'Alliance founded' })}>Found alliance</Button>
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title="All alliances" />
        <ul>
          {(pub?.alliances ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 border-t border-ink-2 px-4 py-2.5 text-small">
              <span>{a.name} <span className="text-fg-faint">[{a.tag}] · {Object.keys(a.members).length}/20</span></span>
              {!mine && <Button size="sm" onClick={() => act({ type: 'alliance.join', allianceId: a.id }, { success: `Joined ${a.name}` })}>Join</Button>}
            </li>
          ))}
          {!(pub?.alliances ?? []).length && <li className="px-4 py-6 text-center text-small text-fg-faint">No alliances yet. Be the first.</li>}
        </ul>
      </Card>
    </div>
  );
}

function Deals() {
  const me = useGame((s) => s.me)!;
  const directory = useGame((s) => s.directory);
  const act = useGame((s) => s.act);
  const handle = (id: string) => directory.find((d) => d.id === id)?.handle ?? id;
  const deals = me.deals.slice().reverse();
  if (!deals.length) return <Card className="p-8 text-center text-small text-fg-faint">No deals. Open a player’s profile to offer a loan or a gift.</Card>;
  return (
    <Card>
      <ul>
        {deals.map((d) => {
          const incoming = d.toId === me.player.id;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 border-t border-ink-2 px-4 py-3 text-small">
              <span>{d.kind === 'loan' ? 'Loan' : 'Gift'} {incoming ? `from ${handle(d.fromId)}` : `to ${handle(d.toId)}`}</span>
              <span className="num">{money(d.amount)}{d.kind === 'loan' ? ` at ${(d.rate * 100).toFixed(1)}% · ${d.termDays}d` : ''}</span>
              {d.outstanding !== undefined && d.status === 'active' && <span className="num text-warn">owed {money(d.outstanding)}</span>}
              <Chip>{d.status}</Chip>
              <span className="ml-auto flex gap-2">
                {incoming && d.status === 'offered' && <><Button size="sm" variant="brass" onClick={() => act({ type: 'deal.respond', dealId: d.id, accept: true })}>Accept</Button><Button size="sm" variant="ghost" onClick={() => act({ type: 'deal.respond', dealId: d.id, accept: false })}>Decline</Button></>}
                {!incoming && d.status === 'offered' && <Button size="sm" variant="ghost" onClick={() => act({ type: 'deal.cancel', dealId: d.id })}>Cancel</Button>}
                {incoming && d.status === 'active' && <Button size="sm" onClick={() => act({ type: 'deal.repay', dealId: d.id, amount: d.outstanding ?? 0 })}>Repay all</Button>}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Hall() {
  const pub = useGame((s) => s.pub);
  const tick = useGame((s) => s.frame?.tick ?? 0);
  if (!pub) return null;
  const left = pub.chapter.endTick - tick;
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h3 className="font-serif text-title">Chapter {pub.chapter.number}</h3>
        <p className="text-small text-fg-muted">The world never resets, but every 8 real weeks a chapter closes: the richest and fastest climbers of the chapter hang in the Hall of Fame. {Math.max(0, Math.round(left / 720 / 24))} real days left.</p>
      </Card>
      {pub.hallOfFame.length === 0 ? <Card className="p-8 text-center text-small text-fg-faint">The first chapter is still being written.</Card> : pub.hallOfFame.map((h) => (
        <Card key={h.chapter} className="p-4">
          <h3 className="font-serif text-title">Chapter {h.chapter}</h3>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">{h.richest.map((r, i) => <li key={r.id} className="text-small">{i + 1}. {r.name} <span className="num text-fg-faint">+{compactMoney(r.value)}</span></li>)}</ol>
        </Card>
      ))}
      <Card className="p-4">
        <h3 className="font-serif text-title">Economy</h3>
        <p className="text-small text-fg-muted">The Treasury levy (stabilizer) scales upkeep when money grows too fast: currently ×{pub.economy.stabilizer.sinkMult.toFixed(2)}. Money index {pub.economy.moneyIndex.toFixed(3)}.</p>
        <EconomyTable pub={pub} />
      </Card>
      <p className="text-center text-caption text-fg-faint">{ACHIEVEMENTS.length} achievements · {pub.players} players · {pub.online} online</p>
    </div>
  );
}

function EconomyTable({ pub }: { pub: NonNullable<ReturnType<typeof useGame.getState>['pub']> }) {
  const f = Object.entries(pub.economy.faucets).filter(([, v]) => Math.abs(v) > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const s = Object.entries(pub.economy.sinks).filter(([, v]) => Math.abs(v) > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2 text-small">
      <div><div className="label mb-1">Money created</div>{f.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-fg-muted">{k}</span><span className="num text-gain">{compactMoney(v)}</span></div>)}</div>
      <div><div className="label mb-1">Money destroyed</div>{s.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-fg-muted">{k}</span><span className="num text-loss">{compactMoney(v)}</span></div>)}</div>
    </div>
  );
}

/** Channels: world, your country, your alliance and direct messages. */
export function ChatPanel() {
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
    const list = [{ id: 'world', label: 'World' }, { id: `country:${me.player.country}`, label: `${me.player.country} country` }];
    if (me.player.allianceId) list.push({ id: `alliance:${me.player.allianceId}`, label: `Alliance ${me.alliance?.tag ?? ''}` });
    for (const ch of Object.keys(chat)) {
      if (!ch.startsWith('dm:')) continue;
      const other = ch.split(':').slice(1).find((x) => x !== me.player.id);
      list.push({ id: ch, label: `@${directory.find((d) => d.id === other)?.handle ?? 'player'}` });
    }
    if (dmTarget && !list.some((c) => c.id === dmTarget)) {
      const other = dmTarget.split(':').slice(1).find((x) => x !== me.player.id);
      list.push({ id: dmTarget, label: `@${directory.find((d) => d.id === other)?.handle ?? 'player'}` });
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
    <div className="flex h-full flex-col" data-testid="chat-panel">
      <div className="flex gap-1 overflow-x-auto border-b border-ink-2 px-3 py-2">
        {channels.map((c) => (
          <button key={c.id} type="button" onClick={() => setChannel(c.id)} className={`shrink-0 rounded-sm px-2 py-1 text-caption ${channel === c.id ? 'bg-ink-3 text-fg' : 'text-fg-faint hover:text-fg-muted'}`}>{c.label}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && <p className="text-center text-small text-fg-faint">No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className="mb-2">
            <span className={`text-small font-semibold ${m.playerId === me.player.id ? 'text-brass' : 'text-fg'}`}>{m.handle}</span>
            <span className="num ml-2 text-caption text-fg-faint">{clockLabel(m.tick, 720).split(' · ')[1]}</span>
            <p className="text-small break-words text-fg-muted">{m.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="flex gap-2 border-t border-ink-2 p-3">
        <TextField value={text} onChange={setText} placeholder="Say something" maxLength={280} className="h-10 flex-1" onEnter={send} testId="chat-input" />
        <Button onClick={send} testId="chat-send">Send</Button>
      </div>
    </div>
  );
}
