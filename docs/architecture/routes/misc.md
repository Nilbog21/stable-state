# Miscellaneous routes

## `/calendar.ics`

**Roles:** Token (no session)

#1018 — Route Handler (`src/app/calendar.ics/route.ts`), not a page — one of two sanctioned exceptions to "no API routes" (see `ARCHITECTURE.md`'s Server actions pattern section; the other is `/api/cron/reset-demo` below), since an external calendar app's poller can't run a Server Action or carry a session cookie.
`GET`-only; reads `?token=` from the query string, missing → `400`.
The token is checked against `barn_memberships.calendar_feed_token` entirely inside the `get_calendar_feed` `SECURITY DEFINER` RPC (see [`rpc/calendar.md`](../rpc/calendar.md)) — there is no `requireMembership` call here, since that helper's `redirect()`/`notFound()` calls are Server Component/Action-only and don't work inside a Route Handler; an unknown/inactive token → `404`.
A valid token returns `200` with `Content-Type: text/calendar; charset=utf-8` and a hand-rolled RFC 5545 `.ics` body (`buildIcsFeed`, `src/lib/ics.ts`) built fresh from the RPC's role-filtered rows every request — no stored file, no cache, `Cache-Control: no-store`.
Linked from `/profile?barn=<slug>`'s Calendar Feed section (see `/profile`'s entry in [`auth.md`](auth.md))

## `/demo`

**Roles:** unauthenticated

Entry point for the public demo experience (#505).
Server Component `notFound()`s if `DEMO_USER_EMAIL` isn't set; otherwise renders `DemoLoader`, a Client Component (spinner + "Explore Stable State" heading) that calls the co-located `createOrResumeDemoBarn` Server Action on mount.
The action signs an unauthenticated visitor in as the shared `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` auth user (an already-authenticated real user keeps their own session and gets the demo barn added to their account instead), resumes an existing demo barn via the `demo_barn_slug` cookie when it and the visitor's membership on it both still exist, otherwise reaps the oldest `is_demo=true` barn once `DEMO_BARN_CAP` is reached and creates+seeds (`seedBarn()`, `scripts/seed-barn.ts`) a fresh one (slug `demo-{8 hex chars}`), adds the visitor as its manager, sets `demo_barn_slug` + the same `barn_session_{slug}` cookie `/barn/[slug]/*` routes require, and redirects into it

## `/api/cron/reset-demo`

**Roles:** `CRON_SECRET` bearer token (no session)

#506 — Route Handler (`src/app/api/cron/reset-demo/route.ts`), the other sanctioned exception to "no API routes" (see `/calendar.ics` above) — Vercel Cron (`vercel.json`'s `crons` entry, hourly) calls a plain HTTP endpoint and can't invoke a Server Action.
`POST`-only; requires an `Authorization: Bearer <CRON_SECRET>` header matching the `CRON_SECRET` env var, else `401` (an unset `CRON_SECRET` also denies everyone, rather than leaving the endpoint open).
Reuses the same reap mechanism `/demo` already calls inline (`getOldestDemoBarn`/`countDemoBarns`/`teardownBarnData`/`deleteBarn`, all in `src/lib/db/barns.ts` + `service-role.ts`) via a service-role client, repeatedly tearing down and hard-deleting the oldest `is_demo=true` barn while it's either older than 6 hours or the total demo barn count still exceeds `DEMO_BARN_CAP` (0 = no cap enforcement here) — `/demo`'s own cap check only ever reaps reactively, on the next visitor's page load, so this also acts as a standing safety valve between visits.
Returns `200` with `{ "reaped": <count> }`
