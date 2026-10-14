export function cleanName(value) {
  if (typeof value !== 'string' || /[<>\u0000-\u001f\u007f]/u.test(value)) throw new Error('invalid-name');
  const name = value.trim().replace(/\s+/gu, ' ');
  if ([...name].length < 1 || [...name].length > 32) throw new Error('invalid-name');
  return name;
}

export function initialState(worldKey) {
  return { schema: 1, worldKey, cash: 5000, company: { id: 'demo:company', name: 'Your business' }, leases: {} };
}

function unitAt(units, id) {
  const unit = units.find(u => u.id === id);
  if (!unit || !unit.leasable || unit.use !== 'shop') throw new Error('unavailable-unit');
  return unit;
}

export function lease(state, units, id) {
  const unit = unitAt(units, id);
  if (state.leases[id]) throw new Error('already-leased');
  if (!Number.isSafeInteger(unit.cost) || unit.cost < 0) throw new Error('invalid-cost');
  if (state.cash < unit.cost) throw new Error('insufficient-cash');
  return { ...state, cash: state.cash - unit.cost, leases: {
    ...state.leases, [id]: { companyId: state.company.id, stage: 0 },
  } };
}

export function rename(state, value) {
  return { ...state, company: { ...state.company, name: cleanName(value) } };
}

export function upgrade(state, id) {
  const held = state.leases[id];
  if (!held) throw new Error('not-leased');
  if (held.stage !== 0) throw new Error('already-improved');
  if (state.cash < 300) throw new Error('insufficient-cash');
  return { ...state, cash: state.cash - 300, leases: {
    ...state.leases, [id]: { ...held, stage: 1 },
  } };
}

export function validateStoredState(payload, expectedWorldKey, units) {
  if (!payload) return { status: 'empty', state: null };
  if (typeof payload !== 'object' || payload.schema !== 1 || typeof payload.worldKey !== 'string') {
    return { status: 'invalid', state: null };
  }
  if (payload.worldKey !== expectedWorldKey) {
    return { status: 'stale', state: null };
  }
  const s = payload.state;
  if (!s || typeof s !== 'object' || !Number.isSafeInteger(s.cash) || s.cash < 0 || s.cash > 5000) {
    return { status: 'invalid', state: null };
  }
  if (!s.company || typeof s.company !== 'object' || s.company.id !== 'demo:company') {
    return { status: 'invalid', state: null };
  }
  let name;
  try {
    name = cleanName(s.company.name);
  } catch {
    return { status: 'invalid', state: null };
  }
  if (!s.leases || typeof s.leases !== 'object' || Array.isArray(s.leases)) {
    return { status: 'invalid', state: null };
  }
  const unitMap = new Map(units.map(u => [u.id, u]));
  const cleanLeases = {};
  for (const [uid, rec] of Object.entries(s.leases)) {
    const u = unitMap.get(uid);
    if (!u || !u.leasable || u.use !== 'shop') return { status: 'stale', state: null };
    if (!rec || typeof rec !== 'object' || rec.companyId !== 'demo:company' || ![0, 1].includes(rec.stage)) {
      return { status: 'invalid', state: null };
    }
    cleanLeases[uid] = { companyId: 'demo:company', stage: rec.stage };
  }
  return {
    status: 'ok',
    state: {
      schema: 1,
      worldKey: expectedWorldKey,
      cash: s.cash,
      company: { id: 'demo:company', name },
      leases: cleanLeases,
    },
  };
}
