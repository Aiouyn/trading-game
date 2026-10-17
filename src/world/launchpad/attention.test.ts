import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARCHES, ARCH_ODDS, PA, driveAt, initPa, sizeShare, type Arch } from './attention';
import { NPC, TPD } from './constants';
import { CREATOR, TRADER, launch, lpWorld } from './fixture';
import { lpTick } from './flow';
import { MICROFLOW } from './microflow';
import { cardOf, launchpadView, pageOf } from './view';

/** Price action v2 (attention.ts): hidden archetypes, one attention state, noisy tells. */
describe('price action v2: archetypes and attention', () => {
  it('draws every archetype, deterministically, with quick deaths the majority and runners rare; about 30% mimic', () => {
    const n = 4000;
    const count: Record<string, number> = {};
    let mimic = 0;
    for (let i = 0; i < n; i++) {
      const pa = initPa('mix', `T${i}`, 0, 2);
      count[pa.arch] = (count[pa.arch] ?? 0) + 1;
      if (pa.mimic !== pa.arch) mimic++;
      expect(JSON.stringify(initPa('mix', `T${i}`, 0, 2))).toBe(JSON.stringify(pa));
    }
    for (const a of ARCHES) expect(count[a] ?? 0, a).toBeGreaterThan(0);
    expect(count.quick! / n).toBeGreaterThan(0.45);
    expect(count.runner! / n).toBeLessThan(0.06);
    expect(mimic / n).toBeGreaterThan(0.25);
    expect(mimic / n).toBeLessThan(0.35);
    expect(Object.values(ARCH_ODDS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('a loud launch leans to the long stories, never decides them', () => {
    const share = (buzz: number, a: Arch) => { let k = 0; for (let i = 0; i < 3000; i++) if (initPa('lean', `L${i}`, 0, buzz).arch === a) k++; return k / 3000; };
    expect(share(30, 'runner')).toBeGreaterThan(share(0.1, 'runner'));
    expect(share(30, 'quick')).toBeLessThan(share(0.1, 'quick'));
    expect(share(30, 'quick')).toBeGreaterThan(0.2);
  });

  it('every archetype ends in a fade: the drive decays toward zero and leans to selling', () => {
    for (let i = 0; i < 400; i++) {
      const pa = initPa('fade', `F${i}`, 0, 3);
      const end = pa.plan.reduce((s, x) => s + x[0], 0);
      const late = driveAt(pa, end + 10 * pa.fadeHalf);
      expect(late.drive, pa.arch).toBeLessThan(0.01);
      expect(late.buyP).toBeLessThan(0.5);
    }
  });

  it('keeps the mean branching ratio of the attention state under one, so attention dies without drive', () => {
    const slow = PA.ALPHA / (1 - Math.pow(0.5, 1 / PA.EXCITE_HALF));
    const fast = PA.FAST_ALPHA / (1 - Math.pow(0.5, 1 / PA.FAST_HALF));
    // a typical order has a size factor of about one
    expect(slow + fast).toBeLessThan(0.8);
  });

  it('calibrates order sizes from the recorded flows: a heavy tail, sells larger than buys at the median', () => {
    expect(sizeShare('buy', 0.5)).toBeGreaterThan(0);
    expect(sizeShare('buy', 0.99)).toBeGreaterThan(10 * sizeShare('buy', 0.5));
    expect(sizeShare('sell', 0.5)).toBeGreaterThan(sizeShare('buy', 0.5));
  });
});

describe('price action v2: in the world', () => {
  const npc = NPC as unknown as Record<string, number>;
  let viral = 0;
  let micro = true;
  beforeEach(() => { viral = npc.VIRAL_PER_DAY!; micro = MICROFLOW.enabled; MICROFLOW.enabled = true; });
  afterEach(() => { npc.VIRAL_PER_DAY = viral; MICROFLOW.enabled = micro; });

  it('never puts the archetype, the tell profile or the attention state on a view (no leak)', () => {
    const g = lpWorld('pa-leak');
    expect(launch(g, CREATOR, 'LEAK').ok).toBe(true);
    for (let i = 0; i < 60; i++) { g.market = { ...g.market, tick: g.market.tick + 1 }; lpTick(g, null); }
    const t = g.launchpad!.tokens.LEAK!;
    expect(t.micro?.pa).toBeDefined();
    const views = JSON.stringify([cardOf(g, t), pageOf(g, t, TRADER), launchpadView(g, TRADER)]);
    for (const key of ['"pa"', '"arch"', '"mimic"', '"plan"', '"fadeHalf"', '"rugAt"', '"devSellAt"', '"micro"', '"viralDrip"']) {
      expect(views.includes(key), key).toBe(false);
    }
  });

  it('spreads a viral shock over many ticks instead of one fill', () => {
    npc.VIRAL_PER_DAY = 1e9;
    const g = lpWorld('pa-drip');
    expect(launch(g, CREATOR, 'DRIP').ok).toBe(true);
    npc.VIRAL_PER_DAY = 0;
    const t = g.launchpad!.tokens.DRIP!;
    npc.VIRAL_PER_DAY = 1e9;
    g.market = { ...g.market, tick: g.market.tick + 1 };
    lpTick(g, null);
    npc.VIRAL_PER_DAY = 0;
    const left = g.launchpad!.tokens.DRIP!.viralDrip ?? 0;
    expect(left).toBeGreaterThan(0);
    let ticks = 0;
    while ((g.launchpad!.tokens.DRIP!.viralDrip ?? 0) > 0 && ticks < TPD) { g.market = { ...g.market, tick: g.market.tick + 1 }; lpTick(g, null); ticks++; }
    expect(ticks).toBeGreaterThan(3);
    expect(t.viralDrip ?? 0).toBe(0);
  });

  it('is deterministic: two worlds on one seed print the same tape', () => {
    const run = () => {
      const g = lpWorld('pa-det', { npcLaunches: true });
      for (let i = 0; i < 400; i++) { g.market = { ...g.market, tick: g.market.tick + 1 }; lpTick(g, null); }
      return JSON.stringify(Object.values(g.launchpad!.tokens).map(t => [t.ticker, t.y, t.tape.length, t.micro?.pa?.arch]));
    };
    expect(run()).toBe(run());
  });
});
