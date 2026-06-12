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
