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

## Responsibility split

Each script is split into three files with distinct responsibilities:

- **`.sh`** — reads `.env.local`, validates required env vars, CLI arg parsing, prompting for missing args, defaulting to `DEV_*` env vars, invoking `npx tsx`
- **`.ts`** — pure business logic; reads `process.env` for credentials and values the shell wrapper has already validated; no CLI arg parsing or prompting; no `readline` (exception: interactive numbered-list selection when bash cannot do it cleanly — see `change-user.ts`); pure functions accept business-logic inputs as function arguments
- **`.test.ts`** — vitest tests for pure functions exported from `.ts`

Add a **`.test.sh`** only when the shell script has non-trivial branching logic (e.g. `change-user.sh`). Shell-only scripts with no extractable pure logic (e.g. `ci.sh`, `check-coverage.sh`) need no `.ts` counterpart.

`reset-db` is the canonical example of the full pattern.

### Audit — release-2

| Script | `.sh` | `.ts` | `.test.ts` | `.test.sh` | Notes |
|---|---|---|---|---|---|
| `reset-db` | ✓ | ✓ | ✓ | ✓ | Canonical model |
| `change-user` | ✓ | ✓ | ✓ | ✓ | `.ts` uses `readline` for numbered-list selection; bash can't do this cleanly |
| `seed-account` | ✓ | ✓ | — | — | No extractable pure functions (all operations are DB calls); no non-trivial shell branching |
| `ci` | ✓ | — | — | ✓ | Shell-only |
| `check-coverage` | ✓ | — | — | ✓ | Shell-only |

## Testing

Pure function tests live in a vitest test file alongside the script (e.g. `reset-db.test.ts`). Shell wrapper behavior (env validation, tsx invocation) is tested in the corresponding `.test.sh` file.
