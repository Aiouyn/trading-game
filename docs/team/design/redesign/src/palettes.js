// Quay palettes. The only place hex lives for the redesign mocks; mirrors the token tables in specs/velvet-desktop-os.md.
const PALETTES = {
  'ink-brass': { name:'Ink & Brass', line1:'A private bank at night.',
    bg0:'#0B0D10', win:'#12151A', win2:'#1A1E25', line:'#262B33', chrome:'#0E1014', grid:'#1A1E25',
    fg:'#ECE9E2', muted:'#9AA0A8', faint:'#7E848E', dis:'#5F656E',
    acc:'#C9A45C', accHi:'#E6CB8F', accLo:'#B08A45', onAcc:'#16120A',
    gain:'#3FD1B0', loss:'#FF6B5A', warn:'#F2B33D', info:'#6EA8FE',
    shadow:'0 18px 40px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.35)', dark:true },
  'broadsheet': { name:'Broadsheet', line1:'Morning newsprint: paper, ink and an oxblood pen.',
    bg0:'#F2EDE3', win:'#FFFFFF', win2:'#F6F2EA', line:'#D9D0BF', chrome:'#E8E1D3', grid:'#EEE8DC',
    fg:'#1B1A17', muted:'#5E5A52', faint:'#67625A', dis:'#A39C8F',
    acc:'#8C2F2B', accHi:'#A8443E', accLo:'#6E2320', onAcc:'#FFFFFF',
    gain:'#1F7A5A', loss:'#B3261E', warn:'#9A6100', info:'#2F5E9E',
    shadow:'0 14px 34px rgba(60,45,20,.14), 0 1px 3px rgba(60,45,20,.12)', dark:false },
  'phosphor': { name:'Phosphor', line1:'The night desk terminal: amber, cyan and magenta.',
    bg0:'#070908', win:'#0D110F', win2:'#141A17', line:'#1F2723', chrome:'#090C0B', grid:'#141A17',
    fg:'#D8F3E6', muted:'#93AA9E', faint:'#7A9085', dis:'#4A5A52',
    acc:'#FFB23F', accHi:'#FFC86E', accLo:'#D9922A', onAcc:'#1A1206',
    gain:'#5CE1E6', loss:'#FF5C8A', warn:'#F5D547', info:'#8AB4FF',
    shadow:'0 18px 40px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)', dark:true },
  'riviera': { name:'Riviera', line1:'A mid-century travel poster of the bay at dusk.',
    bg0:'#0E1A2B', win:'#142338', win2:'#1C2E47', line:'#2A3F5E', chrome:'#0F1C2E', grid:'#1C2E47',
    fg:'#F4ECDD', muted:'#AEB6C2', faint:'#929CAB', dis:'#5D6C82',
    acc:'#E8836B', accHi:'#F2A48F', accLo:'#C96A53', onAcc:'#1A0F0B',
    gain:'#7FD4B5', loss:'#F06C5F', warn:'#F2C14E', info:'#8FB8E8',
    shadow:'0 18px 40px rgba(4,10,20,.5), 0 2px 6px rgba(4,10,20,.35)', dark:true },
};
function paletteSlug(){ return new URLSearchParams(location.search).get('p') || 'ink-brass'; }
function applyPalette(slug){
  const p = PALETTES[slug]; const r = document.documentElement.style;
  const map = {bg0:'--bg0',win:'--win',win2:'--win2',line:'--line',chrome:'--chrome',grid:'--grid',fg:'--fg',muted:'--muted',faint:'--faint',dis:'--dis',acc:'--acc',accHi:'--acc-hi',accLo:'--acc-lo',onAcc:'--on-acc',gain:'--gain',loss:'--loss',warn:'--warn',info:'--info',shadow:'--shadow'};
  for (const k in map) r.setProperty(map[k], p[k]);
  document.documentElement.classList.add('p-'+slug, p.dark?'dark':'light');
  return p;
}
