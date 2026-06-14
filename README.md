# Stable State

Stable State is a multi-tenant lesson-tracking application for equestrian barns. Each barn manages its own horses, riders, and lesson records. Barn managers oversee membership approvals and finances; trainers book and submit lessons; riders view their own lesson history.

## Roles

| Role | Capabilities |
|---|---|
| `manager` | Full barn administration: horses, riders, lessons, finances, membership approvals |
| `trainer` | Book and submit lessons; view and edit riders |
| `rider` | View own lessons |

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
| `DEV_MANAGER_EMAIL` | Reset script only | Google email to pre-authorize as dev barn manager via `seeded_accounts` |

### Dev database reset

To wipe the dev database and re-seed a known fixture set (1 barn, 1 manager, 3 trainers, 3 riders, 3 horses, 25 lessons):

```bash
bash scripts/reset-db.sh
```

Requires `SUPABASE_SERVICE_ROLE_KEY` and `DEV_MANAGER_EMAIL` in `.env.local`. The script is idempotent — safe to re-run between branches.

## Database setup

### Apply migrations

Run all migration files in `supabase/migrations/` against your Supabase project in order — either via the SQL editor in the Supabase dashboard or with `npx supabase db push`.

### Seed a manager account

Pre-authorize a manager's Google email before their first sign-in. The barn row must exist first.

```sql
INSERT INTO public.seeded_accounts (email, role, barn_id)
VALUES ('<manager-google-email>', 'manager', '<barn-uuid>');
```

On first Google OAuth sign-in the trigger `on_auth_user_created` fires and creates an active `barn_memberships` row automatically.

## Deployment

TBD — see #116.

## Known Limitations

- **Single-barn membership per user** — a user (trainer or rider) can only belong to one barn at a time. Multi-barn support is not yet implemented.
