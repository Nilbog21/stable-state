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
| `DEV_SUPABASE_URL` | Reset script only | Must exactly match `NEXT_PUBLIC_SUPABASE_URL` — the destructive dev scripts (reset-db, seed-test-barn, teardown-test-barn, seed-account, change-user) refuse to run otherwise, so `.env.local` can never be accidentally pointed at prod when running them. `seed-test-barn`, `teardown-test-barn`, and `change-user` accept a `--allow-prod` flag to deliberately bypass this check — see [Manual smoke-testing against a target project](#manual-smoke-testing-against-a-target-project) |

### Dev database reset

To wipe the dev database and re-seed a known fixture set (1 barn, 1 manager, 1 additional manager, 3 trainers, 3 riders, 3 horses, 2 fee tiers, 34 lessons):

```bash
bash scripts/reset-db.sh
```

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_EMAIL`, and `DEV_NAME` in `.env.local`. The script is idempotent — safe to re-run between branches. After the DB reset, it calls `seed-account.sh` to create a managed manager stub and print an invite path; open that path on your deployment to claim the account (sign in with Google if you aren't already signed in — an already-authenticated session skips straight to an Accept Invite button). You land as manager of the barn you claimed; run `change-user.sh <barn-slug>` yourself afterward if you want to switch to another seeded role.

## Database setup

### Apply migrations

Run all migration files in `supabase/migrations/` against your Supabase project in order — either via the SQL editor in the Supabase dashboard or with `npx supabase db push`.

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
npx supabase db push
```

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

## Manual smoke-testing against a target project

Click through the live app as a seeded manager/trainer/rider against any target
project (e.g. a prod smoke test) without a password login UI or hand-rolled cookie
injection — reuses the same invite-claim + `change-user.sh` dance as local dev, just
pointed elsewhere via `--allow-prod`:

```bash
bash scripts/seed-test-barn.sh --allow-prod <slug>
```

This seeds a throwaway test barn (with `manager`/`trainer`/`rider` fixtures) and prints
a dev-manager invite path. Open that path on the target deployment and sign in with
Google to claim a real manager membership in the barn.

```bash
bash scripts/change-user.sh --allow-prod <slug>
```

Pick a role from the printed list to swap into it — refresh the page after it runs.
Run it again anytime to switch roles or switch back to yourself.

```bash
bash scripts/teardown-test-barn.sh --allow-prod <slug>
```

Clean up the barn and its fixture auth users when you're done. `--allow-prod` only
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
by that same marker, never a blanket "every barn" wipe.
