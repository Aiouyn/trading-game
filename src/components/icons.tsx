export type IconName =
  | 'market' | 'portfolio' | 'empire' | 'estate' | 'lab' | 'security' | 'court' | 'social' | 'wire' | 'profile'
  | 'more' | 'bell' | 'chat' | 'close' | 'search' | 'star' | 'lock' | 'trophy' | 'spark';

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'market': return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 5-6" /></svg>;
    case 'portfolio': return <svg {...common}><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3.5 12h17" /></svg>;
    case 'empire': return <svg {...common}><path d="M4 20V9l5-3v14" /><path d="M9 20V4l7 4v12" /><path d="M16 20v-8l4 2v6" /><path d="M3 20h18" /></svg>;
    case 'estate': return <svg {...common}><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>;
    case 'lab': return <svg {...common}><path d="M9 3h6" /><path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" /><path d="M7.5 15h9" /></svg>;
    case 'security': return <svg {...common}><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6Z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'court': return <svg {...common}><path d="M12 4v16" /><path d="M5 7h14" /><path d="M5 7l-2.5 6a3 3 0 0 0 5 0Z" /><path d="M19 7l-2.5 6a3 3 0 0 0 5 0Z" /><path d="M8 20h8" /></svg>;
    case 'social': return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.3" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></svg>;
    case 'wire': return <svg {...common}><path d="M5 5h11a3 3 0 0 1 3 3v11H8a3 3 0 0 1-3-3Z" /><path d="M9 9h6M9 12.5h6M9 16h3" /></svg>;
    case 'profile': return <svg {...common}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
    case 'more': return <svg {...common}><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></svg>;
    case 'bell': return <svg {...common}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
    case 'chat': return <svg {...common}><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>;
    case 'close': return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>;
    case 'star': return <svg {...common}><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6Z" /></svg>;
    case 'lock': return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case 'trophy': return <svg {...common}><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M9 20h6" /></svg>;
    case 'spark': return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></svg>;
  }
}
