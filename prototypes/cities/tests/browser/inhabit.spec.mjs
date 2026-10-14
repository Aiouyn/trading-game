import { test, expect } from '@playwright/test';
import { ready } from '../../tools/browser-ready.mjs';

test('local ownership flow: lease, name, upgrade, persist across reload, find again, and safe from HTML injection', async ({ page, baseURL }) => {
  await ready(page, `${baseURL}/?city=avalon&t=15`);
  await page.evaluate(() => { localStorage.removeItem('cities.inhabit.v1'); window.__cities.resetInhabitDemo(); });

  // Open offer panel
  await page.click('#try-live');
  await expect(page.locator('#inhabit')).toBeVisible();
  await expect(page.locator('#inhabit h2')).toHaveText('Local ownership demo');
  await expect(page.locator('#inhabit-cash')).toHaveText('5,000 demo FDL');

  const cards = page.locator('#inhabit .offer-card');
  await expect(cards).toHaveCount(3);

  // Lease the first offer (Old Harbor, 600 demo FDL)
  const firstCard = cards.nth(0);
  await firstCard.locator('button', { hasText: 'Lease for 600 demo FDL' }).click();
  await expect(page.locator('#inhabit-cash')).toHaveText('4,400 demo FDL');

  // Verify building owner unchanged (city:avalon), unit occupant is demo:company, and second tenant exists in same building
  const stateAfterLease = await page.evaluate(() => {
    const a = window.__cities;
    const u0 = a.demoOffers[0];
    const b = a.city.buildings[u0.buildingId - 1];
    return {
      cash: a.inhabitState.cash,
      owner: b.owner,
      demoUnits: b.demoUnits,
      infoText: document.getElementById('info').textContent,
    };
  });
  expect(stateAfterLease.cash).toBe(4400);
  expect(stateAfterLease.owner).toBe('city:avalon');
  expect(stateAfterLease.demoUnits.length).toBe(2);
  expect(stateAfterLease.demoUnits[0].occupantId).toBe('demo:company');
  expect(stateAfterLease.demoUnits[1].occupantId).toBe('npc:harbor-marine-assay');
  expect(stateAfterLease.infoText).toContain('city:avalon');

  // Reject unsafe HTML injection in business name
  const nameInput = firstCard.locator('input.inhabit-input');
  await nameInput.fill('<img src=x onerror=alert(1)>');
  await firstCard.locator('button', { hasText: 'Name shop' }).click();
  await expect(page.locator('#inhabit .inhabit-err')).toContainText('1–32 plain characters');

  // Set valid name 'A&B Coffee' and verify typing Q/E/X inside input does not rotate or change seeMode
  const beforeYaw = await page.evaluate(() => window.__cities.view.yawTarget);
  const beforeSee = await page.evaluate(() => window.__cities.seeMode);
  await nameInput.focus();
  await page.keyboard.type('qx');
  const afterHotkeyAttempt = await page.evaluate(() => ({ yaw: window.__cities.view.yawTarget, see: window.__cities.seeMode }));
  expect(afterHotkeyAttempt.yaw).toBe(beforeYaw);
  expect(afterHotkeyAttempt.see).toBe(beforeSee);

  await nameInput.fill('  A&B   Coffee  ');
  await firstCard.locator('button', { hasText: 'Name shop' }).click();

  const afterRename = await page.evaluate(() => {
    const a = window.__cities;
    const hits = a.search('A&B Coffee');
    const lbls = [...document.querySelectorAll('#labels .lbl-mine')].map(el => el.textContent);
    return {
      companyName: a.inhabitState.company.name,
      infoTitle: document.querySelector('#info .t')?.textContent,
      hits,
      lbls,
    };
  });
  expect(afterRename.companyName).toBe('A&B Coffee');
  expect(afterRename.infoTitle).toBe('A&B Coffee');
  expect(afterRename.hits.some(h => h.startsWith('A&B Coffee |'))).toBe(true);
  expect(afterRename.lbls).toContain('A&B Coffee');

  // Improve frontage once (300 demo FDL -> 4,100 demo FDL) and verify geometry/parts/roadGraph unchanged
  const beforeGeom = await page.evaluate(() => {
    const a = window.__cities;
    const b = a.city.buildings[a.demoOffers[0].buildingId - 1];
    return {
      id: b.id,
      parcelId: b.parcelId,
      w: b.w,
      dp: b.dp,
      boxLen: a.city.parts.box.length,
      edges: a.city.roadGraph.edges.length,
    };
  });
  await firstCard.locator('button', { hasText: 'Improve frontage — 300 demo FDL' }).click();
  await expect(page.locator('#inhabit-cash')).toHaveText('4,100 demo FDL');
  await expect(firstCard.locator('button', { hasText: 'Improve frontage' })).toHaveCount(0);

  const afterGeom = await page.evaluate(() => {
    const a = window.__cities;
    const b = a.city.buildings[a.demoOffers[0].buildingId - 1];
    return {
      id: b.id,
      parcelId: b.parcelId,
      w: b.w,
      dp: b.dp,
      boxLen: a.city.parts.box.length,
      edges: a.city.roadGraph.edges.length,
      frontageByte: a.view.frontage[b.id],
    };
  });
  expect(afterGeom.id).toBe(beforeGeom.id);
  expect(afterGeom.parcelId).toBe(beforeGeom.parcelId);
  expect(afterGeom.w).toBe(beforeGeom.w);
  expect(afterGeom.dp).toBe(beforeGeom.dp);
  expect(afterGeom.boxLen).toBe(beforeGeom.boxLen);
  expect(afterGeom.edges).toBe(beforeGeom.edges);
  expect(afterGeom.frontageByte).toBe(255);

  // Selection stays pinned when hovering over empty map
  await page.mouse.move(10, 200);
  const pinnedOpen = await page.evaluate(() => document.getElementById('info').style.display === 'block');
  expect(pinnedOpen).toBe(true);

  // Reload and verify lease, name and stage 1 persist
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__cities?.city);
  const persisted = await page.evaluate(() => ({
    cash: window.__cities.inhabitState.cash,
    name: window.__cities.inhabitState.company.name,
    leases: window.__cities.inhabitState.leases,
  }));
  expect(persisted.cash).toBe(4100);
  expect(persisted.name).toBe('A&B Coffee');
  expect(Object.values(persisted.leases)[0].stage).toBe(1);

  // Pan away and find the shop again via search and Mine lens
  await page.evaluate(() => { window.__cities.view.pan(400, 300); window.__cities.select(null); });
  await page.evaluate(() => { window.__cities.search('A&B Coffee'); window.__cities.openHit(0); });
  const refound = await page.evaluate(() => document.querySelector('#info .t')?.textContent);
  expect(refound).toBe('A&B Coffee');

  // Stale worldKey requires explicit reset and only clears cities.inhabit.v1
  await page.evaluate(() => {
    localStorage.setItem('unrelated.user.key', 'keep-me');
    localStorage.setItem('cities.inhabit.v1', JSON.stringify({
      schema: 1,
      worldKey: 'avalon:1701:old-version',
      state: { schema: 1, worldKey: 'avalon:1701:old-version', cash: 4100, company: { id: 'demo:company', name: 'Old' }, leases: {} },
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__cities?.city);
  await page.click('#try-live');
  await expect(page.locator('#inhabit')).toContainText('This demo layout changed. Start a new local demo.');
  await page.locator('#inhabit button', { hasText: 'Reset local demo' }).click();
  await expect(page.locator('#inhabit-cash')).toHaveText('5,000 demo FDL');
  const keptUnrelated = await page.evaluate(() => localStorage.getItem('unrelated.user.key'));
  expect(keptUnrelated).toBe('keep-me');
});
