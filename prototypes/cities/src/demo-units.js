const TARGETS = [
  { districtId: 'oldharbor', districtName: 'Old Harbor', cost: 600, street: 'Quay Lane' },
  { districtId: 'westbank', districtName: 'Westbank', cost: 800, street: 'Westbank Row' },
  { districtId: 'northgate', districtName: 'Northgate', cost: 1000, street: 'Northgate Terrace' },
];

const SHOP_PREMISES_TYPES = new Set(['row', 'midrise', 'house', 'gabled', 'loft', 'strip', 'micro', 'palazzo']);

function formatAddress(parcelId, street, idx) {
  const m = /:p:(-?\d+):(-?\d+):/.exec(parcelId ?? '');
  const num = m ? (Math.abs(Number(m[1]) + Number(m[2])) % 88) + 10 : (idx + 1) * 12;
  return `${num} ${street}`;
}

export function buildDemoUnits(city) {
  if (!city || city.P?.id !== 'avalon') {
    return { offers: [], units: [] };
  }
  const offers = [];
  const units = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const cands = city.buildings.filter((b) =>
      b.d?.id === t.districtId &&
      Boolean(b.parcelId) &&
      SHOP_PREMISES_TYPES.has(b.type) &&
      !b.company &&
      !b.crown &&
      !b.mine &&
      b.kind !== 'Landmark' &&
      b.kind !== 'Island estate' &&
      b.h <= 28 &&
      b.accessMode === 'road' &&
      b.accessPath?.pts?.length >= 2
    );
    cands.sort((a, b) => a.parcelId.localeCompare(b.parcelId, 'en'));
    const chosen = cands[0] ?? null;
    if (!chosen) {
      offers.push({
        id: `avalon:${city.P.seed}:${t.districtId}:unavailable`,
        available: false,
        districtId: t.districtId,
        districtName: t.districtName,
        address: 'No serviced premises available',
        premisesType: 'Ground-floor shop',
        cost: t.cost,
        use: 'shop',
        leasable: false,
        ownerId: 'city:avalon',
        buildingId: null,
        parcelId: null,
      });
      continue;
    }
    const unitId = `${chosen.parcelId}/ground/shop-1`;
    const address = formatAddress(chosen.parcelId, t.street, i);
    const unit = {
      id: unitId,
      available: true,
      parcelId: chosen.parcelId,
      buildingId: chosen.id,
      districtId: t.districtId,
      districtName: t.districtName,
      address,
      premisesType: `${chosen.kind} · Ground-floor shop`,
      ownerId: 'city:avalon',
      use: 'shop',
      leasable: true,
      cost: t.cost,
    };
    offers.push(unit);
    units.push(unit);

    if (i === 0) {
      units.push({
        id: `${chosen.parcelId}/upper/office-1`,
        available: false,
        parcelId: chosen.parcelId,
        buildingId: chosen.id,
        districtId: t.districtId,
        districtName: t.districtName,
        address: `${address}, Upper floor`,
        premisesType: 'Upper-floor counting rooms',
        ownerId: 'city:avalon',
        occupantId: 'npc:harbor-marine-assay',
        occupantName: 'Harbor Marine Assay',
        use: 'office',
        leasable: false,
        cost: 0,
      });
    }
  }

  return { offers, units };
}
