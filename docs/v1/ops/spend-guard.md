# Spend guard — private alpha (M3-06)

Nothing in this repo provisions a host or spends money. The owner turns the dashboard controls on himself. Monetization stays out: there is no checkout and no paid gameplay tier.

Planned host, from M0-06: **Vercel Pro + Supabase Pro, about $45/month** before tax ($20 Vercel Pro seat + $25 Supabase Pro). Confirm the live invoices; an extra Vercel seat changes the Vercel side. Tick-host cost is still TBD. This build does not start a tick host.

`QUAY_SPEND_OPT_IN=1` is the only in-app yes. It lets the process accept a paid configuration. It does not open a connection, create a project, or make the file-backed auth store deployable. `assertLocalSingleProcessAuth` still returns 503 when `VERCEL` is set.

## In-app gate

| Paid provider | Env that requests it | Without `QUAY_SPEND_OPT_IN=1` | With the flag set to `1` |
|---|---|---|---|
| Hosting | `VERCEL` | Boot throws. Nothing is enabled. | Boot may continue. This build still serves the local single-process app. Auth on Vercel stays 503. |
| Database | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL` | Boot throws. No client is constructed. | The guard marks `database` enabled. `npm run ready` does not connect. |
| Analytics sink | `QUAY_ANALYTICS_SINK`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_KEY` | Boot throws. | Marked enabled. No sink is opened. Local jsonl telemetry is a different path and is not this. |
| Log sink | `QUAY_LOG_SINK`, `LOGTAIL_SOURCE_TOKEN`, `AXIOM_TOKEN`, `DATADOG_API_KEY` | Boot throws. | Marked enabled. No drain is opened. |
| Tick host | `QUAY_TICK_HOST` | Boot throws. | Marked enabled. The in-process clock is the only ticker this build starts. |

Flags must be unset or exactly `1`. `true`, `yes`, and empty-looking padding are a boot failure. Error text names the variable and never prints the value.

Boot calls `assertBootEnv` from `src/instrumentation.ts` before the server takes requests. `GET /api/health` reports `spendOptIn`, `paidProviders`, `killSwitch`, `readOnly`, and `tickAutostart`. It does not start the clock.

## Kill switch

`QUAY_KILL_SWITCH=1` pauses the in-process quote interval (`LiveMarket.start` and autostart) and makes `src/proxy.ts` answer mutating `/api/*` requests with **503** `READ_ONLY`. GET, HEAD, and OPTIONS still work, including `/api/health`.

## Cost drivers

| Driver | Cap in this build | Who changes it |
|---|---|---|
| Quote tick | One interval, `FEED_TICK_MS` = 5000. Kill switch stops it. No second ticker. | Code. An external tick host is refused until opt-in, and is still not started. |
| Paid hosting, database, analytics, log drain | Off unless `QUAY_SPEND_OPT_IN=1`. Opt-in does not connect. | Owner sets the flag, then the dashboard budgets below. |
| Local telemetry volume | Already on this base (alpha-telemetry). Not changed here. File 64 KiB, 3 rotations, directory 1 MiB, body 4096 bytes, feedback 1000 chars. Per client per minute: error 30, event 30, feedback 8. Process-wide per minute: error 120, event 120, feedback 32. | Leave those ceilings. Do not point them at a paid sink. |
| Players / sessions | One process, local files. No hosted session store in this build, so a player count cannot bill Supabase Auth. | Do not set the database env vars until a later unit replaces the file store. |
| Request path under the kill switch | Mutations 503. Reads stay. | `QUAY_KILL_SWITCH`. |

## Owner settings — Vercel

Vercel Pro seat is the plan fee. Spend Management's on-demand budget is **metered usage past the included credit**, not the seat. Setting a budget does not stop usage until Pause Production Deployments is on.

Do this as Owner or Billing. This repo cannot do it for you.

1. Team dashboard → **Settings** → **Billing** → **Spend Management** → enabled.
2. **On-Demand Budget: $10** per billing cycle.
3. Leave the automatic web and email alerts on. They fire at **50% ($5)**, **75% ($7.50)**, and **100% ($10)**.
4. Action at 100%: **Pause Production Deployments** on.
5. **Settings** → **My Notifications** → **Team** → **Spend Management**: Web and Email selected for those three thresholds. SMS at 100% is optional.
6. Do not turn off on-demand usage notifications.
7. Do not add log drains, analytics integrations, or AI Gateway usage. The pause does not cover AI Gateway.

After a pause, production stops until you raise the budget or the next cycle starts. That is the point.

## Owner settings — Supabase

Supabase Pro does **not** have a dollar-threshold alert. The control that exists is the Spend Cap, and it does not cover compute, replicas, branching, IPv4, custom domain, PITR, or log drains.

1. Organization → **Billing** → **Cost Control** → **Spend Cap: ON**. Pro starts this way. Leave it on. Off means over-quota usage is billed.
2. One project, on the compute size included with the $25 plan (the $10 compute credit covers a single Nano or Micro). Do not add a second project, a larger size, a read replica, branching, an IPv4 address, a custom domain, PITR, or a log drain.
3. Organization → **Usage**, and **Billing** → **Upcoming Invoice**. The plan fee is $25. If the upcoming invoice shows anything above that, stop and turn on the kill switch. Do not disable the Spend Cap to "fix" a quota warning.
4. Keep the billing inbox read. Over-quota mail is after the fact; it is not a $ threshold you can set.

## Readiness

```bash
npm run ready
```

Clean env: exits 0 after a write probe of the local auth and market directories (defaults `.data/auth` and `.data/market`, or `QUAY_AUTH_DATA_DIR` / `QUAY_STORM_DATA_DIR`). There is no SQL migration set. With `READY_URL=http://127.0.0.1:<port>` it also requires `GET /api/health` to return `ok: true`.

A paid database URL without opt-in makes `ready` exit 1. With opt-in it prints that it did **not** connect.

`npm run preflight` stays the CI app-check mirror. It is not this hosting check.

## Hand check

1. `npx vitest run tests/unit/spend/spend-guard.test.ts`
2. `DATABASE_URL=https://example.supabase.co npx tsx -e "import { register } from './src/instrumentation.ts'; register()"` — must throw, and the text must not contain `example.supabase.co`.
3. `QUAY_SPEND_OPT_IN=1 DATABASE_URL=https://example.supabase.co npx tsx -e "import { assertPaidProviderEnabled } from './src/server/spend/guard.ts'; assertPaidProviderEnabled(process.env, 'database')"` — must exit 0 and open nothing.
4. Normal server: `curl -s localhost:<port>/api/health` shows `spendOptIn: false` and `paidProviders: []`.
5. Same server with `QUAY_KILL_SWITCH=1`: health shows `readOnly: true` and `tickAutostart: false`. `POST /api/auth/login` is 503. A GET still returns.
6. Vercel and Supabase: the clicks in the two sections above. Confirm the on-demand budget reads $10 and the Spend Cap toggle reads on.
