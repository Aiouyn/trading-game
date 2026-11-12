# Settings

Settings opens the signed-in account from the account chip and shows that player's handle and world.

## Sub-features

- `settings` opens Settings, Account, for the account that just traded.

## How to get to it (user POV)

- After signing in, the handle is a chip on the desktop status strip and on the phone home screen.
- Choose that chip. Settings opens with the Account panel.

## Driving it with Playwright

Preconditions:

- The first account's signup check passed.
- On phone, the home grid is reachable. The script leaves Broker or Settings by the Quay mark until `app-grid` is visible.

- **Open Settings.** On desktop click `account-chip`. On phone, go home and click `account-chip-home`.
- **Read the account.** `settings` is visible, `account-handle` is the first account's handle, and `account-world` contains `world_port_avalon`.
- **Proof.** `npx tsx tools/verify/port-avalon.ts drive` records `<viewport>.settings` and `<viewport>-settings.png`.

## Gotchas

- Desktop Settings defaults to Appearance when opened from the shelf tile. The account chip opens Account directly. Use the chip.
- On the phone, `account-chip` in the status bar and `account-chip-home` on the home widget are the same account. This check uses the home chip so the screenshot shows the home entry the player taps.
- The signup step already landed on Account. This check leaves that screen and opens Settings again, so a pass is a second visit, not the form that just submitted.
