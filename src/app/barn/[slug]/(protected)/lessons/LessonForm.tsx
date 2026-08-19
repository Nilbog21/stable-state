'use client'

import { useActionState, useState, useEffect } from 'react'
import type { CalendarDate, Horse, LessonDetail, LessonTier, LessonType, ScheduleItem } from '@/lib/db/types'
import { LessonStartTime } from './LessonStartTime'
import { useUnsavedChangesGuard } from '../NavigationBlocker'
import { ExhaustionBar, type ExhaustionBarRow } from '@/components/ExhaustionBar'
import { MonthCalendarPicker } from '@/components/calendar/MonthCalendarPicker'
import { computeDayDecorations, getMonthGrid } from '@/lib/month-calendar'
import { addDays, calendarDate } from '@/lib/local-day'
import { barnToday, instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
import { Button } from '@/components/ui/Button'

type ExhaustionByHorseId = Record<string, { existingRows: ExhaustionBarRow[]; thresholds: { high: number; moderate: number } }>

const CUSTOM_ID = '__custom__'

export function computeUnpaidWarn(unpaidPastDue: boolean, paymentType: string, fee: string): boolean {
  const feeIsZero = fee !== '' && Number(fee) === 0
  return unpaidPastDue && paymentType === '' && !feeIsZero
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

// "Past" is measured against the start of the barn's current hour, not the host's, so a
// lesson already under way still counts as bookable. #1021 made start times minute-granular,
// which widens what that lenience covers — anything from :00 of the current hour onward — but
// does not change the rule or its direction. Truncating a host-zone Date instead lands 30
// minutes off in any half-hour-offset zone (#1222).
function isPastLessonAt(lessonAt: string, timezone: string): boolean {
  if (!lessonAt) return false
  const barnHourStart = wallClockToInstant(
    `${instantToLocalWallClock(new Date(), timezone).slice(0, 13)}:00:00`,
    timezone
  )
  return new Date(lessonAt) < barnHourStart
}

export function LessonForm({
  mode,
  horses,
  riders,
  isManager,
  action,
  instructors,
  currentMembershipId,
  tiers,
  todayStr,
  timezone,
  initialLesson,
  initialNotes,
  getProjectedExhaustion,
  getScheduleRange,
  thresholdsByHorseId = {},
  hasHorseIssue = false,
}: {
  mode: 'new' | 'edit'
  horses: Horse[]
  riders: { id: string; name: string }[]
  isManager: boolean
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  instructors: { membershipId: string; userId: string | null; name: string }[]
  currentMembershipId: string
  tiers: LessonTier[]
  /** The barn's own calendar day ("YYYY-MM-DD"), computed server-side via `barnToday` — the
   *  month calendar's past-day cutoff, which has to sit in the same frame as every other date
   *  on that grid (#1149). */
  todayStr: CalendarDate
  /** `barns.timezone` — the frame the lesson's date/hour are entered and decoded in (#1222). */
  timezone: string
  initialLesson?: LessonDetail
  initialNotes?: {
    horses: Array<{ id: string; name: string; horse_notes: string | null }>
    riders: Array<{ membershipId: string; name: string; rider_notes: string | null; private_notes: string | null }>
  }
  getProjectedExhaustion?: (targetDateIso: string, horseIds: string[]) => Promise<ExhaustionByHorseId>
  /** #1019 — one read per displayed month, feeding the date field's conflict calendar.
   *  Omitted (as in existing tests) leaves the plain native date input in place. */
  getScheduleRange?: (fromDate: string, toDate: string) => Promise<ScheduleItem[]>
  thresholdsByHorseId?: Record<string, { high: number; moderate: number }>
  hasHorseIssue?: boolean
}) {
  const defaultTier = tiers.find(t => t.is_default) ?? tiers[0] ?? null

  const initialTierByName =
    mode === 'edit' && initialLesson
      ? tiers.find(t => t.name === initialLesson.tier_name) ?? null
      : null

  const computedInitialSelectedId =
    mode === 'edit'
      ? (initialTierByName?.id ?? CUSTOM_ID)
      : (defaultTier?.id ?? CUSTOM_ID)

  const initialJumping = initialLesson?.jumping ?? false
  const initialLessonType: LessonType = initialLesson?.lesson_type ?? 'normal'

  const initialHorseIds = new Set(
    (initialLesson?.lesson_horses ?? [])
      .map(lh => lh.horses?.id)
      .filter((id): id is string => Boolean(id))
  )

  const initialExertionMap = new Map(
    // exertion_level is absent from LessonDetail only for the rider role — this form is
    // manager/trainer-only, so it's always present here; the fallback just satisfies the type.
    (initialLesson?.lesson_horses ?? []).map(lh => [lh.horses?.id ?? '', lh.exertion_level ?? 3])
  )

  const initialRiderIds = new Set(
    (initialLesson?.lesson_riders ?? [])
      .map(lr => lr.barn_membership?.id)
      .filter((id): id is string => Boolean(id))
  )

  const initialNormalRiderId =
    mode === 'edit' ? (initialLesson?.lesson_riders[0]?.barn_membership?.id ?? '') : ''

  const initialSelectedTier = tiers.find(t => t.id === computedInitialSelectedId) ?? null
  const initialFee =
    mode === 'edit' && initialLesson
      ? String(initialLesson.fee)
      : (initialSelectedTier ? String(initialSelectedTier.price) : '')
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [lessonType, setLessonType] = useState<LessonType>(initialLessonType)
  const [checkedHorseIds, setCheckedHorseIds] = useState<Set<string>>(initialHorseIds)
  const [exertionMap, setExertionMap] = useState<Map<string, number>>(initialExertionMap)
  const [checkedRiderIds, setCheckedRiderIds] = useState<Set<string>>(initialRiderIds)
  const [normalRiderId, setNormalRiderId] = useState(initialNormalRiderId)
  const [clientError, setClientError] = useState<string | null>(null)
  const [jumping, setJumping] = useState(initialJumping)
  const [selectedId, setSelectedId] = useState<string>(computedInitialSelectedId)
  const [showDowngradeWarning, setShowDowngradeWarning] = useState(false)
  const [paymentType, setPaymentType] = useState(initialLesson?.payment_type ?? '')
  const [fee, setFee] = useState<string>(initialFee)
  const [isRecurring, setIsRecurring] = useState(false)
  const [flashingKeys, setFlashingKeys] = useState<Set<string>>(new Set())
  const [notesDirty, setNotesDirty] = useState(false)
  const [lessonAt, setLessonAt] = useState('')
  // Decoding a stored instant back to form values is barn-local, same as entering one.
  const initialWallClock = initialLesson ? instantToLocalWallClock(new Date(initialLesson.lesson_at.at), timezone) : ''
  // "HH:MM", not "HH" — slicing to the hour is exactly the truncation #1021 closes: it silently
  // rewrote a 4:30 lesson to 4:00 on any save, including one that never touched the time.
  const initialTime = mode === 'edit' && initialLesson ? initialWallClock.slice(11, 16) : undefined
  // The selected day, owned here now that the calendar and the time field are siblings rather
  // than one control. `barnToday(timezone)` rather than the `todayStr` prop, preserving
  // DateHourPicker's default exactly: the two agree in production (the pages compute `todayStr`
  // with the same call), and switching sources here would only change behaviour in fixtures that
  // set an inconsistent `todayStr` — not a change #1021 has any reason to make.
  const [lessonDate, setLessonDate] = useState(
    mode === 'edit' && initialLesson ? initialWallClock.slice(0, 10) : (() => String(barnToday(timezone)))
  )
  const [exhaustionData, setExhaustionData] = useState<{ lessonAt: string; data: ExhaustionByHorseId } | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(
    (initialLesson ? initialWallClock.slice(0, 10) : todayStr).slice(0, 7)
  )
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([])

  const feeIsZero = fee !== '' && Number(fee) === 0
  const unpaidPastDue =
    mode === 'edit' &&
    (initialLesson?.payment_type === null || initialLesson?.payment_type === undefined) &&
    (initialLesson ? new Date(initialLesson.lesson_at.at) < new Date() : false) &&
    Number(initialLesson?.fee) > 0
  const unpaidWarn = computeUnpaidWarn(unpaidPastDue, paymentType, fee)
  const feeDirty = fee !== initialFee
  const horsesDirty = !setsEqual(checkedHorseIds, initialHorseIds)
  const ridersDirty = lessonType === 'normal'
    ? normalRiderId !== initialNormalRiderId
    : !setsEqual(checkedRiderIds, initialRiderIds)
  const fieldsDirty = mode === 'edit' && (feeDirty || horsesDirty || ridersDirty)
  const horseIssueWarn = mode === 'edit' && hasHorseIssue
  const shouldWarn = unpaidWarn || notesDirty || fieldsDirty || horseIssueWarn

  const guardMessage = horseIssueWarn
    ? 'This lesson has an unresolved horse issue. Leave without addressing it?'
    : unpaidWarn
      ? 'This lesson has an unpaid balance. Are you sure you want to leave without recording payment?'
      : notesDirty
        ? 'You have unsaved notes. Leave without saving?'
        : 'You have unsaved changes. Leave without saving?'
  useUnsavedChangesGuard(shouldWarn, guardMessage)

  // The instant everything that only needs "roughly when" measures against: the real one once a
  // start time exists, and until then the selected day at the barn's CURRENT hour.
  //
  // #1578 emptied the Start Time field, and the bars, the horse picker's least-to-most-worked
  // sort and the calendar's exertion shading all hung off `lessonAt` alone — so all three went
  // dark for the whole stretch a manager spends picking horses, which is precisely when they are
  // read. The estimate is a sound stand-in because every one of those consumers buckets by a
  // +/-3-day exertion window: shifting the hour moves a 72-hour sum by at most a few points, and
  // it is replaced by the real instant the moment a time is entered.
  //
  // The hour is read through the barn's zone, so a device elsewhere estimates the same day and
  // hour, and it is deliberately the top of the hour — the same reading `isPastLessonAt`
  // measures against, so an opening estimate is never its own past lesson, at any hour and
  // across the boundary between two.
  //
  // CREATE ONLY. The edit form is seeded from the stored instant, which `LessonStartTime` reports
  // on its own mount effect — one render after `lessonAt`'s initial `''`. Estimating into that
  // render would cost every edit-form open a second round trip, and would flash a past lesson's
  // bars for one frame before the real instant gates them off again.
  //
  // `lessonDate` is guarded for the reason `LessonStartTime` guards its own combination: the
  // no-calendar branch's native date input is clearable, and an empty half builds an Invalid Date
  // that throws RangeError out of `wallClockToInstant` *during render*, unmounting the form and
  // taking every other filled-in field with it.
  const estimateHour = instantToLocalWallClock(new Date(), timezone).slice(11, 13)
  const estimateAt = lessonAt
    ? lessonAt
    : mode === 'new' && lessonDate
      ? wallClockToInstant(`${lessonDate}T${estimateHour}:00:00`, timezone).toISOString()
      : ''

  useEffect(() => {
    if (!estimateAt || !getProjectedExhaustion) return
    let cancelled = false
    getProjectedExhaustion(estimateAt, horses.map(h => h.id)).then((result) => {
      if (!cancelled) setExhaustionData({ lessonAt: estimateAt, data: result })
    })
    return () => { cancelled = true }
  }, [estimateAt, getProjectedExhaustion, horses])

  // One fetch per displayed month, widened by the exertion window's 3 days at each end so
  // the grid's spill-over cells still get a correct ±3-day sum. `to` is exclusive.
  //
  // Also always stretched to reach the selected day (#1580). The day panel is always open on this
  // form and keeps `lessonDate` as its heading however far the grid is paged, so a range covering
  // only the displayed month would leave that heading over an empty body — and after just one page,
  // since month M+1's grid reaches back only to ~the 25th of M.
  //
  // The stretch cannot move a single day's decoration, only the panel's contents: `windowTotal`
  // centres ±72h on `${date}T${hour}`, so from the earliest grid day it reaches back at most to
  // `grid[0] - 3` — exactly the unstretched `from` — and forward at most to `grid[41] + 3`, inside
  // the unstretched exclusive `to`. Every item the stretch newly admits lies outside both.
  //
  // `lessonDate` is in the deps, so a day tap refetches. Not needed — a tapped day is by definition
  // already on the displayed grid — but the alternative is a ref written purely to satisfy
  // exhaustive-deps, for one extra read on a form that already fires one per tap.
  useEffect(() => {
    if (!getScheduleRange) return
    const grid = getMonthGrid(calendarMonth)
    const selected = calendarDate(lessonDate)
    // ISO dates sort lexicographically, so this is min/max with no branch to cover.
    const from = [addDays(grid[0], -3), selected].sort()[0]
    const to = [addDays(grid[41], 4), addDays(selected, 1)].sort()[1]
    let cancelled = false
    getScheduleRange(from, to).then((items) => {
      if (!cancelled) setScheduleItems(items)
    })
    return () => { cancelled = true }
  }, [calendarMonth, lessonDate, getScheduleRange])

  function flash(keys: string[]) {
    if (keys.length === 0) return
    setFlashingKeys(new Set(keys))
    setTimeout(() => setFlashingKeys(new Set()), 600)
  }

  function handleTierChange(id: string) {
    if (id === CUSTOM_ID) {
      setSelectedId(id)
      setJumping(false)
      setFee('')
      setExertionMap(prev => {
        const next = new Map(prev)
        for (const key of next.keys()) next.set(key, 3)
        return next
      })
      flash([...(jumping ? ['jumping'] : []), ...(fee !== '' ? ['fee'] : []), ...Array.from(checkedHorseIds).map(hid => `exertion_${hid}`)])
    } else {
      const tier = tiers.find(t => t.id === id) ?? null
      if (!tier) return
      setSelectedId(id)
      setFee(String(tier.price))
      const affectedKeys: string[] = ['fee']
      if (tier.default_jumping !== null) {
        setJumping(tier.default_jumping)
        affectedKeys.push('jumping')
      }
      if (tier.default_exertion_level !== null) {
        const lvl = tier.default_exertion_level
        setExertionMap(prev => {
          const next = new Map(prev)
          for (const key of next.keys()) next.set(key, lvl)
          return next
        })
        affectedKeys.push(...Array.from(checkedHorseIds).map(hid => `exertion_${hid}`))
      }
      flash(affectedKeys)
    }
  }

  if (tiers.length === 0) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        No lesson tiers have been configured. A manager must add at least one tier in Settings before lessons can be created.
      </p>
    )
  }

  const isCustom = selectedId === CUSTOM_ID
  const selectedTier = tiers.find(t => t.id === selectedId) ?? null
  const exhaustionByHorseId = exhaustionData?.lessonAt === estimateAt ? exhaustionData.data : undefined
  // The estimate rather than the real instant, so that a past DAY still suppresses the bars while
  // the time half is empty — the native date input accepts one even though the calendar's past
  // days are unclickable.
  const isPastLesson = isPastLessonAt(estimateAt, timezone)
  const dateLabel = isRecurring ? 'Starting Date' : 'Date'

  const selectedRiderIds = lessonType === 'normal'
    ? (normalRiderId ? [normalRiderId] : [])
    : [...checkedRiderIds]
  // Off `estimateAt`, so the shading agrees with the bars about which instant the form is
  // currently talking about — before a start time is entered as well as after. Midnight remains
  // the fallback for the one state that has no instant at all, a cleared date, which also has no
  // grid worth shading. Deliberately the hour alone, since `computeDayDecorations`' +/-3-day
  // window buckets by hour and the minutes #1021 added are not wanted here.
  const selectedHour = estimateAt ? Number(instantToLocalWallClock(new Date(estimateAt), timezone).slice(11, 13)) : 0
  const dayDecorations = computeDayDecorations(getMonthGrid(calendarMonth), scheduleItems, {
    selectedHorseIds: [...checkedHorseIds],
    selectedRiderIds,
    hour: selectedHour,
    thresholdsByHorseId,
    todayStr,
    excludeItemId: initialLesson?.id ?? null,
  })

  const horseNameById = new Map(horses.map(h => [h.id, h.name]))
  const riderNameById = new Map(riders.map(r => [r.id, r.name]))

  // Expenses and events carry a server-built label; lessons don't, because this form already
  // holds the horse and rider names their ids resolve to.
  function describeScheduleItem(scheduleItem: ScheduleItem): string {
    if (scheduleItem.label) return scheduleItem.label
    const names = [
      ...scheduleItem.horseIds.map(id => horseNameById.get(id)),
      ...scheduleItem.riderIds.map(id => riderNameById.get(id)),
    ].filter((name): name is string => name !== undefined)
    return names.length ? `Lesson — ${names.join(', ')}` : 'Lesson'
  }

  function horseTotalExertion(h: Horse): number {
    return (exhaustionByHorseId?.[h.id]?.existingRows ?? []).reduce((sum, row) => sum + row.exertionLevel, 0)
  }

  function horseSortBucket(h: Horse): number {
    if (checkedHorseIds.has(h.id)) return 0
    return h.is_available === false || h.is_active === false ? 2 : 1
  }

  function handleJumpingToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked
    setJumping(checked)
    if (checked) {
      const bumped = Array.from(exertionMap.entries())
        .filter(([, v]) => v < 4)
        .map(([id]) => `exertion_${id}`)
      setExertionMap(prev => {
        const next = new Map(prev)
        for (const [id, val] of next) {
          if (val < 4) next.set(id, 4)
        }
        return next
      })
      if (bumped.length > 0) flash(bumped)
    }
  }

  function handleLessonTypeSwitch(type: LessonType) {
    setLessonType(type)
    setClientError(null)
    if (type === 'normal') {
      setCheckedRiderIds(new Set())
      if (mode === 'edit' && lessonType === 'group') setCheckedHorseIds(new Set())
      if (mode === 'edit' && initialLessonType === 'group') setShowDowngradeWarning(true)
    } else {
      setShowDowngradeWarning(false)
      setCheckedRiderIds(new Set())
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null)
    if (lessonType === 'normal' && checkedHorseIds.size !== 1) {
      e.preventDefault()
      setClientError('normal lesson requires exactly 1 horse')
      return
    }
    if (lessonType === 'normal' && normalRiderId === '') {
      e.preventDefault()
      setClientError('a rider is required')
      return
    }
    if (lessonType === 'group' && checkedHorseIds.size < 1) {
      e.preventDefault()
      setClientError('group lesson requires at least 1 horse')
      return
    }
    if (lessonType === 'group' && checkedRiderIds.size < 2) {
      e.preventDefault()
      setClientError('group lesson requires at least 2 riders')
    }
  }

  const displayError = clientError || state.error

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="lesson_type" value={lessonType} />
      <input type="hidden" name="jumping" value={jumping ? 'true' : 'false'} />

      {(showDowngradeWarning || displayError) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {showDowngradeWarning && !displayError
            ? 'Switching to Normal will remove extra riders and horses. Select one rider and one horse to keep.'
            : displayError}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="tier_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Tier
        </label>
        <select
          id="tier_name"
          value={selectedId}
          onChange={e => handleTierChange(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {tiers.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} - ${t.price}
            </option>
          ))}
          <option value={CUSTOM_ID}>Custom</option>
        </select>
        <input type="hidden" name="tier_name" value={isCustom ? 'Custom' : selectedTier!.name} />
        {isCustom && <input type="hidden" name="is_custom" value="true" />}
      </div>

      {/* Raw Tailwind, not <Button>: this is a joined-corner segmented toggle
          (flex-1 halves, aria state via background color) rather than a standalone
          variant button — forcing it into Button's model would break the layout. */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleLessonTypeSwitch('normal')}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${lessonType === 'normal' ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900' : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}
        >
          Normal
        </button>
        <button
          type="button"
          onClick={() => handleLessonTypeSwitch('group')}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${lessonType === 'group' ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900' : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}
        >
          Group
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
        <input
          type="checkbox"
          aria-label="Jumping"
          checked={jumping}
          onChange={handleJumpingToggle}
          className={`rounded border-zinc-300 dark:border-zinc-600 transition ${flashingKeys.has('jumping') ? 'ring-2 ring-blue-400' : ''}`}
        />
        Jumping
      </label>

      {isManager ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="instructor_id" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Instructor
          </label>
          <select
            id="instructor_id"
            name="instructor_id"
            required
            defaultValue={initialLesson?.instructor_id ?? currentMembershipId}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {instructors.map((i) => (
              <option key={i.membershipId} value={i.membershipId}>{i.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="instructor_id" value={currentMembershipId} />
      )}

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {lessonType === 'group' ? (
            <>Horses <span className="font-normal text-zinc-500">(select at least one)</span></>
          ) : (
            'Horse'
          )}
        </legend>
        {/* Four keys, and the last two are load-bearing (#1616): two horses in one bucket on equal
            exertion used to fall through to `Array.sort`'s stability over input order. For the
            create form that was accidentally alphabetical — `getHorsesByBarn` reads `.order('name')`
            — and the edit route broke even that, appending `inactiveAssigned` after the ordered
            list. The tie is also far more common than it looks: `exhaustionByHorseId` is undefined
            until the projection fetch resolves, so on every first paint *every* horse totals zero
            and the name key alone decides the order. The id key behind it is what makes the
            comparator total: `horses.name` carries no per-barn uniqueness constraint, so two horses
            can share a name and tie on all three keys above. Same `name || id` shape as the six
            other sorts over named barn rows (`db/expenses.ts`, `db/lesson-participants.ts`,
            `db/lessons.ts`, `horses/[id]/page.tsx`). */}
        {[...horses].sort((a, b) => horseSortBucket(a) - horseSortBucket(b) || horseTotalExertion(a) - horseTotalExertion(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map((h) => {
          const isUnavailable = h.is_available === false
          const exhaustion = exhaustionByHorseId?.[h.id]
          return (
          <div key={h.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <label className={`flex items-center gap-2 text-sm ${isUnavailable ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-50'}`}>
              {isUnavailable && checkedHorseIds.has(h.id) && (
                <input type="hidden" name="horse_id" value={h.id} />
              )}
              <input
                type="checkbox"
                name="horse_id"
                value={h.id}
                checked={checkedHorseIds.has(h.id)}
                disabled={isUnavailable}
                onChange={(e) => {
                  setCheckedHorseIds(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(h.id)
                    else next.delete(h.id)
                    return next
                  })
                  if (e.target.checked) {
                    setExertionMap(prev => {
                      const next = new Map(prev)
                      const base = selectedTier?.default_exertion_level ?? (jumping ? 4 : 3)
                      next.set(h.id, jumping ? Math.max(base, 4) : base)
                      return next
                    })
                  } else {
                    setExertionMap(prev => {
                      const next = new Map(prev)
                      next.delete(h.id)
                      return next
                    })
                  }
                }}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              {h.name}
              {isUnavailable && h.unavailability_reason && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">— {h.unavailability_reason}</span>
              )}
            </label>
            {checkedHorseIds.has(h.id) && (
              <>
                <label htmlFor={`exertion_${h.id}`} className="text-xs text-zinc-500">Exertion (1–5)</label>
                <input
                  id={`exertion_${h.id}`}
                  type="number"
                  name={`exertion_${h.id}`}
                  aria-label={`Exertion level for ${h.name}`}
                  min="1"
                  max="5"
                  value={exertionMap.get(h.id) as number}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setExertionMap(prev => {
                      const next = new Map(prev)
                      next.set(h.id, Number.isNaN(val) ? 3 : val)
                      return next
                    })
                  }}
                  required
                  className={`w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 transition ${flashingKeys.has(`exertion_${h.id}`) ? 'ring-2 ring-blue-400' : ''}`}
                />
              </>
            )}
          </div>
          {exhaustion && !isPastLesson && (checkedHorseIds.has(h.id) || (!isUnavailable && h.is_active !== false)) && (
            <ExhaustionBar
              existingRows={exhaustion.existingRows}
              thresholds={exhaustion.thresholds}
              ghostValue={checkedHorseIds.has(h.id) ? exertionMap.get(h.id) : undefined}
            />
          )}
          </div>
          )
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Rider{lessonType === 'group' ? 's' : ''}
          {lessonType === 'group' && (
            <span className="font-normal text-zinc-500"> (select at least 2)</span>
          )}
        </legend>
        {lessonType === 'normal' ? (
          <>
            <select
              id="rider_id"
              name="rider_id"
              value={normalRiderId}
              onChange={e => setNormalRiderId(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">Select a rider</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </>
        ) : (
          riders.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
              <input
                type="checkbox"
                name="rider_id"
                value={r.id}
                checked={checkedRiderIds.has(r.id)}
                onChange={(e) => {
                  setCheckedRiderIds(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(r.id)
                    else next.delete(r.id)
                    return next
                  })
                }}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              {r.name}
            </label>
          ))
        )}
      </fieldset>

      {mode === 'new' && (
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
          <input
            type="checkbox"
            aria-label="Recurring (weekly)"
            checked={isRecurring}
            onChange={e => setIsRecurring(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          Recurring (weekly)
          <input type="hidden" name="is_recurring" value={isRecurring ? 'true' : 'false'} />
        </label>
      )}

      {/* #1021 — the start time is minute-granular and lives in the calendar's day panel, beside
          the schedule it has to fit around. Without a schedule reader there is no calendar to
          host it, so the date falls back to a plain native input and the time field sits beside
          it; every real caller supplies one. */}
      {getScheduleRange ? (
        <MonthCalendarPicker
          value={lessonDate}
          onChange={setLessonDate}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          decorations={dayDecorations}
          items={scheduleItems}
          describeItem={describeScheduleItem}
          label={dateLabel}
          dayPanelAlwaysOpen
          dayPanel={<LessonStartTime timezone={timezone} date={lessonDate} initialTime={initialTime} onChange={setLessonAt} />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="lesson-date" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {dateLabel}
            </label>
            <input
              id="lesson-date"
              type="date"
              value={lessonDate}
              onChange={e => setLessonDate(e.target.value)}
              required
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <LessonStartTime timezone={timezone} date={lessonDate} initialTime={initialTime} onChange={setLessonAt} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="fee" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Fee
        </label>
        <input
          id="fee"
          name="fee"
          type="number"
          min="0"
          step="0.01"
          required
          value={fee}
          onChange={e => setFee(e.target.value)}
          className={`rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 transition ${flashingKeys.has('fee') ? 'ring-2 ring-blue-400' : ''}`}
        />
      </div>

      {!feeIsZero && (
        <div className="flex flex-col gap-1">
          <label htmlFor="payment_type" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Payment type
          </label>
          <select
            id="payment_type"
            name="payment_type"
            value={paymentType}
            onChange={e => setPaymentType(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">Unpaid</option>
            <option value="venmo">Venmo</option>
            <option value="zelle">Zelle</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="freshbooks">FreshBooks Invoice</option>
          </select>
        </div>
      )}

      {initialNotes && (
        <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-700" onChange={() => setNotesDirty(true)}>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</p>
          {mode === 'edit' && initialLesson?.cancelled_at != null && (
            <div className="flex flex-col gap-1">
              <label htmlFor="cancellation_notes" className="text-xs font-medium text-zinc-500">Cancellation Notes</label>
              <textarea
                id="cancellation_notes"
                name="cancellation_notes"
                defaultValue={initialLesson.cancellation_notes ?? ''}
                rows={2}
                className="w-full rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          )}
          {initialNotes.horses.map((h) => (
            <div key={h.id} className="flex flex-col gap-1">
              <input type="hidden" name="noteHorseId" value={h.id} />
              <label htmlFor={`horse_notes_${h.id}`} className="text-xs font-medium text-zinc-500">{h.name}</label>
              <textarea
                id={`horse_notes_${h.id}`}
                name={`horse_notes_${h.id}`}
                defaultValue={h.horse_notes ?? ''}
                rows={2}
                className="w-full rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          ))}
          {initialNotes.riders.map((r) => (
            <div key={r.membershipId} className="flex flex-col gap-2">
              <input type="hidden" name="noteRiderId" value={r.membershipId} />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{r.name}</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500">Rider Notes</label>
                <textarea
                  name={`rider_notes_${r.membershipId}`}
                  defaultValue={r.rider_notes ?? ''}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Private</span>
                <textarea
                  name={`private_notes_${r.membershipId}`}
                  defaultValue={r.private_notes ?? ''}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Button type="submit" loading={pending}>
        {pending
          ? (mode === 'edit' ? 'Saving…' : 'Submitting…')
          : (mode === 'edit' ? 'Save' : 'Submit')}
      </Button>
    </form>
  )
}
