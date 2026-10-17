// Quay glyph family: 24 px grid, 1.5 px single-weight line, round caps. No fills except tiny dots.
const G = {
  quay:     '<path d="M3 9h18M7 9v7M17 9v7"/><path d="M3 19.5h3.5M10.25 19.5h3.5M17.5 19.5H21" opacity=".55"/>',
  broker:   '<path d="M8 3.5v3.5M8 15v5.5M16 5.5V10M16 16v3"/><rect x="6" y="7" width="4" height="8" rx=".6"/><rect x="14" y="10" width="4" height="6" rx=".6"/>',
  portfolio:'<circle cx="12" cy="12" r="8.25"/><path d="M12 3.75V12h8.25"/>',
  wire:     '<path d="M8.5 7.5h11M8.5 12h11M8.5 16.5h7"/><circle cx="5" cy="7.5" r=".9" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="5" cy="16.5" r=".9" fill="currentColor" stroke="none"/>',
  businesses:'<path d="M4 9.5h16M5.5 4.5h13L20 9.5M5.5 4.5 4 9.5M5.5 9.5v10h13v-10M10.25 19.5v-5h3.5v5"/>',
  ailab:    '<circle cx="6" cy="7" r="2.25"/><circle cx="18" cy="7" r="2.25"/><circle cx="12" cy="18" r="2.25"/><path d="M8.25 7h7.5M7.1 9 10.9 16M16.9 9l-3.8 7"/>',
  research: '<path d="M11 20.5H5.5v-17h8l4 4V10M13.5 3.5v4h4"/><circle cx="15.5" cy="15.5" r="3.25"/><path d="m18 18 2.75 2.75"/>',
  bank:     '<path d="M3.5 9 12 4l8.5 5zM6 11.5v6M10 11.5v6M14 11.5v6M18 11.5v6M3.5 20h17"/>',
  legal:    '<path d="M12 4v15.5M8 19.5h8M5 7.5h14M5 7.5 2.75 13.25h4.5zM19 7.5l-2.25 5.75h4.5z"/>',
  security: '<path d="M12 3.25 19 6v5.25c0 4.5-3 7.9-7 9.5-4-1.6-7-5-7-9.5V6z"/><path d="M12 10.25v3.5"/><circle cx="12" cy="9.5" r=".9" fill="currentColor" stroke="none"/>',
  boutique: '<path d="M5 8.25h14l-1 12H6zM9 8.25V6.5a3 3 0 0 1 6 0v1.75"/>',
  messages: '<path d="M4 5h16v11H10.5L6.5 19.25V16H4z"/><path d="M8 9h8M8 12h5"/>',
  settings: '<path d="M4 7h3M11 7h9M4 12h9M17 12h3M4 17h1M9 17h11"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="17" r="2"/>',
  company:  '<path d="M7 20.5v-16h10v16M4 20.5h16M10 8h1M13 8h1M10 11.5h1M13 11.5h1M10 15h1M13 15h1"/>',
  bell:     '<path d="M6.5 16v-4.5a5.5 5.5 0 0 1 11 0V16l1.5 2h-14z"/><path d="M10 20.5h4"/>',
  search:   '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  collapse: '<path d="M4.5 12h7"/>',
  fill:     '<path d="M6.5 4H4v8h2.5M9.5 4H12v8H9.5"/>',
  close:    '<path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/>',
  pause:    '<path d="M9 7v10M15 7v10"/>',
  chev:     '<path d="m9 6 6 6-6 6"/>',
  focus:    '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  layout:   '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M14 5v14M14 12h6.5"/>',
};
function glyph(name, size=18, sw=1.5){
  const vb = ['collapse','fill','close'].includes(name) ? '0 0 16 16' : '0 0 24 24';
  return `<svg class="g" width="${size}" height="${size}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${G[name]}</svg>`;
}
const APPS = [
  ['broker','Broker'],['portfolio','Portfolio'],['wire','Wire'],['messages','Messages'],
  ['businesses','Businesses'],['ailab','AI Lab'],['research','Research Desk'],['bank','Bank & Credit'],
  ['legal','Legal & Court'],['security','Security'],['boutique','Boutique'],['settings','Settings'],['company','Company'],
];
