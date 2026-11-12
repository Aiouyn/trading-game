# City

City opens a read-only map of Port Avalon's districts, starting on the Financial Mile.

## Sub-features

- `city` opens the district view from the shelf or the phone app grid.

## How to get to it (user POV)

- On desktop, choose the City tile on the shelf.
- On the phone, from Home, choose City in the app grid. It is not on the bottom dock.

## Driving it with Playwright

Preconditions:

- The shell is showing `quay-ready`. The signed-in journey opens City after Settings. City itself does not require a trade.
- `tile-city` or `icon-city` is offered. Both exist because City is a built app. `APP_MODULES.city` is the district view.

- **Open City.** On desktop, scroll `tile-city` into view and click it. On phone, return home, scroll `icon-city` into view, and click it.
- **Read the district.** The active City surface (`win-city` on desktop, `phone-appview` on phone) contains `city`. `dv-name` reads `Financial Mile`. `dv-readonly` is visible. `coming-later` is absent.
- **Proof.** `npx tsx tools/verify/port-avalon.ts drive` records `<viewport>.city` and `<viewport>-city.png`. The shot shows the map and the Financial Mile name.

## Gotchas

- This City is the static district list, not the 3D renderer. A production build does not mount `window.__city`. Do not wait on a canvas or on `city-mount`.
- The phone dock does not include City. Looking for City there fails even when the grid icon works.
- The shelf can clip the City tile. Scroll the tile into view before clicking. A click that misses the tile does not open City.
- `dv-back` returns to Broker. The check stops on the district view and does not need that button.
