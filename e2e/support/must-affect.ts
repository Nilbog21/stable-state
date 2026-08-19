// Affected-row assertions for fixture mutations (#1435).
//
// `mustSucceed` (`src/lib/db/service-role.ts`) throws only on `result.error`. A PostgREST
// `.update().eq(...)` or `.delete().eq(...)` that matches **no row** is not an error — it comes
// back `data: []`, `error: null` — so a setup write whose filter has drifted off its target
// succeeds loudly and does nothing.
//
// ## Why a mutation pass cannot find this
//
// Mutation testing scores *assertions* against a live fixture. When the assertion is correct and
// the **setup** produced nothing, every mutant still dies and the pass still goes green — it is
// structurally blind to a fixture that silently became empty. #1424 shipped exactly that: the
// demo-reaper spec's `barns.created_at` backdate updated zero rows, so both reaper checks were
// passing against an empty set, through a 15/15 mutation pass. A review agent caught it; the pass
// could not have. **The missing check is on the setup call's row count, not on the assertion.**
//
// ## Why this is opt-in, and never folded into `mustSucceed`
//
// A zero-row mutation is not universally a defect. `fixtures.ts`'s `deleteThrowawayAuthUser`
// deletes a profile that only exists once the throwaway login claimed an invite — matching nothing
// is the ordinary shape of a run that failed before the claim. A blanket check inside `mustSucceed`
// would break that legitimately-empty case, and a gate that fires on correct code is a gate people
// route around. So the caller opts in by name, and a site that stays on `mustSucceed` says why in a
// comment (spec-maintenance rule 5).
//
// ## Why it takes a result rather than a builder
//
// Same shape as `mustSucceed`: the call site appends `.select('id')` and awaits, and this unwraps
// what comes back. Wrapping the builder instead would buy the same guarantee at the cost of
// threading `PostgrestFilterBuilder`'s generics through every call, and would hide the `.select()`
// that makes the row count available in the first place.
//
// A mutation already ending `.select(...).single()` needs none of this: PostgREST fails a `.single()`
// matching zero rows with `PGRST116`, which `mustSucceed` already throws on.
import { mustSucceed } from '@/lib/db/service-role'

/**
 * Asserts a fixture mutation actually matched rows, and returns them.
 *
 * @param result  an awaited PostgREST mutation ending in `.select(...)` — without it `data` is
 *                `null`, which is treated as zero rows rather than crashing on `.length`.
 * @param label   names the write, as `mustSucceed`'s does; it is what the throw leads with.
 * @param expected exact row count. Omit for "at least one", which is the right answer whenever the
 *                count varies with the fixture (`.in('kind', [...])` over a lesson's transactions is
 *                one row or two depending on whether the tier carries an instructor cut). Pass a
 *                number only when the target is a single row by primary key — an over-tight exact
 *                count is a flake, and at-least-one already catches the #1424 shape.
 */
export function mustAffect<T>(
  result: { data: T[] | null; error: unknown },
  label: string,
  expected?: number
): T[] {
  const rows = mustSucceed<T[] | null>(result, label) ?? []
  const matched = expected === undefined ? rows.length > 0 : rows.length === expected
  if (!matched) {
    throw new Error(
      `${label}: matched ${rows.length} rows, expected ${expected ?? 'at least 1'} — the setup this ` +
        'write performs did not happen, so nothing downstream of it is measuring what it claims'
    )
  }
  return rows
}
