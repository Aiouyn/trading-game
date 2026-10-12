'use client';

import { useState } from 'react';
import { RANKS } from '@/content/lifestyle';
import { ACHIEVEMENTS } from '@/content/progression';
import { compactMoney, money } from '@/game/format';
import { useGame } from '@/game/store';
import { t } from '@/i18n';
import { COUNTRIES } from '@/world/players';
import type { BoardRow } from '@/world/types';
import type { DirectoryRow } from '@/world/view';
import { BrassChip, Button, Card, CardHeader, Chip, ConfirmButton, Modal, NumberField, Select, Tabs, TextField } from './ui';
import { VisitSections } from './apps/sixd/CollectionPage';

type BoardId = 'netWorth' | 'chapter' | 'climber' | 'tycoon' | 'trader' | 'prestige' | 'landlord' | 'alliance' | 'mostWanted' | 'defender' | 'country';

const signed = (v: number) => (v >= 0 ? '+' : '') + compactMoney(v);
/** Small text helpers: the strings are built here, so the JSX holds only translated words and separators. */
const br = (x: string) => `[${x}]`;
const q = (x: string) => `“${x}”`;
const dot = (x: string) => `· ${x}`;
const lead = (x: string) => ` ${x}`;
/** Members of an alliance out of its twenty seats. */
const seats = (n: number) => `${n}/20`;
const BOARDS: { id: BoardId; fmt: (v: number) => string }[] = [
  { id: 'netWorth', fmt: compactMoney },
  { id: 'chapter', fmt: signed },
  { id: 'climber', fmt: (v) => `×${Math.exp(v).toFixed(2)}` },
  { id: 'tycoon', fmt: (v) => t('social.perDay', { amount: compactMoney(v) }) },
  { id: 'trader', fmt: signed },
  { id: 'prestige', fmt: (v) => t('social.pp', { n: Math.round(v).toLocaleString('en-US') }) },
  { id: 'landlord', fmt: compactMoney },
  { id: 'alliance', fmt: compactMoney },
  { id: 'defender', fmt: (v) => t('social.pts', { n: Math.round(v) }) },
  { id: 'mostWanted', fmt: (v) => t('social.notoriety', { n: Math.round(v) }) },
  { id: 'country', fmt: compactMoney },
];

/**
 * The leaderboards, players, alliances, deals and Hall of Fame of the old Social screen. The Messages app mounts
 * it on its Social tab (velvet-desktop-os.md, Messages: contacts, offers, rivals), so deals, alliances and the
 * profile modal stay reachable from the shell.
 */
export function SocialView() {
  const [tab, setTab] = useState<'boards' | 'players' | 'alliances' | 'deals' | 'hall'>('boards');
  const me = useGame((s) => s.me)!;
  const offers = me.deals.filter((d) => d.status === 'offered' && d.toId === me.player.id).length;
  return (
    <div className="flex flex-col gap-4" data-testid="social-screen">
      <Tabs
        tabs={[
          { id: 'boards', label: t('social.tab.boards') },
          { id: 'players', label: t('social.tab.players') },
          { id: 'alliances', label: t('social.tab.alliances') },
          { id: 'deals', label: t('social.tab.deals'), badge: offers },
          { id: 'hall', label: t('social.tab.hall') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'boards' && <Boards />}
      {tab === 'players' && <Players />}
      {tab === 'alliances' && <Alliances />}
      {tab === 'deals' && <Deals />}
      {tab === 'hall' && <Hall />}
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
          <button key={b.id} type="button" onClick={() => setBoard(b.id)} className={`block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-small lg:w-full ${board === b.id ? 'bg-ink-2 text-fg' : 'text-fg-muted hover:bg-ink-2'}`} data-testid={`board-${b.id}`}>{t(`social.board.${b.id}`)}</button>
        ))}
      </Card>
      <Card data-testid="leaderboard">
        <CardHeader
          title={t(`social.board.${board}`)}
          sub={t(`social.board.${board}.hint`)}
          right={myPos ? <BrassChip>{t('social.you', { pos: myPos, total: pub.players })}</BrassChip> : undefined}
        />
        <ol>
          {rows.map((r, i) => (
            <li key={r.id} className={`flex items-center gap-3 border-t border-ink-2 px-4 py-2.5 ${r.id === me.player.id ? 'bg-brass/[0.06]' : ''}`}>
              <span className={`num w-8 text-right ${i < 3 ? 'text-brass-hi' : 'text-fg-faint'}`}>{i + 1}</span>
              <button type="button" onClick={() => board !== 'alliance' && openProfile(r.id)} className="min-w-0 flex-1 truncate text-left text-small hover:underline">
                {r.name} {r.npc && <span className="text-caption text-fg-faint">{dot(t('social.npc'))}</span>}
              </button>
              {r.rankId && <span className="text-caption text-fg-faint">{RANKS.find((x) => x.id === r.rankId)?.name}</span>}
              {r.country && <span className="num text-caption text-fg-faint">{r.country}</span>}
              <span className="num w-28 text-right text-small">{spec.fmt(r.value)}</span>
            </li>
          ))}
          {!rows.length && <li className="px-4 py-6 text-center text-small text-fg-faint">{t('social.nobody')}</li>}
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
        <TextField value={q} onChange={setQ} placeholder={t('social.players.search')} className="h-9 flex-1" />
        <label className="flex items-center gap-2 text-caption text-fg-muted">
          <input type="checkbox" checked={onlyHumans} onChange={(e) => setOnlyHumans(e.target.checked)} /> {t('social.humansOnly')}
        </label>
      </div>
      <ul>
        {list.slice(0, 200).map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => openProfile(d.id)} className="flex w-full items-center gap-3 border-t border-ink-2 px-4 py-2.5 text-left hover:bg-ink-2" data-testid={`player-${d.handle}`}>
              <span className={`h-2 w-2 rounded-full ${d.online ? 'bg-gain' : 'bg-ink-3'}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-small">{d.handle}{d.allianceTag ? <span className="text-fg-faint">{lead(br(d.allianceTag))}</span> : ''}{d.npc ? <span className="text-caption text-fg-faint">{lead(dot(t('social.npc')))}</span> : ''}</span>
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
        {d.allianceTag && <Chip>{br(d.allianceTag)}</Chip>}
        {d.npc && <Chip>{t('social.npc')}</Chip>}
        <Chip className={d.online ? 'border-gain/50 text-gain' : ''}>{d.online ? t('social.online') : t('social.offline')}</Chip>
      </div>
      {d.bio && <p className="mt-3 text-small text-fg-muted">{q(d.npc ? t(`npc.bio.${d.id}`) : d.bio)}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 text-small sm:grid-cols-4">
        <div><div className="label">{t('common.netWorth')}</div><div className="num">{compactMoney(d.netWorth)}</div></div>
        <div><div className="label">{t('social.prestige')}</div><div className="num">{Math.round(d.prestige)}</div></div>
        <div><div className="label">{t('social.businesses')}</div><div className="num">{d.businesses}</div></div>
        <div><div className="label">{t('social.properties')}</div><div className="num">{d.properties}</div></div>
        <div><div className="label">{t('social.reputation')}</div><div className="num">{Math.round(d.reputation)}</div></div>
        {d.notoriety > 0 && <div><div className="label">{t('social.notorietyLabel')}</div><div className="num text-loss">{Math.round(d.notoriety)}</div></div>}
      </div>
      {!self && <VisitSections playerId={d.id} />}
      {!self && (
        <div className="mt-5 border-t border-ink-2 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openDm(me.player.id < d.id ? `dm:${me.player.id}:${d.id}` : `dm:${d.id}:${me.player.id}`)}>{t('social.message')}</Button>
          </div>
          <div className="mt-4">
            <div className="label mb-2">{t('social.deal.offer')}</div>
            <div className="grid grid-cols-2 gap-2">
              <Select label={t('social.deal.kind')} value={kind} onChange={setKind} options={[{ value: 'loan', label: t('social.deal.loan') }, { value: 'transfer', label: t('social.deal.gift') }]} />
              <NumberField label="$" value={amount} onChange={setAmount} />
              {kind === 'loan' && <NumberField label={t('social.deal.rate')} value={rate} onChange={setRate} suffix={t('social.deal.rateSuffix')} />}
              {kind === 'loan' && <NumberField label={t('social.deal.term')} value={term} onChange={setTerm} suffix={t('social.deal.termSuffix')} />}
            </div>
            <Button size="sm" variant="brass" className="mt-2" onClick={() => act({ type: 'deal.offer', kind, toId: d.id, amount: Number(amount), rate: Number(rate) / 100, termDays: Number(term), note: '' }, { success: t('social.deal.sent') })}>{t('social.deal.send')}</Button>
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
          <h3 className="font-serif text-title">{mine.name} <span className="text-fg-faint">{br(mine.tag)}</span></h3>
          {mine.motto && <p className="text-small text-fg-muted">{q(mine.motto)}</p>}
          <p className="num mt-2 text-small">{t('social.treasury', { amount: money(mine.treasury) })}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <NumberField value={amt} onChange={setAmt} className="h-9 w-36" suffix="$" />
            <Button size="sm" onClick={() => act({ type: 'alliance.deposit', amount: Number(amt) })}>{t('social.deposit')}</Button>
            {mine.members[me.player.id] !== 'member' && <Button size="sm" onClick={() => act({ type: 'alliance.withdraw', amount: Number(amt) })}>{t('social.withdraw')}</Button>}
          </div>
          <ul className="mt-3">
            {Object.entries(mine.members).map(([id, role]) => (
              <li key={id} className="flex items-center justify-between border-t border-ink-2 py-2 text-small">
                <span>{handle(id)} <span className="text-caption text-fg-faint">{dot(t(`social.role.${role}`))}</span></span>
                {mine.ownerId === me.player.id && id !== me.player.id && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => act({ type: 'alliance.promote', playerId: id })}>{role === 'officer' ? t('social.demote') : t('social.promote')}</Button>
                    <ConfirmButton confirm={t('social.remove')} onConfirm={() => act({ type: 'alliance.kick', playerId: id })}>{t('social.kick')}</ConfirmButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3"><ConfirmButton confirm={t('social.leave')} onConfirm={() => act({ type: 'alliance.leave' })}>{t('social.leaveAlliance')}</ConfirmButton></div>
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="font-serif text-title">{t('social.found.title')}</h3>
          <p className="mt-1 text-small text-fg-muted">{t('social.found.charter')}</p>
          <div className="mt-3 flex flex-col gap-2">
            <TextField value={name} onChange={setName} placeholder={t('social.found.name')} maxLength={32} />
            <TextField value={tag} onChange={(v) => setTag(v.toUpperCase())} placeholder={t('social.found.tag')} maxLength={5} />
            <TextField value={motto} onChange={setMotto} placeholder={t('social.found.motto')} maxLength={80} />
            <Button variant="brass" onClick={() => act({ type: 'alliance.create', name, tag, motto }, { success: t('social.found.done') })}>{t('social.found.button')}</Button>
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title={t('social.all')} />
        <ul>
          {(pub?.alliances ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 border-t border-ink-2 px-4 py-2.5 text-small">
              <span>{a.name} <span className="text-fg-faint">{br(a.tag)} · {seats(Object.keys(a.members).length)}</span></span>
              {!mine && <Button size="sm" onClick={() => act({ type: 'alliance.join', allianceId: a.id }, { success: t('social.joined', { name: a.name }) })}>{t('social.join')}</Button>}
            </li>
          ))}
          {!(pub?.alliances ?? []).length && <li className="px-4 py-6 text-center text-small text-fg-faint">{t('social.noAlliances')}</li>}
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
  if (!deals.length) return <Card className="p-8 text-center text-small text-fg-faint">{t('social.deals.none')}</Card>;
  return (
    <Card>
      <ul>
        {deals.map((d) => {
          const incoming = d.toId === me.player.id;
          const who = incoming ? t('social.deal.from', { name: handle(d.fromId) }) : t('social.deal.to', { name: handle(d.toId) });
          const terms = d.kind === 'loan' ? ` ${t('social.deal.at', { rate: (d.rate * 100).toFixed(1), days: d.termDays })}` : '';
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 border-t border-ink-2 px-4 py-3 text-small">
              <span>{d.kind === 'loan' ? t('social.deal.loan') : t('social.deal.gift')} {who}</span>
              <span className="num">{money(d.amount)}{terms}</span>
              {d.outstanding !== undefined && d.status === 'active' && <span className="num text-warn">{t('social.deal.owed', { amount: money(d.outstanding) })}</span>}
              <Chip>{t(`social.status.${d.status}`)}</Chip>
              <span className="ml-auto flex gap-2">
                {incoming && d.status === 'offered' && (
                  <>
                    <Button size="sm" variant="brass" onClick={() => act({ type: 'deal.respond', dealId: d.id, accept: true })}>{t('social.deal.accept')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => act({ type: 'deal.respond', dealId: d.id, accept: false })}>{t('social.deal.decline')}</Button>
                  </>
                )}
                {!incoming && d.status === 'offered' && <Button size="sm" variant="ghost" onClick={() => act({ type: 'deal.cancel', dealId: d.id })}>{t('social.deal.cancel')}</Button>}
                {incoming && d.status === 'active' && <Button size="sm" onClick={() => act({ type: 'deal.repay', dealId: d.id, amount: d.outstanding ?? 0 })}>{t('social.deal.repayAll')}</Button>}
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
        <h3 className="font-serif text-title">{t('social.chapter', { n: pub.chapter.number })}</h3>
        <p className="text-small text-fg-muted">{t('social.hall.body', { days: Math.max(0, Math.round(left / 720 / 24)) })}</p>
      </Card>
      {pub.hallOfFame.length === 0 ? <Card className="p-8 text-center text-small text-fg-faint">{t('social.hall.none')}</Card> : pub.hallOfFame.map((h) => (
        <Card key={h.chapter} className="p-4">
          <h3 className="font-serif text-title">{t('social.chapter', { n: h.chapter })}</h3>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">{h.richest.map((r, i) => <li key={r.id} className="text-small">{i + 1}. {r.name} <span className="num text-fg-faint">+{compactMoney(r.value)}</span></li>)}</ol>
        </Card>
      ))}
      <Card className="p-4">
        <h3 className="font-serif text-title">{t('social.economy')}</h3>
        <p className="text-small text-fg-muted">{t('social.economy.body', { mult: pub.economy.stabilizer.sinkMult.toFixed(2), index: pub.economy.moneyIndex.toFixed(3) })}</p>
        <EconomyTable pub={pub} />
      </Card>
      <p className="text-center text-caption text-fg-faint">{t('social.hall.footer', { achievements: ACHIEVEMENTS.length, players: pub.players, online: pub.online })}</p>
    </div>
  );
}

function EconomyTable({ pub }: { pub: NonNullable<ReturnType<typeof useGame.getState>['pub']> }) {
  const f = Object.entries(pub.economy.faucets).filter(([, v]) => Math.abs(v) > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const s = Object.entries(pub.economy.sinks).filter(([, v]) => Math.abs(v) > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="mt-3 grid gap-4 text-small sm:grid-cols-2">
      <div><div className="label mb-1">{t('social.economy.created')}</div>{f.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-fg-muted">{k}</span><span className="num text-gain">{compactMoney(v)}</span></div>)}</div>
      <div><div className="label mb-1">{t('social.economy.destroyed')}</div>{s.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-fg-muted">{k}</span><span className="num text-loss">{compactMoney(v)}</span></div>)}</div>
    </div>
  );
}
