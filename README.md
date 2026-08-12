# Stable State

Stable State is a multi-tenant lesson-tracking application for equestrian barns. Each barn manages its own horses, riders, and lesson records. Barn managers oversee membership approvals and finances; trainers book and submit lessons; riders view their own lesson history.

## Roles

| Role | Capabilities |
|---|---|
| `manager` | Full barn administration: horses, riders, lessons, finances, membership approvals |
| `trainer` | Book and submit lessons; view and edit riders |
| `rider` | View own lessons and horses; track outstanding payments; manage own documents |

## Prerequisites

- Node 20+
- A Supabase project (cloud) or the [Supabase CLI](https://supabase.com/docs/guides/cli) for local development

Running the app needs only the above. The dev scripts in `scripts/` and the workflow skills in `.claude/commands/` additionally assume:

- **The Supabase CLI linked to the project you're targeting** (`npx supabase link --project-ref <ref>`) — required by the migration scripts and by the `/sync-migrations` workflow skill.
- **A POSIX shell** — Linux or macOS. On Windows, use WSL: `scripts/*.sh` are bash, and the skills background a dev server, write logs under `/tmp`, and kill process groups, none of which have a native Windows equivalent.
- **GNU coreutils** — the skills use GNU-only flags (`date -d`, `sort -V`). `brew install coreutils` covers both on macOS; where a plain BSD equivalent exists the skill text notes it inline (`date`), and where none does (`sort -V`) coreutils is the only option.
- **The [`gh` CLI](https://cli.github.com/), installed and authenticated** (`gh auth login`) — nearly every step of every workflow skill shells out to it for issues, PRs, labels, and checks.
- **`jq`, `curl`, and `ss`** — used for label lookups, dev-server readiness polling, and stopping a worktree's dev server respectively. `ss` is iproute2, so that last one is Linux-only: it replaced `lsof` in #1155 because `lsof -ti:{port}` returns empty here for a demonstrably listening `next-server`, leaking the dev server at close-out. On macOS, substitute `lsof -ti:{port} -sTCP:LISTEN` in `/finishIssue`'s Step 6.

## Development setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key
3. Start Supabase locally (`npx supabase start`) or point `.env.local` at a remote project
4. `npm run dev`

Open [http://localhost:3000](http://localhost:3000).

### `.env.local` variables

| Variable | Required for | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | App + reset script | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Reset script only | Service role key — bypasses RLS; never expose client-side |
| `DEV_EMAIL` | Reset script only | Your Google email — used by change-user.sh; must match the Google account you claim the seed invite with |
| `DEV_NAME` | Reset script only | Your full name (first last) — split on first space for first/last name defaults in seed-account.sh |
| `DEV_BARN` | Reset script only (optional) | Default barn slug for seed-account.sh (defaults to `dev-barn`) |
| `CRON_SECRET` | `/api/cron/reset-demo` + e2e checklist suite | Bearer token the demo-reaper cron route authenticates against; generate with `openssl rand -hex 32`. Production's value lives in Vercel (`vercel.json` runs the route daily at 08:00 UTC — the Hobby plan allows a cron at most one run per day, #1438), but a local one is **required** — `run-checklist-suite.sh` refuses to start without it and exports it into the Playwright process, because the reaper spec has no other way to authenticate its POST. The check is that it is *set here*, not that it matches the origin under test: the route reads the variable from the server answering the request, so a dev server booted before you added it, or a `--base-url` naming a deployment, authenticates against a different value and the reap check gets a `401` |
| `DEV_SUPABASE_URL` | Reset script only | Must exactly match `NEXT_PUBLIC_SUPABASE_URL` — the destructive dev scripts (reset-db, seed-test-barn, teardown-test-barn, e2e-auth-users, seed-account, change-user) refuse to run otherwise, so `.env.local` can never be accidentally pointed at prod when running them. `seed-test-barn`, `teardown-test-barn`, `e2e-auth-users`, and `change-user` accept a `--allow-prod` flag to deliberately bypass this check — see [Manual smoke-testing against a target project](#manual-smoke-testing-against-a-target-project). `run-checklist-suite` accepts the same flag with the same meaning, applying it to its own in-process seeding and forwarding it to the `teardown-test-barn` call it makes |

### Dev database reset

To wipe the dev database and re-seed a known fixture set (1 barn, 1 manager, 1 additional manager, 3 trainers, 3 riders, 3 horses, 2 fee tiers, 34 lessons):

```bash
bash scripts/reset-db.sh
```

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_EMAIL`, and `DEV_NAME` in `.env.local`. The script is idempotent — safe to re-run between branches. After the DB reset, it calls `seed-account.sh` to create a managed manager stub and print an invite path; open that path on your deployment to claim the account (sign in with Google if you aren't already signed in — an already-authenticated session skips straight to an Accept Invite button). You land as manager of the barn you claimed; run `change-user.sh <barn-slug>` yourself afterward if you want to switch to another seeded role.

## Development worktrees

Development runs across several [git worktrees](https://git-scm.com/docs/git-worktree) so more than one issue can be in flight at once — each worktree holds a different issue branch and its own dev server, and the primary checkout stays free on `main` or the current release branch. This is a convention, not a requirement: a single checkout works fine, and the workflow skills in `.claude/commands/` fall back to asking which worktree to use when they can't detect one.

The worktree directory is a **sibling** of the primary checkout:

```
projects/
  stable-state/                 # primary checkout
  stable-state-worktrees/
    alpha/  beta/  gamma/  delta/  epsilon/     # yours
    fable-1/  fable-2/  …                       # /fableFleet's, never used interactively
```

Names are arbitrary and ordered — the fleet grows by adding the next Greek letter. Nothing in the application depends on the count; `scripts/workflow-context.sh` holds the list, and the five workflow skills that detect a worktree (`beginIssue`, `reviewIssue`, `testIssue`, `finishIssue`, `continueIssue`) read it from there, so that script is the one file to update when a worktree is added or removed.

The `fable-N` worktrees are separate: `/fableFleet` provisions them for its headless workers, sizes the fleet to a batch's concurrency cap, and leaves them in place between batches as standing infrastructure — the same way the Greek-letter ones persist. Don't work in them interactively. They're a **rule** in `workflow-context.sh` rather than list entries (port `3100+N`, unbounded), so adding one needs no edit there; they're also deliberately absent from the `worktrees=` list the skills offer when they have to ask a human which worktree to use.

Create one with:

```bash
git -C stable-state worktree add ../stable-state-worktrees/zeta -b some-branch
```

### Dev server ports

Each worktree owns a fixed port so several dev servers can run side by side. `scripts/workflow-context.sh` holds the canonical mapping and the workflow skills read it from there; this table mirrors it for a human reader:

| Worktree | Port |
|---|---|
| `alpha` | 3001 |
| `beta` | 3002 |
| `gamma` | 3003 |
| `delta` | 3004 |
| `epsilon` | 3005 |
| `fable-N` | 3100 + N (`fable-1` → 3101) |

```bash
npm run dev -- -p 3001
```

Landing on the wrong `localhost:{port}` while testing is a common source of confusion — `/testIssue` checks the dev-server log for the request before it starts diagnosing a reported problem.

### `.env.local` across worktrees

`.env.local` is gitignored, so each worktree needs its own. The convention is to **symlink** it back to the primary checkout rather than keep independent copies:

```bash
ln -s ../../stable-state/.env.local .env.local
```

One consequence worth knowing: every worktree then points at the **same** dev Supabase project. Branches in different worktrees share one database, so migrations can't truly be developed in parallel — two worktrees pushing migrations at once will collide, and a worktree's schema may be ahead of or behind the branch it has checked out.

## Database setup

### Apply migrations

Run all migration files in `supabase/migrations/` against your Supabase project in order — either via the SQL editor in the Supabase dashboard or with:

```bash
bash scripts/assert-dev-project.sh && npx supabase db push
```

`assert-dev-project.sh` (#1291) fail-closes unless `.env.local` points at `DEV_SUPABASE_URL` *and* the project the CLI is linked to is that same project — `db push` targets the linked project, not `.env.local`, so a stale `npx supabase link` is what it's there to catch. Pass `--allow-prod` for a deliberate production push (below).

### Seed a manager account

Create an unclaimed managed-manager stub for a barn. The script inserts a stub profile (`is_managed=true`, no email) and an active manager membership with an invite token, then prints the invite path:

```
Invite path: /barn/<slug>/register?token=<token>
```

Open that path in the app and sign in with Google to claim the account — `claim_managed_member` links your auth user to the stub and clears the token. If you're already signed in in that browser, the page skips Google and shows an Accept Invite button instead.

**Prerequisites:**
- The barn slug must already exist (create via the Supabase dashboard if needed)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DEV_SUPABASE_URL` in `.env.local`

```bash
bash scripts/seed-account.sh
```

The script prompts for first name, last name, and barn slug (defaults to `DEV_NAME` and `DEV_BARN` from `.env.local` if set). Each run creates a fresh stub — if your Google account has already claimed a profile, claiming a new invite will fail; run the full `reset-db.sh` instead. To enable instructor access (so the manager can be assigned as a lesson instructor), toggle "Can instruct" in barn Settings → Members.

## Production bootstrap

One-time steps to bring a new production environment online. Run these after the Supabase project and Vercel deployment are provisioned.

### 1. Apply migrations

Link the Supabase CLI to the production project, then push all migrations:

```bash
npx supabase link --project-ref <project-ref>
bash scripts/assert-dev-project.sh --allow-prod && npx supabase db push
```

`--allow-prod` is required here — without it the guard aborts, since the CLI is now linked to production. It still prints the linked ref, so you can confirm the `link` above took the project you meant.

The `<project-ref>` is the string in the Supabase dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`.

### 2. Seed the initial manager account

Create the barn manager's account stub before their first sign-in. The barn slug must exist first (create it via the Supabase SQL editor or dashboard if needed).

```bash
bash scripts/seed-account.sh --allow-prod
```

`--allow-prod` skips the `DEV_SUPABASE_URL` dev-project check — only pass it for this one-time production bootstrap step, never for routine dev seeding.

The script prints an invite path (`/barn/<slug>/register?token=<token>`). Send the full URL (production domain + invite path) to the barn manager — they open it and sign in with Google to claim the account. A plain sign-in without the invite link will **not** activate the account.

### 3. Set up the demo user

Create the shared demo account used by the public demo flow. Safe to re-run any time (it resets the demo password rather than erroring), and works the same way locally — no `--allow-prod` flag needed. Requires the Email provider enabled in the Supabase dashboard (**Authentication → Providers → Email**) — a one-time step per project, since the app's normal sign-in flow is Google OAuth only:

```bash
bash scripts/setup-demo-user.sh
```

The script prints `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` lines — paste them directly into `.env`.

### 4. Add redirect URLs to Supabase

In the Supabase dashboard → **Authentication** → **URL Configuration**, add both URLs to the **Redirect URLs** list:

- `https://<your-vercel-domain>.vercel.app` (production)
- `https://*.vercel.app/**` (preview deployments)

### 5. Add redirect URIs to Google OAuth

In Google Cloud Console → **APIs & Services** → **Credentials** → your OAuth 2.0 client, add both URLs to **Authorized redirect URIs**:

- `https://<your-vercel-domain>.vercel.app/auth/callback`
- `https://*.vercel.app/auth/callback`

## Pinned timezones

The test suite runs in a deliberately awkward zone so that a wrong-frame call site fails a
test instead of waiting for a human to spot it (#1221). #1222 has since deleted the
viewer-local frame, leaving barn-local (`barns.timezone`) and zoneless calendar dates — but
the pin matters just as much, because the frame that must never leak in is the *host's*, and
unpinned it hides: a developer machine on `America/New_York` *is* the `barns.timezone`
default, and CI is UTC.

| Process | Zone | Set in |
|---|---|---|
| Vitest workers | `Asia/Kolkata` | `vitest.config.mts` (`test.env.TZ`) |
| Playwright browser context | `Asia/Kolkata` | `playwright.config.ts` (`use.timezoneId`), value from `e2e/support/timezone.ts` |
| `next dev` | `UTC` | `package.json`'s `dev` script — matches Vercel |

`Asia/Kolkata` is +5:30 with no DST: distinct from both the barn default and UTC in every
run, and the half-hour offset additionally breaks anything assuming whole-hour offsets. The
Playwright *runner* process is left on your own zone on purpose — `e2e/support/fixtures.ts`
places every fixture either UTC-framed (`monthAnchor`) or barn-framed (`daysFromNow`), so
nothing it computes reads the runner's clock. A spec that computes an expected date runner-side
to compare against what the page rendered is the exception: it must name `BROWSER_TIMEZONE`
(`e2e/support/timezone.ts`) explicitly, since the runner and the browser no longer agree.

A test that breaks under the pin gets fixed at its source. Re-pinning that one test back to
UTC restores exactly the blindness this exists to remove.

## Manual smoke-testing against a target project

Click through the live app as a seeded manager/trainer/rider against any target
project (e.g. a prod smoke test) without a password login UI or hand-rolled cookie
injection — reuses the same invite-claim + `change-user.sh` dance as local dev, just
pointed elsewhere via `--allow-prod`:

```bash
bash scripts/e2e-auth-users.sh --allow-prod create   # once per project
bash scripts/seed-test-barn.sh --allow-prod <slug>
```

The three e2e logins (`manager@e2e.test`, `trainer@e2e.test`, `rider@e2e.test`) are a
one-time per-project bootstrap, not part of any barn seed — `reset-db.sh` creates them
on the dev project, and `e2e-auth-users.sh create` is how any other project gets them.
`seed-test-barn.sh` verifies they exist and stops if they don't.

`seed-test-barn.sh` then seeds a throwaway test barn (giving those three logins a
membership in it) and prints a dev-manager invite path. Open that path on the target
deployment and sign in with Google to claim a real manager membership in the barn.

```bash
bash scripts/change-user.sh --allow-prod <slug>
```

Pick a role from the printed list to swap into it — refresh the page after it runs.
Run it again anytime to switch roles or switch back to yourself.

```bash
bash scripts/teardown-test-barn.sh --allow-prod <slug>
```

Clean up the barn when you're done. The three e2e logins are per project, not per barn,
so they survive teardown — `bash scripts/e2e-auth-users.sh --allow-prod delete` removes
those separately, and should be run once you're finished with the project entirely
(their password is published in this repo). `--allow-prod` only
skips the `DEV_SUPABASE_URL` dev-project check — it does not relax which barn or rows
are touched: `teardown-test-barn.sh` refuses to delete any barn whose row isn't marked
`is_test_barn` (only `seed-test-barn.sh` sets this), so a mistyped or misremembered
slug can never delete a real customer barn, even under `--allow-prod`.

To clean up every leftover test barn on a project at once instead of one slug at a
time, pass `--all` in place of the slug:

```bash
bash scripts/teardown-test-barn.sh --allow-prod --all
```

This tears down every barn marked `is_test_barn` on the target project — still scoped
by that same marker, never a blanket "every barn" wipe. `--prefix <p>` narrows that to
test barns whose slug starts with `p`, which is how a checklist-suite run cleans up only
its own barns rather than a concurrent run's.

### Running the checklist e2e suite against a target project

`run-checklist-suite.sh` seeds a throwaway barn **per spec file, per Playwright project**
under a shared run prefix (`e2e-{epoch}-{RANDOM}`), runs the Playwright checklist suite
against them, and tears every barn carrying that prefix back down. Seeding is the reset —
a spec that mutates barn-wide state can't pollute or race another spec, because they never
share a barn. The project (`manager`/`trainer`/`rider`/`mobile`) is part of the slug rather
than just the spec file because Playwright dispatches one job per file *and* project, and
most specs are greped by several roles — so two jobs would otherwise contend for one barn. To point that whole cycle at a deployment instead of local dev, give it the origin
and opt in with `--allow-prod`:

```bash
bash scripts/e2e-auth-users.sh --allow-prod create   # once per project, as above
bash scripts/run-checklist-suite.sh --base-url https://<your-domain> --allow-prod --hold-open
```

`--allow-prod` means the same thing here as in the scripts above — it bypasses the
`DEV_SUPABASE_URL` check. Without it the suite's own seeding and the teardown call stay
fail-closed, so a run can only ever touch a non-dev project deliberately. It does require
`--base-url`, since otherwise the run would seed the target project and then drive
`localhost:3000`, which reads that same target-pointed `.env.local`.

Note that `.env.local` is what selects the Supabase project — `--base-url` only says which
origin to drive. Point `.env.local` at the target project before running, or the seeded
barn and the login cookies land on a different backend than the one serving `--base-url`
and every spec fails on auth.

`--hold-open` prompts after the automated specs finish (pass or fail) and defers teardown
until you press Enter, so you can work the manual checklist steps in the seeded barns.
Teardown still runs on Enter, on Ctrl-C, and on a failing suite. If the run is `SIGKILL`ed
outright, the run prefix printed before Playwright starts is what to hand to
`teardown-test-barn.sh --prefix <prefix>`.

Other flags: `--interactive` for a headed run including `@visual` specs, and `--spec
<path>` (repeatable) to scope the run to particular spec files instead of the full suite.
