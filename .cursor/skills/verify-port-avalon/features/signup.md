# Sign up

Sign up creates a new Port Avalon account from the home screen and shows that handle as signed in, on the shared world.

## Sub-features

- `signup-a` creates the first fresh account and shows its handle.
- `signup-b` creates a second fresh account in another browser context.

## How to get to it (user POV)

- On the desktop status strip or the phone home screen, choose **Sign in**.
- Settings opens on Account. The mode is **Create account**.
- Enter a handle and a password of at least 8 characters, then submit.

## Driving it with Playwright

Preconditions:

- `doctor` reports a healthy production server.
- The handle is not already in this run's auth directory. The script uses a new handle every play.

- **Open the form.** Choose **Sign in**. The script boots `/` with `boot` from `tests/e2e/shell/helpers.ts`, clicks `sign-in-entry`, and declines `quay-consent-decline` if the analytics card appears. The Account form (`account-handle-input`) is visible. On a phone that opened the Settings list instead, it clicks `set-nav-SET-01` first.
- **Create the account.** Fill the handle and `verify-player`, then click `account-submit`. `account-handle` reads that handle, `account-logout` is visible, and `account-world` contains `world_port_avalon`.
- **Second account.** Repeat in a second browser context so the two sessions do not share the `quay_sid` cookie.
- **Proof.** Run `npx tsx tools/verify/port-avalon.ts drive --viewport desktop` (and again with `--viewport phone`, or omit `--viewport` to play both). `report.json` checks `<viewport>.signup-a` and `<viewport>.signup-b` are ok, and `<viewport>-signup-a.png` and `<viewport>-signup-b.png` show the signed-in handle.

## Gotchas

- The first pointer on a production build can open the analytics card. Decline it before the next click or it can cover the corner of the form.
- A handle must start with a letter and then use only letters, digits, and underscore, 3–32 characters. The script's `Va` / `Vb` handles do.
- Password shorter than 8 characters never reaches the server; the form shows `account-error`.
- Two tabs in one browser context share the session. Isolation needs two contexts.
