'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { portfolio } from '@/engine';
import { PLAYER, useGame } from '@/game/store';
import { useIsPhone } from '@/game/useMedia';
import { clockParts, SPEEDS } from '@/game/clock';
import { compactMoney, money, price, signedMoney, signedPct, toneText, tone } from '@/game/format';
import { sparkline } from '@/game/history';
import { rankProgress } from '@/game/rank';
import { ChartCard, Positions, TickerStrip, Watchlist, seriesInfo } from '../Market';
import { Sparkline } from '../ui';
import { OpenOrders, OrderPad } from '../OrderPad';
import { PortfolioView } from '../Portfolio';
import { Toasts, TradeSheet } from '../Shell';
import { Glyph, MotorCar, Room } from './icons';
import s from './workspace.module.css';

type Look = 'daylight' | 'afterhours' | 'pocket';
type AppId = 'market' | 'portfolio' | 'life' | 'wire' | 'appearance';
type DeskWindow = { app: AppId; x: number; y: number; maximized: boolean; minimized: boolean };
type Preferences = { look: Look; color: string; car: number; room: string; goal: boolean };
const prefKey = 'port-avalon-desktop-v2';
const initialPrefs: Preferences = { look: 'afterhours', color: '#7b8591', car: 1, room: 'Study', goal: false };
const looks: Record<Look, { name: string; subtitle: string; description: string }> = {
  daylight: { name: 'Platinum', subtitle: 'Personal workspace', description: 'Cool white, graphite typography, precise borders. A minimal light workspace.' },
  afterhours: { name: 'Carbon', subtitle: 'Personal workspace', description: 'Neutral charcoal, silver controls, quiet depth. A focused desktop for building capital.' },
  pocket: { name: 'Obsidian', subtitle: 'Personal workspace', description: 'Near-black surfaces with a restrained violet accent. A sharper, more technical atmosphere.' },
};
const apps: { id: AppId; name: string; subtitle: string }[] = [
  { id: 'market', name: 'Markets', subtitle: 'Trading terminal' },
  { id: 'portfolio', name: 'Portfolio', subtitle: 'Capital & performance' },
  { id: 'life', name: 'My life', subtitle: 'Residence & collection' },
  { id: 'wire', name: 'The Wire', subtitle: 'Market intelligence' },
  { id: 'appearance', name: 'Appearance', subtitle: 'Workspace settings' },
];
const cars = [{ name: 'City hatchback', price: 8000 }, { name: 'Halden GT', price: 240000 }, { name: 'Marchetti Furia', price: 1200000 }];

function loadPreferences(): Preferences {
  try {
    const current = localStorage.getItem(prefKey);
    const data = JSON.parse(current ?? localStorage.getItem('port-avalon-desktop-v1') ?? '{}');
    return {
      look: current && Object.hasOwn(looks, data.look) ? data.look : initialPrefs.look,
      color: /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : initialPrefs.color,
      car: Number.isInteger(data.car) && data.car >= 0 && data.car < cars.length ? data.car : initialPrefs.car,
      room: ['Study', 'Garage', 'Gallery'].includes(data.room) ? data.room : initialPrefs.room,
      goal: data.goal === true,
    };
  } catch { return initialPrefs; }
}

function Lifestyle({ prefs, update, equity }: { prefs: Preferences; update: (p: Partial<Preferences>) => void; equity: number }) {
  const [tab, setTab] = useState<'garage' | 'home'>('garage');
  const [driving, setDriving] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [art, setArt] = useState<'Sunrise' | 'Shapes'>('Sunrise');
  const car = cars[prefs.car];
  return <div className={s.lifestyle}>
    <div className={s.lifeIntro}><span className={s.eyebrow}>PRIVATE COLLECTION</span><span className={s.previewBadge}>Lifestyle preview</span></div>
    <div className={s.lifeTabs}><button aria-pressed={tab === 'garage'} onClick={() => { setTab('garage'); setDriving(false); setPortrait(false); }}>The garage</button><button aria-pressed={tab === 'home'} onClick={() => { setTab('home'); setDriving(false); setPortrait(false); }}>Your place</button></div>
    {tab === 'garage' ? <>
      <div className={`${s.carStage} ${driving ? s.isDriving : ''} ${portrait ? s.portrait : ''}`} data-testid="car-preview">
        {driving && <><div className={s.driveSun} /><div className={s.hills} /><div className={s.road}><i /><i /><i /><i /></div></>}
        <span className={s.stageLabel}>{driving ? 'PORT AVALON / THE COAST ROAD' : portrait ? 'COLLECTION PORTRAIT / YOUR STYLE' : 'ON YOUR WISHLIST'}</span>
        <div className={s.motor}><MotorCar color={prefs.color} sports={prefs.car > 0} /></div>
        <span className={s.carCaption}>{driving ? 'Coastal route / Port Avalon' : portrait ? `${car.name} / Collection study` : 'Exterior / Side profile'}</span>
        {(driving || portrait) && <button className={s.backToGarage} onClick={() => { setDriving(false); setPortrait(false); }}><Glyph name="back" size={15} /> Back to garage</button>}
      </div>
      <div className={s.carDetails}><div><h2>{car.name}</h2><p>{prefs.car === 0 ? 'Compact / Personal mobility' : 'Grand touring / Private collection'}</p></div><div><strong>{money(car.price).replace('.00', '')}</strong><span>proposed catalog price</span></div></div>
      <div className={s.carChoices} aria-label="Choose a car">{cars.map((item, index) => <button key={item.name} aria-pressed={prefs.car === index} onClick={() => update({ car: index })}>{item.name}</button>)}</div>
      <div className={s.paintRow}><span>Exterior finish</span><div>{[{ name: 'Silver', color: '#7b8591' }, { name: 'Sage', color: '#7eaa96' }, { name: 'Cream', color: '#e8d7b4' }, { name: 'Midnight', color: '#4b6377' }, { name: 'Graphite', color: '#444950' }].map(item => <button key={item.name} title={item.name} aria-label={`Paint ${item.name}`} aria-pressed={prefs.color === item.color} style={{ backgroundColor: item.color }} onClick={() => update({ color: item.color })} />)}</div></div>
      <div className={s.lifeActions}><button className={s.primary} onClick={() => { setDriving(true); setPortrait(false); }}>Preview a drive <Glyph name="arrow" size={17} /></button><button className={s.secondary} onClick={() => update({ goal: !prefs.goal })}><Glyph name={prefs.goal ? 'check' : 'home'} size={17} />{prefs.goal ? 'On your home screen' : 'Set as my goal'}</button><button className={s.secondary} aria-label="Preview a collection portrait" onClick={() => { setPortrait(true); setDriving(false); }}><Glyph name="camera" size={18} /></button></div>
      <p className={s.lifeNote}>Design preview: personalize, display, and enjoy. Ownership and purchases will need the lifestyle economy; this preview doesn’t spend your portfolio.</p>
    </> : <>
      <div className={s.roomPreview} data-testid="room-preview"><Room rank={prefs.room === 'Gallery' ? 4 : 0} favorite={prefs.room === 'Garage'} color={prefs.color} art={art} /><span className={s.roomName}>{prefs.room === 'Gallery' ? `${art} / your first art wall` : prefs.room === 'Garage' ? 'A home for the whole collection' : 'Your little corner of Port Avalon'}</span></div>
      <h2>Private residence</h2><p className={s.lifeCopy}>Configure your study, garage, and gallery. Each property is a setting for your collection and the people you invite.</p>
      <div className={s.carChoices} aria-label="Choose a room">{['Study', 'Garage', 'Gallery'].map(room => <button key={room} aria-pressed={prefs.room === room} onClick={() => update({ room })}>{room}</button>)}</div>
      {prefs.room === 'Gallery' && <div className={s.paintRow}><span>On the wall</span><button className={s.secondary} onClick={() => setArt(art === 'Sunrise' ? 'Shapes' : 'Sunrise')}>{art} <Glyph name="paint" size={16} /></button></div>}
      <p className={s.lifeNote}>Interior and hosting concepts. Previewing a room doesn’t buy a house or add an asset to your net worth.</p>
    </>}
    {prefs.goal && <div className={s.goalProgress}><span>Net worth toward your wish <b>{Math.min(100, Math.round(equity / car.price * 100))}%</b></span><div><i style={{ width: `${Math.min(100, Math.max(0, equity / car.price * 100))}%` }} /></div></div>}
  </div>;
}

export function DesktopOS() {
  const world = useGame(state => state.world)!;
  const wire = useGame(state => state.wire);
  const paused = useGame(state => state.paused);
  const speed = useGame(state => state.speed);
  const selected = useGame(state => state.selected);
  const setTab = useGame(state => state.setTab);
  const phone = useIsPhone();
  const pf = portfolio(world, PLAYER);
  const rank = rankProgress(pf.peakEquity, pf.equity, pf.startingCash);
  const clock = clockParts(world.tick, world.config.ticksPerDay);
  const [prefs, setPrefs] = useState(loadPreferences);
  const [windows, setWindows] = useState<DeskWindow[]>([]);
  const [focused, setFocused] = useState<AppId | null>(null);
  const history = useGame(state => state.history)!;
  useGame(state => state.historyRev);
  const desktop = useRef<HTMLDivElement>(null);
  const drag = useRef<{ app: AppId; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const activeWindow = windows.find(item => item.app === focused && !item.minimized);
  const invested = pf.positions.reduce((total, item) => total + item.marketValue, 0);

  function updatePreferences(partial: Partial<Preferences>) {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    try { localStorage.setItem(prefKey, JSON.stringify(next)); } catch { /* Appearance works without storage. */ }
  }

  function open(app: AppId) {
    if (app === 'market' || app === 'portfolio') setTab(app);
    setWindows(previous => {
      // One financial workspace keeps charts and positions readable; other apps are independent windows.
      const remaining = previous.filter(item => item.app !== app && !((app === 'market' || app === 'portfolio') && (item.app === 'market' || item.app === 'portfolio')));
      const existing = previous.find(item => item.app === app);
      return [...remaining, existing ? { ...existing, minimized: false } : { app, x: 0, y: 0, maximized: false, minimized: false }];
    });
    setFocused(app);
  }

  function showHome() {
    setWindows(previous => previous.map(item => ({ ...item, minimized: true })));
    setFocused(null);
  }

  function close(app: AppId) {
    const remaining = windows.filter(item => item.app !== app);
    setWindows(remaining);
    setFocused([...remaining].reverse().find(item => !item.minimized)?.app ?? null);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || useGame.getState().tradeSheetOpen) return;
      setWindows(previous => previous.map(item => ({ ...item, minimized: true })));
      setFocused(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function beginDrag(event: PointerEvent<HTMLDivElement>, item: DeskWindow) {
    if (phone || item.maximized || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { app: item.app, pointerX: event.clientX, pointerY: event.clientY, x: item.x, y: item.y };
    setFocused(item.app);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId) || !desktop.current) return;
    const bounds = desktop.current.getBoundingClientRect();
    const shell = event.currentTarget.parentElement!;
    const width = shell.getBoundingClientRect().width;
    const current = drag.current;
    const x = Math.max(-32, Math.min(bounds.width - width - 32, current.x + event.clientX - current.pointerX));
    const y = Math.max(-110, Math.min(bounds.height - 240, current.y + event.clientY - current.pointerY));
    setWindows(previous => previous.map(item => item.app === current.app ? { ...item, x, y } : item));
  }

  function renderWindow(app: AppId) {
    if (app === 'appearance') return <div className={s.appearance}>
      <span className={s.eyebrow}>WORKSPACE SETTINGS</span><h2>Appearance</h2><p>Three restrained themes. The same account and trading workspace.</p>
      <div className={s.lookChoices}>{(Object.keys(looks) as Look[]).map((look, index) => <button key={look} className={`${s.lookCard} ${s[look]}`} aria-pressed={prefs.look === look} data-testid={`look-${look}`} onClick={() => updatePreferences({ look })}><div className={s.lookMini}><span /><i /><b /><em /><div><Glyph name="market" size={17} /><Glyph name="portfolio" size={17} /><Glyph name="life" size={17} /></div></div><span className={s.lookNumber}>0{index + 1}</span><strong>{looks[look].name}</strong><p>{looks[look].description}</p><span className={s.lookSelect}>{prefs.look === look ? <><Glyph name="check" size={16} /> Your current look</> : <>Try this direction <Glyph name="arrow" size={16} /></>}</span></button>)}</div>
      <div className={s.designOpinion}><b>Carbon / Default</b><p>Neutral surfaces, one consistent icon system, and color reserved for information.</p></div>
    </div>;
    if (app === 'life') return <Lifestyle prefs={prefs} update={updatePreferences} equity={pf.equity} />;
    if (app === 'wire') return <div className={s.wireApp}><span className={s.eyebrow}>MARKET INTELLIGENCE</span><h2>The Wire</h2><p>Latest events in Port Avalon.</p>{wire.length === 0 ? <div className={s.quietWire}>No new market events. Headlines appear as the simulation runs.</div> : wire.slice(0, 20).map(item => <article key={item.id}><span>{item.time}</span><b className={toneText[tone(item.tone === 'loss' ? -1 : item.tone === 'gain' ? 1 : 0)]}>{item.tag}</b><p>{item.text}</p></article>)}</div>;
    return <div className={s.financeWorkspace} key={prefs.look}>
      <div className={s.financeMain} data-testid={phone ? 'phone-main' : 'main-column'} data-tab={app}>{app === 'portfolio' ? <PortfolioView phone={phone} /> : <>{phone && <TickerStrip />}<ChartCard phone={phone} /><Positions phone={phone} /><OpenOrders /></>}</div>
      {!phone && <aside className={s.financeSide} data-testid="side-column"><OrderPad /><Watchlist /></aside>}
    </div>;
  }

  return <div ref={desktop} className={`${s.os} ${s[prefs.look]}`} data-layout={phone ? 'phone' : 'desktop'} data-look={prefs.look} data-testid="desktop-os">
    <div className={s.wallpaper} aria-hidden="true"><div className={s.wallpaperOrb} /><div className={s.wallpaperOrb2} /><div className={s.wallpaperGrid} /></div>
    <header className={s.systemBar}><button className={s.systemBrand} onClick={showHome} aria-label="Go to home screen"><span className={s.brandSymbol}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20L12 4l8 16M8 13h8" stroke="currentColor" strokeWidth="1.8" /><path d="M15 20h5" stroke="currentColor" strokeWidth="1.8" /></svg></span><b>AVALON</b><em>OS</em></button><span className={s.systemPlace}>Personal workspace</span><div className={s.systemRight}><span className={s.marketStatus}><i /> Market open</span><div className={s.speedControls}><button aria-label={paused ? 'Resume' : 'Pause'} data-testid="pause" onClick={() => useGame.getState().togglePause()}>{paused ? '▶' : 'Ⅱ'}</button><button aria-label={`Game speed ${speed}x`} data-testid="speed" onClick={() => useGame.getState().setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>{speed}×</button></div><span className={s.systemClock} data-testid="game-clock">Day {clock.day} <span>·</span> {clock.hhmm}</span><button className={s.systemAppearance} aria-label="Choose a visual direction" onClick={() => open('appearance')}><Glyph name="paint" size={17} /></button><span className={s.profileDot}>M</span></div></header>
    <div className={s.homeContent} aria-hidden={phone && !!activeWindow ? true : undefined} inert={phone && !!activeWindow ? true : undefined}>
      <div className={s.homeTopline}><span className={s.eyebrow}>PORT AVALON / PERSONAL ACCOUNT</span><button className={s.appearanceLink} onClick={() => open('appearance')} data-testid="open-appearance"><Glyph name="paint" size={15} /> Appearance</button></div>
      <div className={s.greeting}><div><h1>{phone ? 'Workspace' : looks[prefs.look].subtitle}</h1><span>Your capital, positions, and private collection.</span></div><span className={s.workspaceIndex}>WORKSPACE 01 <i /></span></div>
      <div className={s.workspaceColumns}>
        <div className={s.workspaceMain}>
          <div className={s.homeGrid}>
            <section className={s.wealthCard}><div className={s.wealthLabel}><span>NET WORTH</span><span className={s.rank} data-testid="rank-chip">{rank.rank.id} / {rank.rank.name}</span></div><strong data-testid="net-worth">{money(pf.equity).replace('.00', '')}<small>USD</small></strong><div className={s.today} data-testid="today-pnl"><span className={toneText[tone(pf.dayPnl)]}>{signedMoney(pf.dayPnl)}</span><span>today</span><span className={s.todaySeparator} /><span>{pf.positions.length} positions</span></div><div className={s.wealthFooter}><div><span>Available cash</span><b>{money(pf.cash).replace('.00', '')}</b></div><div><span>Invested capital</span><b>{money(invested).replace('.00', '')}</b></div><button aria-label="Open Portfolio" onClick={() => open('portfolio')}><Glyph name="arrow" size={18} /></button></div></section>
            <section className={s.nextCard}><div className={s.milestoneTop}><span className={s.eyebrow}>NEXT MILESTONE</span><span className={s.milestoneNumber}>{rank.next?.id ?? 'MAX'}</span></div><h2>{rank.next?.name ?? 'Dynasty'}</h2><p>{rank.next ? `${compactMoney(Math.max(0, rank.next.threshold - pf.equity))} remaining` : 'Highest wealth tier'}</p><div className={s.rankTrack} role="progressbar" aria-label={`Progress to ${rank.next?.name ?? 'Dynasty'}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rank.progress * 100)}><i style={{ width: `${rank.progress * 100}%` }} /></div><span className={s.rankEnds}>{Math.round(rank.progress * 100)}%<b>{rank.next ? compactMoney(rank.next.threshold) : 'Complete'}</b></span><span className={s.milestoneCaption}>Net worth progression</span></section>
          </div>
          <div className={s.sectionTitle}><span>Applications</span><small>{apps.length.toString().padStart(2, '0')} INSTALLED</small></div>
          <nav className={s.launcher} aria-label="Main">{apps.map(app => <button key={app.id} className={s.appShortcut} data-testid={`${phone ? 'tab' : 'nav'}-${app.id}`} onClick={() => open(app.id)}><span className={`${s.appIcon} ${s[`icon_${app.id}`]}`}><Glyph name={app.id === 'appearance' ? 'paint' : app.id} size={phone ? 24 : 23} /></span><b>{app.name}</b><small>{app.subtitle}</small>{windows.some(item => item.app === app.id) && <i className={s.runningDot} />}</button>)}</nav>
          <div className={s.homeBottom}><button className={s.wirePeek} onClick={() => open('wire')}><span className={s.wireMark}><Glyph name="wire" size={18} /></span><span><b>The Wire <i>LIVE</i></b><small>{wire[0] ? `${wire[0].tag} · ${wire[0].text}` : 'No new events in your market.'}</small></span><Glyph name="arrow" size={17} /></button></div>
          {prefs.goal && <button className={s.wishlistCard} data-testid="wishlist" onClick={() => open('life')}><span>COLLECTION TARGET</span><div><MotorCar color={prefs.color} sports={prefs.car > 0} /></div><b>{cars[prefs.car].name}</b><small>{money(cars[prefs.car].price).replace('.00', '')} <Glyph name="arrow" size={14} /></small></button>}
        </div>
        <aside className={s.briefing}>
          <div className={s.sectionTitle}><span>Market snapshot</span><small className={s.liveLabel}><i /> LIVE</small></div>
          <div className={s.marketGlance}>{world.config.assets.slice(0, 4).map(asset => {
            const info = seriesInfo(world, history, asset.id);
            return <button key={asset.id} data-testid={`home-asset-${asset.id}`} onClick={() => { useGame.getState().select(asset.id); open('market'); }}><div><b>{info.id}</b><span>{info.name}</span></div><Sparkline data={sparkline(history, asset.id, 5)} width={54} height={25} /><div><b>{price(info.price)}</b><span className={toneText[tone(info.change)]}>{signedPct(info.changePct)}</span></div></button>;
          })}<button className={s.marketLink} onClick={() => open('market')}>Open trading terminal <Glyph name="arrow" size={15} /></button></div>
          <div className={s.activityPanel}><div className={s.sectionTitle}><span>World activity</span><small>RECENT</small></div>{wire.length ? wire.slice(0, 3).map(item => <button key={item.id} onClick={() => open('wire')}><span>{item.time} <b>{item.tag}</b></span><p>{item.text}</p></button>) : <p className={s.activityEmpty}>No recent events.</p>}</div>
          <div className={s.sessionInfo}><span className={s.sessionDot} /><div><b>Simulation running {paused ? '/ paused' : ''}</b><span>Port Avalon · Day {clock.day}</span></div><span>{speed}×</span></div>
        </aside>
      </div>
    </div>
    {windows.filter(item => !item.minimized && (!phone || item.app === focused)).map((item, index) => <section key={item.app} className={`${s.appWindow} ${['market', 'portfolio', 'appearance'].includes(item.app) ? s.wideWindow : ''} ${item.maximized ? s.maximized : ''}`} style={{ transform: phone || item.maximized ? undefined : `translate(${item.x}px, ${item.y}px)`, zIndex: focused === item.app ? 20 : 10 + index }} data-testid={`window-${item.app}`} onPointerDown={() => setFocused(item.app)} aria-label={`${apps.find(app => app.id === item.app)?.name} application`}>
      <div className={s.windowChrome} onPointerDown={event => beginDrag(event, item)} onPointerMove={moveDrag} onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
        <div>{phone && <button aria-label="Back to home screen" onClick={showHome}><Glyph name="back" size={21} /></button>}<span className={s.windowAppIcon}><Glyph name={item.app === 'appearance' ? 'paint' : item.app} size={17} /></span><b>{apps.find(app => app.id === item.app)?.name}</b><span className={s.windowLocation}>/ Port Avalon</span></div>
        {!phone && <div className={s.windowControls}><button aria-label="Minimize window" onClick={() => { setWindows(previous => previous.map(win => win.app === item.app ? { ...win, minimized: true } : win)); setFocused(null); }}>−</button><button aria-label={item.maximized ? 'Restore window' : 'Maximize window'} onClick={() => setWindows(previous => previous.map(win => win.app === item.app ? { ...win, maximized: !win.maximized } : win))}><Glyph name="max" size={14} /></button><button aria-label="Close window" onClick={() => close(item.app)}><Glyph name="close" size={17} /></button></div>}
      </div>
      <div className={s.appBody} data-testid={`scroll-${item.app}`}>{renderWindow(item.app)}</div>
      {phone && (item.app === 'market' || item.app === 'portfolio') && <div className={s.phoneTrade}><div className={s.tradeFade} data-testid="trade-fade" /><button data-testid="open-trade" onClick={() => useGame.getState().setTradeSheet(true)} className={s.primary}>Trade {world.config.assets.some(asset => asset.id === selected) ? selected : ''}<Glyph name="arrow" size={19} /></button></div>}
    </section>)}
    <nav className={s.dock} aria-label="Dock"><button aria-label="Show home screen" aria-current={focused === null ? 'page' : undefined} onClick={showHome} className={s.dockHome}><Glyph name="home" size={21} /><span>Workspace</span></button><span className={s.dockDivider} />{apps.filter(app => app.id !== 'appearance').map(app => <button key={app.id} aria-label={`Open ${app.name}`} title={app.name} aria-current={focused === app.id ? 'page' : undefined} onClick={() => open(app.id)} className={`${s.dockApp} ${s[`icon_${app.id}`]}`}><Glyph name={app.id} size={21} /><span>{app.name}</span>{windows.some(item => item.app === app.id) && <i />}</button>)}<span className={s.dockDivider} /><Link href="/credits" aria-label="Credits" data-testid={phone ? 'tab-more' : 'nav-more'} className={s.dockCredits}>A<span>Credits</span></Link></nav>
    <footer className={s.desktopFoot}><span>AVALON OS <i /> LOCAL SIMULATION</span><span>Fictional markets · No real money</span></footer>
    <TradeSheet /><Toasts phone={phone} />
  </div>;
}
