import type { ReactNode } from 'react';

export function Glyph({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    market: <><path d="M4 18l5-6 4 3 7-10M15 5h5v5M4 4v16h16" /></>,
    portfolio: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V4h8v3M3 12h18M10 12v3h4v-3" /></>,
    life: <><path d="M3 11l9-8 9 8M5 10v11h14V10M9 21v-8h6v8" /></>,
    garage: <><path d="M5 10l2-5h10l2 5M3 11h18v7H3zM6 18v2M18 18v2M3 14h3M18 14h3" /></>,
    wire: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4M8 18h8" /></>,
    lab: <><path d="M9 3v6l-5 9a2 2 0 002 3h12a2 2 0 002-3l-5-9V3M8 3h8M7 15h10" /></>,
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
    back: <path d="M19 12H5M10 7l-5 5 5 5" />,
    close: <path d="M6 6l12 12M6 18L18 6" />,
    max: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1" /></>,
    moon: <path d="M20 15A9 9 0 019 3 9 9 0 1020 15z" />,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v14H3z" /><circle cx="12" cy="13" r="4" /></>,
    paint: <><path d="M12 3C6 3 3 7 3 12a9 9 0 009 9c2 0 3-1 3-3s-1-2-1-3 2-1 4-1 3-2 3-4c0-4-4-7-9-7z" /><path d="M7 10h.01M10 7h.01M15 7h.01M18 10h.01" /></>,
    home: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    check: <path d="M5 12l4 4L19 6" />,
    volume: <><path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 010 8M19 5a10 10 0 010 14" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.home}</svg>;
}

export function MotorCar({ color, sports = false }: { color: string; sports?: boolean }) {
  return <svg viewBox="0 0 400 165" role="img" aria-label={sports ? 'Grand touring car' : 'City car'}>
    <ellipse cx="203" cy="140" rx="164" ry="10" fill="currentColor" opacity=".09" />
    <path d={sports ? 'M26 112l17-28 63-12 39-37h81l52 39 70 15 21 24v17H24z' : 'M30 114l18-28 44-13 32-46h105l47 49 59 16 31 25v14H25z'} fill={color} />
    <path d="M111 73l38-32h42v32zm91 0V41h22l42 32z" fill="var(--motor-glass, #344c54)" />
    <path d="M204 82h19M33 104h26M339 98h18" stroke="var(--motor-highlight, #fff0dc)" strokeWidth="5" strokeLinecap="round" />
    <path d="M114 129h151" stroke="currentColor" opacity=".18" strokeWidth="4" />
    {[91, 301].map(x => <g key={x}><circle cx={x} cy="124" r="27" fill="var(--motor-tire, #25363b)" /><circle cx={x} cy="124" r="17" fill="var(--motor-rim, #d8dbd6)" /><path d={`M${x} 110v28M${x-14} 124h28M${x-10} 114l20 20M${x-10} 134l20-20`} stroke="var(--motor-tire, #25363b)" strokeWidth="2" /><circle cx={x} cy="124" r="6" fill="var(--motor-rim, #d8dbd6)" /></g>)}
  </svg>;
}

export function Room({ rank, favorite, color, art = 'Sunrise' }: { rank: number; favorite: boolean; color: string; art?: 'Sunrise' | 'Shapes' }) {
  return <svg viewBox="0 0 760 490" fill="none" aria-hidden="true">
    <path d="M50 95L368 12l336 89v255L365 472 50 356Z" fill="var(--room-wall)" />
    <path d="M50 356l318-110 336 110-339 116Z" fill="var(--room-floor)" />
    <path d="M368 12v234M50 356l318-110 336 110" stroke="var(--room-line)" strokeWidth="2" />
    <path d="M407 68l239 61v142l-239-70z" fill="var(--room-sky)" />
    <path d="M420 190v-36l20 5v-23l22 6v56M470 200v-60l29 7v-36l25 7v95M532 218v-84l28 7v48l25 6v38M600 235v-92l25 6v94" fill="var(--room-building)" />
    <path d="M485 88v136M565 108v139M407 140l239 63" stroke="var(--room-window)" strokeWidth="5" />
    <path d="M100 254l177-53 161 47-180 64z" fill="var(--room-desk)" /><path d="M117 260v96M258 312v94M422 255v81" stroke="var(--room-desk-leg)" strokeWidth="10" />
    <path d="M226 195l-2 57 81 22 3-57z" fill="var(--room-screen)" /><path d="M234 205l-.5 39 65 18 1-39z" fill="var(--room-screen-light)" />
    <path d="M246 253l-1 14M217 268l59 17" stroke="var(--room-screen)" strokeWidth="6" />
    {rank >= 2 && <><path d="M137 209v46l63-19v-46z" fill="var(--room-screen)" /><path d="M143 216v29l51-14v-31z" fill="var(--room-screen-light)" /></>}
    <path d="M284 293l43-11 32 8-42 13z" fill="var(--room-screen)" opacity=".4" />
    <path d="M129 279l18 5v-21l-18-5z" fill="var(--room-pot)" /><path d="M147 266c16 0 15 19 0 14" stroke="var(--room-pot)" strokeWidth="3" />
    <path d="M197 339l49-15 20 30-49 16z" fill="var(--room-chair)" /><path d="M217 370v55M266 354v50" stroke="var(--room-desk-leg)" strokeWidth="7" />
    <path d="M595 311l44 12-6 53-28-9z" fill="var(--room-pot)" /><path d="M616 323v-67" stroke="var(--room-leaf)" strokeWidth="4" />
    <ellipse cx="602" cy="273" rx="12" ry="25" transform="rotate(-32 602 273)" fill="var(--room-leaf)" /><ellipse cx="631" cy="261" rx="12" ry="26" transform="rotate(35 631 261)" fill="var(--room-leaf)" />
    <path d="M91 159l58-16v49l-58 17z" fill="var(--room-frame)" /><path d="M99 168l42-12v26l-42 13z" fill="var(--room-art)" />
    {art === 'Sunrise' ? <circle cx="124" cy="174" r="7" fill="var(--room-window)" /> : <path d="M106 191l12-27 17 18z" fill="var(--room-window)" />}
    {favorite && <g transform="translate(390 294) scale(.57)"><MotorCar color={color} sports /></g>}
    {rank >= 4 && <><path d="M77 110l203-54v77l-203 55z" fill="var(--room-window)" opacity=".3" /><circle cx="210" cy="105" r="12" fill="var(--room-art)" /></>}
  </svg>;
}
