# Port Avalon V2 — Game Integration & Urban Growth Contract

## 1. Domain Model Separation

The city is the physical expression of the same financial life as the trading game. Spatial navigation is optional; trading remains directly accessible without walking or commuting.

To prevent coupling visual rendering buffers to persistent player assets, the domain model strictly separates six entities:

```
CityManifest ──> Parcel ──> Building ──> Unit ──> Occupancy / Lease ──> Business / Company
```

1. **CityManifest (`cityId:seed:genVersion`)**
   - Immutable geography snapshot persisted on the server.
   - Pins the terrain, street graph, district boundaries, and initial parcel manifest.

2. **Parcel (`parcelId`)**
   - Persistent land plot key (`<city>:<seed>:p:<qx>:<qy>:<qrot>`), stable for a pinned `CityManifest`.
   - Holds street address, district ID, frontage orientation (`front`), entry gate (`entryGate`), and public road-graph edge connection (`edgeId`).
   - Coordinate-derived parcel IDs are **not** a migration strategy across road layout rewrites; production worlds freeze and persist the parcel manifest before opening player leases.

3. **Building (`buildingId` vs ephemeral `renderId`)**
   - Numeric `renderId` (`1..N`) indexes instanced WebGL buffers and per-building state texels (`uState`, `uFrontage`). It is **ephemeral** and must never be stored as a database foreign key.
   - Persistent `buildingId` is bound to `parcelId`.
   - Has a **Property Owner** (`ownerId`, e.g., `city:avalon`, an NPC landlord, or a player real-estate owner) distinct from who occupies its units.

4. **Unit (`unitId`)**
   - A leasable or occupiable subdivision within a building (e.g., `${parcelId}/ground/shop-1`, `${parcelId}/upper/office-1`).
   - Multiple businesses or residents can share one building across separate units without transferring ownership of the building itself.

5. **Occupancy / Lease (`LeaseRecord`)**
   - Binds a `unitId` to an `occupantId` (a player `companyId` or NPC tenant), exterior frontage stage (`stage: 0 | 1`), and lease terms.
   - Leasing a unit never transfers `Building.ownerId`.

6. **Business / Company (`companyId`)**
   - The player's or listed company's legal entity, name, and financial state.
   - Founding a company does not spawn a skyscraper; businesses start by leasing an appropriate unit and may later relocate, purchase a building, or commission development.
   - Addresses never move automatically when a player's net-worth rank changes.

---

## 2. Authority, Privacy, and Security Boundaries

- **Server-authoritative commands**: In production, `lease`, `rename`, `upgrade`, `purchase`, and `develop` must be server-validated, authenticated, and idempotent commands (keyed by `commandId`). The local prototype module (`src/inhabit.js` + `localStorage['cities.inhabit.v1']`) is an explicitly labeled single-player demo slice, not a production endpoint.
- **Public vs. private payload**:
  - Public city payloads expose only parcel geometry, building massing, public unit occupancy (business display name, category, frontage stage), and opt-in public landmarks/crowns.
  - Public city payloads **never** include private trading positions, cash balances, order books, or non-consensual home-owner identities. Private homes remain anonymous unless the owner explicitly opts in to public display.
- **Text sanitization**: All player-supplied business names are validated (`1–32` visible characters, no `<`/`>` or control characters) and rendered via DOM `textContent` or escaped HTML.

---

## 3. Urban Growth & Expansion Rules (Contract)

The UI slider in the prototype is labeled **Generation preview** (visualizing historical/procedural build-out from core to edge). Production economic growth follows five ordered stages:

1. **Stage 1 — Occupy existing vacancies**
   - New businesses lease vacant ground-floor shops, lofts, or office suites inside already-built serviced parcels.
2. **Stage 2 — Renovate and improve frontage**
   - Tenants upgrade exterior signage and entrance frames on their leased unit (`stage: 0 -> 1`) without altering parcel footprints or street topology.
3. **Stage 3 — Infill serviced vacant parcels**
   - When district vacancy falls below threshold, audited vacant parcels (`parcelDiagnostics` with valid road access) are developed in-place using their pre-reserved street frontage.
4. **Stage 4 — Consensual redevelopment**
   - Upzoning or replacing a low-rise building requires ownership consolidation and explicit consent of active leaseholders (or lease expiration/buyout). Active player leases are never silently deleted.
5. **Stage 5 — Append expansion district**
   - Only when sustained city-wide capacity pressure warrants it, the server appends a new expansion district to the manifest. Existing parcel IDs and addresses remain immutable.
   - Dormant or abandoned accounts do not trigger endless land expansion and do not cause owned buildings to vanish.
