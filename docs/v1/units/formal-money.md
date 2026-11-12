# Formal money check

Notes for the money-conservation check. Not a product change. `UNIT.md` is untouched.

**Product tree read:** `f8f51ad92273214eafd0a0d06afa4c0b79fabaec` (`origin/main`, Broker idempotency merge). The check was confirmed at `6bfb1909980bc29598f219e89f3d3509aa7599ac` (no product source edits).

**Tool:** fast-check 3.23.2 on the real TypeScript functions. No verifier runs on this language. A TLA+ model would not execute `applyPosting` or `centsOf`, so it was not used.

**Command:** `npm run test:formal-money`

**CI:** `.github/workflows/ci.yml` runs that command in the `checks` job after `npm ci` in `packages/engine/ledger`. No existing step was removed or weakened. `npm test` does not include `tests/formal`.

**Properties:** ledger balances sum to 0; M0_sys moves only by the mint or burn just posted; a trade's `MKT_EXCHANGE_FEE` leg and the three cash legs move once; listed player cash + book cash, and player qty + book tokens, stay constant; a catalog fill moves the player by one notional and one taker fee; the same idempotency key is one journal row and one fill set after `parsePlayerPrivateRow`, including when the last-50 receipt ring is dropped.

**Out of scope:** NPC cash for catalog names, pools, the HTTP socket, maker/taker splits.

**How to rerun and maintain:** `.cursor/skills/formal-money/SKILL.md`. After a change to the covered sources that did not go through that skill, run `/maintain-formal-verification-skill`.
