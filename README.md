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

### Dev database reset

To wipe the dev database and re-seed a known fixture set (1 barn, 1 manager, 1 additional manager, 3 trainers, 3 riders, 1 pending rider, 3 horses, 2 fee tiers, 34 lessons):

```bash
bash scripts/reset-db.sh
```

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_EMAIL`, and `DEV_NAME` in `.env.local`. The script is idempotent — safe to re-run between branches. After the DB reset, it calls `seed-account.sh` to create a managed manager stub and print an invite path; open that path on your deployment and sign in with Google to claim the account, then `change-user.sh` lets you select a dev role to sign in as.

## Database setup

### Apply migrations

Run all migration files in `supabase/migrations/` against your Supabase project in order — either via the SQL editor in the Supabase dashboard or with `npx supabase db push`.

### Seed a manager account

Create an unclaimed managed-manager stub for a barn. The script inserts a stub profile (`is_managed=true`, no email) and an active manager membership with an invite token, then prints the invite path:

```
Invite path: /barn/<slug>/login?token=<token>
```

Open that path in the app and sign in with Google to claim the account — `claim_managed_member` links your auth user to the stub and clears the token.

**Prerequisites:**
- The barn slug must already exist (create via the Supabase dashboard if needed)
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

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
bash scripts/seed-account.sh
```

The script prints an invite path (`/barn/<slug>/login?token=<token>`). Send the full URL (production domain + invite path) to the barn manager — they open it and sign in with Google to claim the account. A plain sign-in without the invite link will **not** activate the account.

### 3. Add redirect URLs to Supabase

In the Supabase dashboard → **Authentication** → **URL Configuration**, add both URLs to the **Redirect URLs** list:

- `https://<your-vercel-domain>.vercel.app` (production)
- `https://*.vercel.app/**` (preview deployments)

### 4. Add redirect URIs to Google OAuth

In Google Cloud Console → **APIs & Services** → **Credentials** → your OAuth 2.0 client, add both URLs to **Authorized redirect URIs**:

- `https://<your-vercel-domain>.vercel.app/auth/callback`
- `https://*.vercel.app/auth/callback`
