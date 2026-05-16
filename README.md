This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database Setup

### Apply the schema migration

Paste the contents of `supabase/migrations/20260516000000_roles_and_barn_memberships.sql` into the Supabase dashboard SQL editor and run it.

### Seed the admin account

After the migration runs, insert the admin's Google email address into `seeded_accounts`. On the admin's first Google OAuth sign-in, the SQL trigger `on_auth_user_created` fires automatically — it checks whether the new user's email is in `seeded_accounts` and, if so, creates an active `barn_memberships` row for them.

```sql
INSERT INTO public.seeded_accounts (email, role, barn_id)
VALUES ('<admin-google-email>', 'admin', NULL);
```

### Seed a manager account

To pre-authorize a manager for a specific barn, insert their Google email after the barn row exists:

```sql
INSERT INTO public.seeded_accounts (email, role, barn_id)
VALUES ('<manager-google-email>', 'manager', '<barn-uuid>');
```

The same SQL trigger applies: when the manager first signs in with Google, `on_auth_user_created` matches their email against `seeded_accounts` and creates an active `barn_memberships` row automatically.
