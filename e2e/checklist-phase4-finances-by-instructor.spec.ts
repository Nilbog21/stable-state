// covers: src/app/barn/[slug]/(protected)/finances/**
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addPaidLesson, addTier, addUnpaidLesson } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import { formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { type SupabaseClient } from '@supabase/supabase-js'
import type { Lesson, LessonTier } from '@/lib/db/types'

// The three instructor rows this tab renders. addMemberships is the only thing that sets
// can_instruct on the long-lived logins, and it sets it for every non-rider role — so the
// manager and trainer logins supply two, and the third is a managed stub seeded below. No
// name here is a substring of another, so a row can be located by its link text alone.
const MANAGER_NAME = 'Test Manager'
const TRAINER_NAME = 'Test Trainer'
const UNDERSTUDY_NAME = 'Test Understudy'

/**
 * Tier price and tier instructor cut, per instructor.
 *
 * The cut is a dollar amount and it comes from the *tier*, never from the caller:
 * create_lesson_with_participants ignores its own p_instructor_cut argument and re-reads
 * lesson_tiers.instructor_cut server-side, because the cut gates the instructor's own payout
 * and so isn't trusted from the client (see docs/architecture/schema.md on
 * lessons.instructor_cut). One tier per instructor is therefore what gives each row its own
 * Gross/Expenses/Net triple — there is no per-lesson override to pass.
 *
 * The three Nets (70 / 40 / 90) are picked so that name-ascending, Net-ascending, and the
 * Net-descending order the server hands the table (toSortedIncomeRows sorts by totalIncome
 * descending) are three *different* orderings. Two instructors would only ever produce two
 * possible orderings, and the sort checks below would then pass against a table that never
 * re-sorted at all.
 */
const FEES = {
  manager: { price: 100, cut: 30 }, //  Net 70 — first by name, middle by Net
  trainer: { price: 60, cut: 20 }, //   Net 40 — middle by name, last by Net
  understudy: { price: 120, cut: 30 }, // Net 90 — last by name, first by Net
} as const

const netOf = (who: keyof typeof FEES) => FEES[who].price - FEES[who].cut

/** Column offsets within a By Instructor row: 0 Trainer, then Gross, Expenses, Net. */
const COLUMN = { gross: 1, expenses: 2, net: 3 } as const

type Seeded = { trainerMembershipId: string; trainerPaidLesson: Lesson }

let seeded: Seeded

/**
 * A third instructor, as a managed stub — a profile with no auth user, the same shape
 * addMemberships already uses for rider2. A stub rather than a fourth login because the
 * logins are per Supabase project and created once by scripts/e2e-auth-users.ts; this barn
 * needs a third *name*, not a third session.
 */
async function addStubTrainer(
  supabase: SupabaseClient,
  barnId: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const profile = mustSucceed<{ id: string }>(
    await supabase
      .from('profiles')
      .insert({ first_name: firstName, last_name: lastName, is_managed: true })
      .select('id')
      .single(),
    'insert stub trainer profile'
  )
  const membership = mustSucceed<{ id: string }>(
    await supabase
      .from('barn_memberships')
      .insert({ barn_id: barnId, profile_id: profile.id, role: 'trainer', status: 'active', can_instruct: true })
      .select('id')
      .single(),
    'insert stub trainer membership'
  )
  return membership.id
}

const barn = withBarn('phase4-finances-by-instructor', async ({ supabase, barn, members }) => {
  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const understudyMembershipId = await addStubTrainer(supabase, barn.id, 'Test', 'Understudy')

  const tiers = {
    manager: await addTier(supabase, barn.id, {
      name: 'Assistant',
      price: FEES.manager.price,
      instructorCut: FEES.manager.cut,
    }),
    trainer: await addTier(supabase, barn.id, {
      name: 'Standard',
      price: FEES.trainer.price,
      isDefault: true,
      instructorCut: FEES.trainer.cut,
    }),
    understudy: await addTier(supabase, barn.id, {
      name: 'Premium',
      price: FEES.understudy.price,
      instructorCut: FEES.understudy.cut,
    }),
  }

  const lessonUnder = (instructorId: string, tier: LessonTier) => ({
    monthsAgo: 0 as const,
    instructorId,
    fee: tier.price,
    tierName: tier.name,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
  })

  await addPaidLesson(supabase, barn, lessonUnder(members.manager.membershipId, tiers.manager))
  const trainerPaidLesson = await addPaidLesson(supabase, barn, lessonUnder(members.trainer.membershipId, tiers.trainer))
  await addPaidLesson(supabase, barn, lessonUnder(understudyMembershipId, tiers.understudy))

  // Uncollected, so getEntityIncome skips it in both modes: it must stay out of this
  // trainer's summary figures *and* out of their drill-down. That absence is what makes the
  // drill-down's "paid lessons" qualifier a real claim rather than a restatement of the seed.
  await addUnpaidLesson(supabase, barn, lessonUnder(members.trainer.membershipId, tiers.trainer))

  seeded = { trainerMembershipId: members.trainer.membershipId, trainerPaidLesson }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** finances/page.tsx resolves its default month from the server clock, so never rely on it. */
function currentMonth(): string {
  return formatMonthParam(new Date())
}

function financesUrl(): string {
  return `/barn/${barn.slug}/finances?month=${currentMonth()}&tab=trainer`
}

function drilldownUrl(trainerId: string): string {
  return `/barn/${barn.slug}/finances/trainers/${trainerId}?month=${currentMonth()}`
}

/**
 * The active tab's BreakdownTable — and, on the drill-down page, its single lesson table.
 * Scoped to a direct `main > div` child so it can't also match a table nested inside one of
 * the Finances page's Outstanding `<section>`s.
 */
function table(page: Page) {
  return page.locator('main > div > table')
}

function bodyRows(page: Page) {
  return table(page).locator('tbody tr')
}

/** One By Instructor row, located by its trainer link. */
function rowFor(page: Page, name: string) {
  return bodyRows(page).filter({ has: page.getByRole('link', { name, exact: true }) })
}

/**
 * Header labels in document order, sort glyph stripped. Read from `textContent`, not
 * `innerText`: Th uppercases its label in CSS. `div > *` picks the label element itself,
 * skipping the InfoPopover trigger that sits beside it.
 */
async function headerLabels(page: Page): Promise<string[]> {
  return table(page)
    .locator('thead th')
    .evaluateAll((headers) =>
      headers.map((th) => (th.querySelector('div > *')?.textContent ?? '').replace(/[▲▼]/g, '').trim())
    )
}

/** Every header currently carrying a sort-direction glyph, as `label glyph`. */
async function indicatedHeaders(page: Page): Promise<string[]> {
  return table(page)
    .locator('thead th')
    .evaluateAll((headers) =>
      headers.map((th) => (th.querySelector('div > *')?.textContent ?? '').trim()).filter((text) => /[▲▼]/.test(text))
    )
}

async function rowNames(page: Page): Promise<string[]> {
  return bodyRows(page).locator('td:first-child').allInnerTexts()
}

/** The Expenses column renders in accounting parens, so the magnitude is the figure. */
function parseMoney(text: string): number {
  return Math.abs(Number(text.replace(/[^0-9.]/g, '')))
}

/** The drill-down's bottom Total: a two-span row beside the table in the same scroll container. */
function drilldownTotal(page: Page) {
  return page.locator('main > div > div').filter({ hasText: /^Total/ }).locator('span').nth(1)
}

/** The Net column's header cell. No other header label contains "Net". */
function netHeader(page: Page) {
  return table(page).locator('thead th').filter({ hasText: 'Net' })
}

/** Scoped by text so it can't match the InfoPopover trigger sharing the same header cell. */
function netSortButton(page: Page) {
  return netHeader(page).locator('button').filter({ hasText: 'Net' })
}

/**
 * Taps the Net header and waits for `indicator` to render *on the Net header*. A wait, not an
 * assertion: the row reads below are one-shot `allInnerTexts`/`evaluateAll` calls with no
 * retry of their own, so without it they could sample the order the click was about to
 * replace. `Locator.waitFor` rather than a retrying `expect`, so a test whose single claim is
 * about the indicator is never pre-empted by its own setup asserting that same claim — which
 * is why the two indicator tests below tap bare and poll instead of calling this.
 *
 * Scoped to the Net header specifically, not to the whole thead: on the first tap the ▲ is
 * still sitting on Trainer, so an unscoped `has-text("▲")` would already be satisfied and the
 * wait would return before the re-sort had happened at all.
 */
async function tapNetHeader(page: Page, indicator: '▲' | '▼'): Promise<void> {
  await netSortButton(page).click()
  await netHeader(page).locator(`button:has-text("${indicator}")`).waitFor()
}

// ---------------------------------------------------------------------------
// Columns and figures
// ---------------------------------------------------------------------------

test('by_instructor_tab_shows_trainer_gross_expenses_net_columns @manager', async ({ page }) => {
  await page.goto(financesUrl())
  expect(await headerLabels(page)).toEqual(['Trainer', 'Gross', 'Expenses', 'Net'])
})

// The trainer's only *collected* lesson is priced at FEES.trainer.price, so a Gross of the
// full tier price — rather than price minus cut — is the pre-cut claim.
test('by_instructor_gross_is_the_trainers_pre_cut_lesson_fees @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(rowFor(page, TRAINER_NAME).locator('td').nth(COLUMN.gross)).toHaveText(
    formatCurrency(FEES.trainer.price)
  )
})

test('by_instructor_expenses_column_is_the_deducted_instructor_cut @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const cell = await rowFor(page, TRAINER_NAME).locator('td').nth(COLUMN.expenses).innerText()
  expect(parseMoney(cell)).toBe(FEES.trainer.cut)
})

// Shape only — the magnitude is the check above's claim. A deduction is rendered in
// accounting parens rather than with a leading minus sign.
test('by_instructor_expenses_column_renders_the_cut_in_parentheses @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(rowFor(page, TRAINER_NAME).locator('td').nth(COLUMN.expenses)).toHaveText(/^\(.*\)$/)
})

test('by_instructor_net_is_gross_minus_the_instructor_cut @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(rowFor(page, TRAINER_NAME).locator('td').nth(COLUMN.net)).toHaveText(formatCurrency(netOf('trainer')))
})

// Computed style, not a class name: the checklist's claim is that the underline is always
// there, not applied on hover — and a `hover:underline` rule would satisfy a class assertion.
test('by_instructor_trainer_name_is_an_underlined_link @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const decoration = await rowFor(page, TRAINER_NAME)
    .getByRole('link')
    .evaluate((el) => getComputedStyle(el).textDecorationLine)
  expect(decoration).toBe('underline')
})

test('by_instructor_trainer_name_links_to_the_trainer_drilldown @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(rowFor(page, TRAINER_NAME).getByRole('link')).toHaveAttribute(
    'href',
    `/barn/${barn.slug}/finances/trainers/${seeded.trainerMembershipId}?month=${currentMonth()}`
  )
})

// ---------------------------------------------------------------------------
// The trainer drill-down
// ---------------------------------------------------------------------------

// This trainer has one paid and one unpaid lesson, and the other two instructors have a paid
// lesson each — so a single row is both filters, per-trainer and paid-only, proven at once.
test('trainer_drilldown_table_lists_only_that_trainers_paid_lessons @manager', async ({ page }) => {
  await page.goto(drilldownUrl(seeded.trainerMembershipId))
  await expect(bodyRows(page)).toHaveCount(1)
})

test('trainer_drilldown_date_cell_links_to_its_lesson @manager', async ({ page }) => {
  await page.goto(drilldownUrl(seeded.trainerMembershipId))
  await expect(bodyRows(page).locator('td').first().getByRole('link')).toHaveAttribute(
    'href',
    `/barn/${barn.slug}/lessons/${seeded.trainerPaidLesson.id}`
  )
})

test('trainer_drilldown_type_column_is_always_lesson @manager', async ({ page }) => {
  await page.goto(drilldownUrl(seeded.trainerMembershipId))
  expect([...new Set(await bodyRows(page).locator('td:nth-child(2)').allInnerTexts())]).toEqual(['Lesson'])
})

test('trainer_drilldown_amount_is_net_of_the_instructor_cut @manager', async ({ page }) => {
  await page.goto(drilldownUrl(seeded.trainerMembershipId))
  await expect(bodyRows(page).locator('td').nth(2)).toHaveText(formatCurrency(netOf('trainer')))
})

// Read off both pages rather than computed: the checklist's claim is that the two agree, and
// a shared constant on both sides would hold even if they had drifted apart.
test('trainer_drilldown_total_matches_the_by_instructor_net_figure @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const summaryNet = await rowFor(page, TRAINER_NAME).locator('td').nth(COLUMN.net).innerText()
  await page.goto(drilldownUrl(seeded.trainerMembershipId))
  await expect(drilldownTotal(page)).toHaveText(summaryNet)
})

test('trainer_drilldown_preserves_the_month_param @manager', async ({ page }) => {
  const month = currentMonth()
  await page.goto(financesUrl())
  await rowFor(page, TRAINER_NAME).getByRole('link').click()
  await page.waitForURL(new RegExp(`/finances/trainers/${seeded.trainerMembershipId}\\?month=${month}$`), { waitUntil: 'commit' })
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

// Serial and in checklist order, mirroring the checklist's own tap-by-tap chain. Each step
// re-navigates and re-taps rather than inheriting the previous one's state: Playwright hands
// every test a fresh page, so client-side sort state cannot carry across a test boundary.
test.describe.serial('by instructor sorting', () => {
  // Name-ascending is not the order the server sends (that one is Net-descending, i.e.
  // Understudy first), so this also proves the client sort ran at all.
  test('by_instructor_rows_load_sorted_by_trainer_name_ascending @manager', async ({ page }) => {
    await page.goto(financesUrl())
    expect(await rowNames(page)).toEqual([MANAGER_NAME, TRAINER_NAME, UNDERSTUDY_NAME])
  })

  test('by_instructor_trainer_header_carries_the_ascending_indicator_on_load @manager', async ({ page }) => {
    await page.goto(financesUrl())
    expect(await indicatedHeaders(page)).toEqual(['Trainer ▲'])
  })

  test('tapping_net_header_re_sorts_by_net_ascending @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await tapNetHeader(page, '▲')
    expect(await rowNames(page)).toEqual([TRAINER_NAME, MANAGER_NAME, UNDERSTUDY_NAME])
  })

  // One claim about one state — where the indicator is — so it's a single set assertion
  // rather than an "appears on Net" test plus a "gone from Trainer" test. Tapped bare and
  // polled, because tapNetHeader's own wait is for exactly what this test claims.
  test('tapping_net_header_moves_the_ascending_indicator_to_net @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await netSortButton(page).click()
    await expect.poll(() => indicatedHeaders(page)).toEqual(['Net ▲'])
  })

  test('tapping_net_header_twice_reverses_the_row_order @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await tapNetHeader(page, '▲')
    const ascending = await rowNames(page)
    await tapNetHeader(page, '▼')
    expect(await rowNames(page)).toEqual([...ascending].reverse())
  })

  // Only the first tap goes through tapNetHeader: it establishes the ascending state this
  // test starts from, which is not the descending state it claims.
  test('tapping_net_header_twice_flips_the_indicator_to_descending @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await tapNetHeader(page, '▲')
    await netSortButton(page).click()
    await expect.poll(() => indicatedHeaders(page)).toEqual(['Net ▼'])
  })
})
