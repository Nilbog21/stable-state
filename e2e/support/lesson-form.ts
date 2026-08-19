// The New Lesson / lesson edit form's shared drive vocabulary, extracted 2026-08-14 from the seven
// phase-3 specs plus `checklist-phase5-lessons-new.spec.ts` that had been carrying byte-identical
// copies of it. `checklist-phase3-calendar-shading.spec.ts` is the canonical body source for
// `openNewLessonForm` and `checklist-phase3-lesson-fees.spec.ts` for everything else, and each
// helper's docstring is that copy's own rationale moved verbatim — what is being shared here is the
// measured framework fact behind the body, not the line of code.
import type { Page } from '@playwright/test'
import { expect, test, type BarnHandle } from './test'
import { hydrateByDriving } from './hydration'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import type { Horse } from '@/lib/db/types'

/**
 * The time `openNewLessonForm` fills to prove React has taken the form over.
 *
 * ITS HOUR IS LOAD-BEARING and its minutes are not. Hour 10 is what
 * `checklist-phase3-calendar-appointments.spec.ts`'s fixture-day table and
 * `checklist-phase3-calendar-panel.spec.ts`'s band expectations are written against — each names
 * `BARRIER_TIME` and computes the ±3-day exertion window from that hour — so changing `10` breaks
 * them. The `:37` is inert since #1578 and kept only to avoid a pointless churn across those
 * files: with the Start Time field opening empty, the create form server-renders no `lesson_at`
 * input at all (`StartTimeField.tsx` gates it on `combinedValue`), so the barrier below cannot
 * pre-match at any hour and any time would do.
 */
export const BARRIER_TIME = '10:37'

/** The barn's New Lesson form URL. */
export function newLessonPath(barn: BarnHandle): string {
  return `/barn/${barn.slug}/lessons/new`
}

/** A lesson's edit-form URL. */
export function editPath(barn: BarnHandle, lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}/edit`
}

/**
 * Opens the form and blocks until React has taken it over.
 *
 * Waiting for `#lesson-start-time` to appear would prove nothing: since #1021 the day panel is
 * `dayPanelAlwaysOpen`, so that input is in the SERVER-rendered HTML and every interaction after
 * it would race hydration — a click dispatched before React is listening is simply lost and
 * nothing replays it (e2e/CLAUDE.md facts 9 and 10). The barrier therefore waits on the hidden
 * `lesson_at` input carrying the combination of the barn's today and the time just entered,
 * which only client-side `StartTimeField` can write.
 *
 * Since #1578 that input does not exist at all until a time is entered, so the barrier is
 * unambiguous by construction: there is no server-rendered value it could match against.
 *
 * The drive is a `fill` of a fixed time, so re-entering it is idempotent — the property
 * `hydrateByDriving` needs to retry safely. `isLive` is a single `page.evaluate` with no
 * retrying read inside it, per that helper's contract.
 *
 * `test.slow()` rather than a timeout on any wait: `waitFor*` is unbounded already, so a number
 * could only tighten it (#1211).
 */
export async function openNewLessonForm(page: Page, barn: BarnHandle): Promise<void> {
  test.slow()
  const timezone = barn.data.barn.timezone
  await page.goto(newLessonPath(barn))
  await page.getByRole('heading', { level: 1, name: 'New Lesson' }).waitFor()

  const expected = wallClockToInstant(`${barnToday(timezone)}T${BARRIER_TIME}:00`, timezone).toISOString()
  await hydrateByDriving(
    () => page.locator('#lesson-start-time').fill(BARRIER_TIME),
    () =>
      page.evaluate((want) => {
        const el = document.querySelector('input[name="lesson_at"]')
        return el instanceof HTMLInputElement && el.value === want
      }, expected)
  )
}

/** Ticks a horse, settling on the per-horse exertion input — `useState`-gated markup that cannot
 *  exist until React has the horse checked. */
export async function selectHorse(page: Page, horse: Horse): Promise<void> {
  await page.getByRole('checkbox', { name: horse.name, exact: true }).check()
  await page.locator(`#exertion_${horse.id}`).waitFor()
}

/**
 * Picks a named tier, settling on the `<select>`'s own value.
 *
 * The settle is on the select rather than on the fee it cascades into, because the fee is what
 * two of the checkboxes below actually claim — settling on it would make those assertions wait
 * for themselves.
 */
export async function selectTier(page: Page, tierId: string): Promise<void> {
  await page.locator('#tier_name').selectOption(tierId)
  await expect(page.locator('#tier_name')).toHaveValue(tierId)
}

/**
 * Submits the New Lesson form and waits out the redirect to the Lessons list.
 *
 * Keyboard activation rather than a pointer click: the submit sits at the bottom of a long
 * scrollable form, the shape #501 (04c64505) diagnosed, where Chromium's scroll-into-view
 * animation races Playwright's actionability check. `exact: true` because `getByRole`'s name match
 * is a case-insensitive substring and the button relabels itself to "Submitting…" while pending.
 *
 * The `waitForURL` cannot no-op (fact 3) — the pattern excludes the `/lessons/new` it is called
 * from — and it doubles as the "the save succeeded" half: `submitLesson` re-renders the form with
 * a `role="alert"` and no navigation on every failure path, and only redirects on success.
 */
export async function submitNewLesson(page: Page, barn: BarnHandle): Promise<void> {
  const submit = page.getByRole('button', { name: 'Submit', exact: true })
  await submit.focus()
  await submit.press('Enter')
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })
}

/**
 * What a stored lesson's edit form holds, as one object.
 *
 * Read together and asserted as a single `toEqual` because the checkbox is a conjunction —
 * "Beginner tier, trainer Alex, horse Apple, rider Dana" on a day in the previous calendar month
 * is five claims about one lesson, and splitting them would let four pass while the fifth silently
 * named a different lesson.
 *
 * Called inside `expect.poll`, which is what makes the composite safe: every member read here is
 * **one-shot**. `inputValue()` and `getAttribute()` do not retry once they have an element, and
 * `evaluateAll` does not retry at all — it yields `[]` on an unsettled page, which is rule 3's
 * pass-on-nothing hazard. A bare `expect(await …)` would freeze whatever the first read happened
 * to see; the poll re-reads the whole object instead, so `[]` simply fails and is retried rather
 * than being compared against. Same shape, and the same reason, as
 * checklist-phase4-expenses-form.spec.ts's `the_edit_form_opens_prefilled_with_the_expenses_stored_values`.
 *
 * `aria-pressed` is safe to read here — the server and the client compute it from the same
 * `initialLesson` prop, so fact 7's non-reconciliation has no mismatch to preserve, and nothing on
 * this page ever changes the selected day.
 */
export async function editFormSelection(page: Page) {
  return {
    day: await page.locator('button[data-past][aria-pressed="true"]').getAttribute('aria-label'),
    tier: await page.locator('#tier_name').inputValue(),
    instructor: await page.locator('#instructor_id').inputValue(),
    horses: await page
      .locator('input[name="horse_id"]')
      .evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLInputElement).checked)
          .map((el) => (el as HTMLInputElement).value)
      ),
    rider: await page.locator('#rider_id').inputValue(),
  }
}
