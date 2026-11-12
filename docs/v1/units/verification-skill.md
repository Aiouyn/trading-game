# Verification skill

Player-facing proof for Port Avalon web V1 lives in `.cursor/skills/verify-port-avalon/`. Agents run it with `npx tsx tools/verify/port-avalon.ts run`.

The command builds a production Next.js app without the Playwright e2e flags, starts `next start` on a free loopback port other than 3199 or 3102, and drives Chromium through the player UI at 1280×800 and 390×844. It signs up two fresh accounts, checks that the second cannot see the first account's HALC holding or resting limit, places that market buy and limit through the Broker ticket, reloads, and checks that the holding and order are still there. It then opens Settings from the account chip and City from the shelf or the phone grid. Screenshots and `report.json` stay under `proof/verify-port-avalon/`. Cleanup signals only the pid this run started.

The click path reuses `tests/e2e/shell/helpers.ts` and the Broker test ids from `tests/e2e/17b/M1-06-broker-orders.spec.ts`. It does not post orders to `/api/broker/orders` itself. Keep the feature files in step with those screens when the buttons move. `/maintain-verification-skill` is the upkeep loop.
