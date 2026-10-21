// Stand-in for the Broker route: it never touches the City. The bundle report must show
// 0 bytes of three.js reachable from this entry (C-04, 17 §3.18).
import { money } from '@/game/format';

document.getElementById('app')!.textContent = `Broker ${money(1234.5)}`;
