// Smoke test for a running world server: register, connect, trade, buy a business, chat.
// Usage: node scripts/server-smoke.mjs [http://localhost:8787]
const base = process.argv[2] ?? 'http://localhost:8787';
const wsUrl = base.replace(/^http/, 'ws');
const handle = `smoke${Math.floor(Math.random() * 1e6)}`;

const reg = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle, country: 'FR' }) }).then((r) => r.json());
if (!reg.ok) throw new Error(`register failed: ${reg.error}`);
console.log('registered', handle, reg.playerId);

const ws = new WebSocket(wsUrl);
const seen = { welcome: false, ticks: 0, acks: [], chat: 0 };
let id = 0;
const send = (m) => ws.send(JSON.stringify(m));
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout: ${JSON.stringify({ ...seen, acks: seen.acks.length })}`)), 30000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') {
      seen.welcome = true;
      console.log('welcome: tick', m.frame.tick, 'cash', m.me.account.cash, 'players', m.pub.players, 'wire', m.pub.wire.length);
      send({ t: 'cmd', id: ++id, cmd: { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 3 } } });
      send({ t: 'cmd', id: ++id, cmd: { type: 'biz.buy', defId: 'food.street-food-cart', cityId: 'avalon' } });
      send({ t: 'cmd', id: ++id, cmd: { type: 'chat.send', channel: 'world', text: 'hello from the smoke test' } });
      send({ t: 'history', id: ++id, series: 'HLCN' });
    }
    if (m.t === 'ack') { seen.acks.push(m); console.log('ack', m.id, m.ok, m.error ?? ''); }
    if (m.t === 'history') console.log('history: daily bars', m.data?.daily.length, 'ticks', m.data?.ticks.length);
    if (m.t === 'chat') seen.chat++;
    if (m.t === 'tick') {
      seen.ticks++;
      if (seen.ticks >= 2 && seen.acks.length >= 3) {
        console.log('tick', m.frame.tick, 'positions', Object.keys(m.me.account.positions), 'businesses', m.me.businesses.length, 'net worth', m.me.netWorth.total.toFixed(2));
        clearTimeout(timer);
        resolve();
      }
    }
    if (m.t === 'error') console.log('error', m.message);
  };
  ws.onopen = () => send({ t: 'hello', token: reg.token });
  ws.onerror = (e) => reject(e);
});
await done;
ws.close();
const bad = seen.acks.filter((a) => !a.ok);
if (bad.length || !seen.chat) throw new Error(`failed: ${JSON.stringify(bad)} chat=${seen.chat}`);
console.log('SMOKE OK');
process.exit(0);
