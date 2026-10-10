// Sets data-palette on <html> before first paint (P2-177). Runs from a tiny inline script in the root
// layout, so a saved palette never flashes Ink & Brass first. Only a known slug is applied; anything
// else keeps the default. The script is built from the same constants the app uses, so they cannot drift.
import { PALETTE_SLUGS, PREFS_KEY } from './palette';

export const PALETTE_BOOT_SCRIPT =
  '(function(){try{var p=JSON.parse(localStorage.getItem(' + JSON.stringify(PREFS_KEY) + ')||"{}").palette;' +
  'if(' + JSON.stringify(PALETTE_SLUGS) + '.indexOf(p)>=0)document.documentElement.dataset.palette=p;}catch(e){}})();';
