# Scripts

## Pattern

Scripts are written in TypeScript and run via `npx tsx`:

```bash
npx tsx scripts/my-script.ts
```

Each script's shell wrapper (`.sh`) validates required env vars from `.env.local`, then invokes tsx.

## DB layer usage

Scripts use db layer functions from `src/lib/db/` wherever an equivalent function exists. A service-role Supabase client is created in the script and injected into db layer calls via the optional `client` parameter added in issue #252:

```ts
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

await createHorse(barnId, name, supabase)
```

Raw `supabase.from(...)` calls are used only when no db layer equivalent exists (e.g. barn insert, active membership insert, teardown deletes, `auth.admin.*` calls).

## Testing

Pure function tests live in a vitest test file alongside the script (e.g. `reset-db.test.ts`). Shell wrapper behavior (env validation, tsx invocation) is tested in the corresponding `.test.sh` file.
