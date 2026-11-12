// M1-10: Port Avalon's 8 districts for the static, read-only district view (the board's documented static fallback:
// no city data is published in V1, so the 3D renderer has nothing to draw). Names, landmark ids, briefs and tiers are
// the content of record (packages/content/data/districts.json); landmark display names and district centres (metres,
// x east, z south, city centre 0,0) are the approved reference seed's (tests/e2e/city/fixtures/generate-city.ts,
// "crescent harbour bay, hill to the west"). tests/unit/city-app/districts.test.ts fails on any drift from either.
// Copy, not data: no prices, owners or balances.

export interface District {
  distId: string;
  name: string;
  landmarkId: string;
  landmark: string;
  /** districts.json landmarkBrief, verbatim. */
  brief: string;
  center: readonly [x: number, z: number];
}

export const DISTRICTS: readonly District[] = [
  { distId: "dst_port_avalon_eastside_docks", name: "Eastside Docks", landmarkId: "lmk_the_coal_crane", landmark: "The Coal Crane", brief: "a riveted harbour crane kept as a monument", center: [250, 60] },
  { distId: "dst_port_avalon_industrial_basin", name: "Industrial Basin", landmarkId: "lmk_basin_gasworks", landmark: "Basin Gasworks", brief: "brick gasholder frames turned into a market hall", center: [300, -220] },
  { distId: "dst_port_avalon_old_harbor", name: "Old Harbor", landmarkId: "lmk_old_harbor_lighthouse", landmark: "Old Harbor Lighthouse", brief: "the first light of the bay", center: [-90, 230] },
  { distId: "dst_port_avalon_riverside_lofts", name: "Riverside Lofts", landmarkId: "lmk_ironworks_bridge", landmark: "Ironworks Bridge", brief: "a lattice bridge over the river mouth", center: [120, -90] },
  { distId: "dst_port_avalon_midtown", name: "Midtown", landmarkId: "lmk_union_station", landmark: "Union Station", brief: "the domed rail terminus", center: [10, -230] },
  { distId: "dst_port_avalon_financial_mile", name: "Financial Mile", landmarkId: "lmk_port_avalon_exchange_building", landmark: "Port Avalon Exchange Building", brief: "columned hall of the exchange (CBD)", center: [-40, 40] },
  { distId: "dst_port_avalon_glasshill", name: "Glasshill", landmarkId: "lmk_glasshill_observatory", landmark: "Glasshill Observatory", brief: "copper-domed observatory over the bay", center: [-270, -40] },
  { distId: "dst_port_avalon_summit_estates_on_gilt_hill", name: "Summit Estates on Gilt Hill", landmarkId: "lmk_gilt_hill_gates", landmark: "Gilt Hill Gates", brief: "wrought gates at the summit road", center: [-300, -290] },
];

/** The district the view opens on: home of the Port Avalon Exchange, where the game's market trades. */
export const FIRST_DISTRICT = "dst_port_avalon_financial_mile";

/** The reference seed's bay (generate-city.ts isWater): a circle of 250 m around (170, 420). */
export const BAY = { cx: 170, cz: 420, r: 250 } as const;
