// covers: src/app/barn/[slug]/(protected)/settings/**
//
// Phase 2's lesson-tier block (checklists/pre-release/phase-2-manager-seeding.md, from
// "Create tier **Beginner**" through "rejected with both errors shown together"): the three
// creates driven through /settings/tiers/new, the list they land in, and the five validation
// outcomes — a blank price, a $0 price, a whitespace-only name on create and on edit, and both
// fields blank at once.
//
// Adjacent prior art, not a duplicate of it: checklist-phase4-settings-tiers-events.spec.ts owns
// the *settings-page* side of tiers — the non-retroactive amber warnings, the instructor-cut
// pre-fill, default/deactivate/reactivate, and the #1417 Add Tier round trip. It drives the same
// form and asserts no rejection at all. Every test here is a create or a rejection; the one
// overlap is that both files open the Lesson Tiers accordion, which is why each keeps its own
// local opener rather than either reaching into e2e/support (an edit there is `ALWAYS_FULL`).
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Not an oversight. Spec-maintenance rule 5 binds a fixture `.update(`/`.delete(` whose zero-row
// result would go unnoticed; this file's seed callback contains neither. Its one write is
// `addTier`, which bottoms out in lesson-tiers.ts's `createTier` — a pure
// `.insert(...).select().single()`, which PostgREST fails with `PGRST116` on zero rows and
// `mustSucceed` already throws on. That is the "already guarded" shape rule 5 names.
//
// ## Why nothing here needs a positive anchor (#1434)
//
// Also not an oversight. Rule 4 binds absence assertions; this file makes none. Every claim is
// positive — an error message renders, or a stored value reads back off the tier's own form —
// so there is no matcher here that could be satisfied on its first poll.
import { test, expect, withBarn, type Page } from './support/test'
import { settledTextContents } from './support/read'
import { waitForBarnPageHydrated } from './support/hydration'
import { addTier } from './support/fixtures'

// ---------------------------------------------------------------------------
// The tiers this file enters, and the values it expects back
// ---------------------------------------------------------------------------
//
// Prices are strings because that is what both ends of the round trip speak: `#tier-price` is a
// text input, and the readback is an `inputValue()`. Writing them as numbers would put a
// `String()` on one side of the comparison and invite the expectation to be computed by the same
// coercion the app does.

type TierInput = {
  name: string
  price: string
  /** `#tier-jumping`'s option value — 'true', 'false', or omitted for "No default". */
  jumping?: string
  /** `#tier-exertion`'s option value — '1'–'5', or omitted for "No default". */
  exertion?: string
}

const BEGINNER: TierInput = { name: 'Beginner', price: '60', jumping: 'false', exertion: '2' }
const ADVANCED: TierInput = { name: 'Advanced', price: '120', jumping: 'true' }
const GROUP_SPECIAL: TierInput = { name: 'Group Special', price: '90' }

/**
 * The $0 tier. Its whole point is that `parseNonNegativeAmount` distinguishes falsy from nullish:
 * `'0'` is a truthy *string*, so it clears the blank guard, parses to `0`, and fails `0 < 0` — so
 * `validateTierFields`' `price == null` test does not fire. A check written as `if (!price)`
 * anywhere on that path rejects this tier, which is why the item asserts the tier **saved**
 * rather than that no error rendered.
 */
const ZERO_DOLLAR: TierInput = { name: 'Zero Dollar', price: '0' }

/**
 * Seeded rather than created through the form, and that is load-bearing twice.
 *
 * The "Edit an existing tier to a blank or whitespace-only name" item needs a tier that exists
 * independently of the three creates above — running it against one of them would couple that
 * checkbox to theirs. And it is what makes the list item's assertion a real subset check: with a
 * tier in the table that this file never created, `arrayContaining` discriminates, where against
 * a table holding only the three creates it would be an equality wearing a subset's clothes.
 */
const HOUSE_STANDARD = { name: 'House Standard', price: 45 }

/** `validateTierFields`' two messages, verbatim. */
const NAME_REQUIRED = 'Name is required'
const PRICE_REQUIRED = 'Price is required'

const barn = withBarn('phase2-tiers', async ({ supabase, barn: seededBarn }) => {
  await addTier(supabase, seededBarn.id, HOUSE_STANDARD)
})

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * Manage Barn with the Lesson Tiers section driven open.
 *
 * Plain `/settings`, never `?open=tiers`: every section renders as a **closed** `<details>` from
 * that URL, so the click is what opens it and a `<td>` becoming visible afterwards means the
 * section really rendered. Reaching for the query param instead would hand the open state to the
 * server and leave the accordion itself unexercised.
 */
async function openTiersSection(page: Page) {
  await page.goto(`/barn/${barn.slug}/settings`)
  const section = page
    .locator('details')
    .filter({ has: page.getByRole('heading', { name: 'Lesson Tiers', exact: true }) })
  await section.locator('summary').click()
  return section
}

/**
 * The new-tier form, hydrated.
 *
 * The barrier is not decoration (framework fact 9). `#tier-name` and `#tier-price` are
 * React-controlled — `value={name}` over a `useState` — so a `fill()` landing before hydration
 * moves the DOM value and nothing else, and what gets submitted is the empty initial state. That
 * failure is *quiet in the direction that matters here*: the blank-price item would submit a
 * blank name too and see both errors instead of one, and the create items would submit an empty
 * form. `new` mode renders no `useState`-gated markup of its own (the three amber warnings are
 * `mode === 'edit'` only), which is fact 13's byte-identical case, so the signal has to come from
 * the nav bar in the same React root.
 */
async function gotoNewTierForm(page: Page) {
  await page.goto(`/barn/${barn.slug}/settings/tiers/new`)
  await waitForBarnPageHydrated(page)
}

async function fillTierForm(page: Page, tier: TierInput) {
  await page.locator('#tier-name').fill(tier.name)
  await page.locator('#tier-price').fill(tier.price)
  if (tier.jumping !== undefined) await page.locator('#tier-jumping').selectOption(tier.jumping)
  if (tier.exertion !== undefined) await page.locator('#tier-exertion').selectOption(tier.exertion)
}

/**
 * Submits the tier form and waits for nothing.
 *
 * Separate from `saveAndReturnToSettings` because a rejected save has no navigation to
 * synchronise on at all — `createTierAction`/`updateTierAction` return `{ error }` and only
 * `redirect` on success. The rejection tests' own auto-retrying `toHaveText` is the sync point
 * there, which is sound: a predicate satisfiable only by the success path could not observe the
 * failure it exists to catch (fact 17), and this one is satisfiable only by the failure path.
 *
 * focus()+Enter rather than click(), per #501/`04c64505`.
 */
async function submit(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).focus()
  await page.keyboard.press('Enter')
}

/** Submits and waits out the success redirect, which reopens Lesson Tiers with a Saved badge. */
async function saveAndReturnToSettings(page: Page) {
  await submit(page)
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/settings\\?saved=tiers$`), {
    waitUntil: 'commit',
  })
}

/**
 * Walks Manage Barn → Lesson Tiers → that row's Edit, the way a manager reaches a stored tier.
 *
 * `filter({ has: cell })` with `exact: true`, not `hasText`: `hasText` is a case-insensitive
 * *substring* over the whole row, so "Beginner" would also select a future "Beginner Plus" row
 * and the click would land on whichever came first. Same reasoning as the phase-4 spec's
 * `eventRow`.
 */
async function openTierEditForm(page: Page, name: string) {
  const section = await openTiersSection(page)
  const row = section
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name, exact: true }) })
  await row.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForURL(/\/settings\/tiers\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })
}

/**
 * The tier form's own validation message.
 *
 * Deliberately **not** a bare `page.getByRole('alert')`. Next.js renders a permanent route
 * announcer — `<div role="alert" aria-live="assertive" id="__next-route-announcer__">` — into
 * every document, so an unscoped alert role is never unique in this app: it resolves to exactly
 * one element (the empty announcer) while the page is clean, and to two the moment the form's
 * own message appears. The failure mode is the nasty way round — the *correct* app behaviour is
 * what trips strict mode, so the check fails only once the thing it is asserting has happened.
 *
 * Measured, not reasoned: this spec's first run failed here with the pair spelled out, having
 * rendered `<p role="alert">Price is required</p>` exactly as claimed. Every other spec in the
 * suite already scopes its alert to a container (`sharedForm`/`uploadForm`/`main`/section), so
 * the convention was real but stated nowhere; see this file's `## Follow-ups` entry in the work
 * log.
 *
 * Scoped by `:has(#tier-name)` rather than by position: the edit page carries a second `<form>`
 * (`DeactivateButton`'s), and `deactivateState.error` renders its own `role="alert"` as that
 * form's *sibling*, so a positional or unscoped match would drift onto whichever the DOM
 * happened to order first.
 */
function validationError(page: Page) {
  return page.locator('form:has(#tier-name)').getByRole('alert')
}

/**
 * What the tier form holds, as one object.
 *
 * Read together and asserted as a single `toEqual` because each create item is a conjunction —
 * "**Beginner** — $60, default exertion level 2, jumping off" is four claims about one row, and
 * splitting them would let three pass while the fourth silently named a different tier. Both
 * `<select>`s report `''` for their "No default" option, which is how "no defaults" is asserted
 * rather than merely unasserted.
 *
 * `TierForm` seeds every field from a server prop, so these values are in the server-rendered
 * markup and need no hydration barrier — the `waitFor` is only there so a form that never
 * rendered fails here instead of returning four empty strings that happen to match a
 * no-defaults expectation.
 */
async function tierFormValues(page: Page) {
  const name = page.locator('#tier-name')
  await name.waitFor()
  return {
    name: await name.inputValue(),
    price: await page.locator('#tier-price').inputValue(),
    jumping: await page.locator('#tier-jumping').inputValue(),
    exertion: await page.locator('#tier-exertion').inputValue(),
  }
}

/** What `tierFormValues` should report for a tier entered as `tier`; both selects default to ''. */
function storedForm(tier: TierInput) {
  return {
    name: tier.name,
    price: tier.price,
    jumping: tier.jumping ?? '',
    exertion: tier.exertion ?? '',
  }
}

// ---------------------------------------------------------------------------
// The tier block — "Create tier **Beginner**" through "both errors shown together"
// ---------------------------------------------------------------------------
//
// Serial, and ordered: the list item asserts on what the three creates above it produced. Under
// `fullyParallel: false` declaration order is run order, and a failure anywhere restarts the
// worker and re-seeds the barn (fact 15) — so the first ✘ here is the finding and everything
// below it is noise until that one is fixed.

test.describe.serial('Manage Barn — lesson tier creation and validation', () => {
  test('creating_a_tier_stores_its_price_exertion_default_and_jumping_off @manager', async ({
    page,
  }) => {
    await gotoNewTierForm(page)
    await fillTierForm(page, BEGINNER)
    await saveAndReturnToSettings(page)

    // Read back off the tier's own edit form rather than the settings list: the list renders
    // Name/Price/Default/Status only, so the two defaults this item names are observable
    // nowhere else.
    await openTierEditForm(page, BEGINNER.name)
    expect(await tierFormValues(page)).toEqual(storedForm(BEGINNER))
  })

  test('creating_a_tier_stores_its_price_and_jumping_on_default @manager', async ({ page }) => {
    await gotoNewTierForm(page)
    await fillTierForm(page, ADVANCED)
    await saveAndReturnToSettings(page)

    await openTierEditForm(page, ADVANCED.name)
    expect(await tierFormValues(page)).toEqual(storedForm(ADVANCED))
  })

  test('creating_a_tier_with_no_defaults_stores_neither_default @manager', async ({ page }) => {
    await gotoNewTierForm(page)
    await fillTierForm(page, GROUP_SPECIAL)
    await saveAndReturnToSettings(page)

    // The two '' entries are this item's actual claim — "no defaults" as a stored state, not as
    // an absence of assertion.
    await openTierEditForm(page, GROUP_SPECIAL.name)
    expect(await tierFormValues(page)).toEqual(storedForm(GROUP_SPECIAL))
  })

  test('every_created_tier_appears_in_the_lesson_tiers_list @manager', async ({ page }) => {
    const section = await openTiersSection(page)

    // Set membership, not order and not count: the barn also carries the seeded HOUSE_STANDARD
    // tier, and this item claims the three creates are present — not that they are the whole
    // table, and not that `getTiersByBarn`'s name ordering puts them anywhere in particular.
    // `settledTextContents` is what keeps it non-vacuous: an unrendered table would otherwise
    // read `[]`, and `arrayContaining` over `[]` fails loudly only because the read waits for a
    // visible first cell (rule 3).
    const names = await settledTextContents(section.locator('tbody tr td:first-child'))
    expect(names).toEqual(
      expect.arrayContaining([BEGINNER.name, ADVANCED.name, GROUP_SPECIAL.name])
    )
  })

  test('saving_a_tier_with_a_blank_price_is_rejected_as_price_required @manager', async ({
    page,
  }) => {
    await gotoNewTierForm(page)
    await fillTierForm(page, { name: 'No Price Tier', price: '' })
    await submit(page)

    // Exact, not `toContainText`. `validateTierFields` joins its errors into this one
    // `role="alert"`, so exact equality is what pins the rejection to the *price* — a form that
    // also lost its name would render "Name is required, Price is required" and pass a
    // containment check while proving the fill never landed.
    await expect(validationError(page)).toHaveText(PRICE_REQUIRED)
  })

  test('saving_a_tier_with_a_zero_price_stores_the_tier @manager', async ({ page }) => {
    await gotoNewTierForm(page)
    await fillTierForm(page, ZERO_DOLLAR)
    await saveAndReturnToSettings(page)

    // The acceptance is asserted as a stored row, not as the absence of an error: landing on
    // ?saved=tiers only says the action redirected. Reaching the tier through the list and
    // reading '0' back off its form is what says it persisted with the price entered.
    await openTierEditForm(page, ZERO_DOLLAR.name)
    expect(await tierFormValues(page)).toEqual(storedForm(ZERO_DOLLAR))
  })

  test('saving_a_tier_with_a_whitespace_only_name_is_rejected_as_name_required @manager', async ({
    page,
  }) => {
    await gotoNewTierForm(page)

    // Whitespace rather than empty, which is the half of the item worth testing: an empty string
    // is rejected by the `!name` guard whatever it does, while '   ' reaches it only because
    // `createTierAction` trims first. A price is supplied so the expected message stays singular.
    await fillTierForm(page, { name: '   ', price: '50' })
    await submit(page)

    await expect(validationError(page)).toHaveText(NAME_REQUIRED)
  })

  test('editing_a_tier_to_a_whitespace_only_name_is_rejected_as_name_required @manager', async ({
    page,
  }) => {
    await openTierEditForm(page, HOUSE_STANDARD.name)

    // The edit path validates through the same `validateTierFields`, but via
    // `updateTierAction` — a separate call site, which is the whole reason this item exists
    // alongside the create one above.
    await waitForBarnPageHydrated(page)
    await page.locator('#tier-name').fill('   ')
    await submit(page)

    await expect(validationError(page)).toHaveText(NAME_REQUIRED)
  })

  test('saving_a_tier_with_a_blank_name_and_price_reports_both_errors @manager', async ({
    page,
  }) => {
    await gotoNewTierForm(page)
    await fillTierForm(page, { name: '', price: '' })
    await submit(page)

    const alert = validationError(page)
    await alert.waitFor()
    const message = (await alert.textContent()) ?? ''

    // Both messages present, in one assertion, without pinning the joining punctuation — the
    // item claims the two errors are shown *together*, and `errors.join(', ')` is an
    // implementation detail this check has no business freezing. Asserted as a pair rather than
    // as two `toContainText` calls so a run that renders only one of them names which.
    expect({
      name: message.includes(NAME_REQUIRED),
      price: message.includes(PRICE_REQUIRED),
    }).toEqual({ name: true, price: true })
  })
})
