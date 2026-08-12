import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { LessonDetail, Horse } from '@/lib/db/types'
import { createMockHorse, createMockLessonDetail, createMockLessonTier, instant } from '@/test/fixtures'
import { LessonForm } from '../LessonForm'
import { NavigationBlockerProvider, useNavigationBlocker } from '../../NavigationBlocker'
import { calendarDate } from '@/lib/local-day'

afterEach(cleanup)

const mockTier = createMockLessonTier({ is_default: true })

const mockHorse: Horse = createMockHorse()
const mockRider = { id: 'rider-1', name: 'Alice' }
const mockRider2 = { id: 'rider-2', name: 'Bob' }

// 10:30Z — 06:30 in the fixture barn's America/New_York. Deliberately *not* a whole hour: this
// fixture was pinned to 10:00Z only because the old hour-only picker could not represent
// anything else and silently rewrote the minutes away. #1021 restored the half hour, so every
// edit-mode test below now exercises the minute-granular round trip rather than dodging it.
const normalLesson: LessonDetail = createMockLessonDetail({
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: instant('2026-05-17T10:30:00Z'),
  submitted_at: '2026-05-17T10:35:00Z',
  lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: null } }],
})

const groupLesson: LessonDetail = {
  ...normalLesson,
  lesson_type: 'group',
  lesson_riders: [
    { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: null } },
    { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: null } },
  ],
}

const baseProps = {
  mode: 'edit' as const,
  initialLesson: normalLesson,
  horses: [mockHorse],
  riders: [mockRider, mockRider2],
  instructors: [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Smith' }],
  currentMembershipId: 'user-1',
  isManager: true,
  tiers: [mockTier],
  action: vi.fn().mockResolvedValue({ error: null }),
  todayStr: calendarDate('2026-06-01'),
}

function DirtyDisplay() {
  const { dirty } = useNavigationBlocker()
  return <div data-testid="dirty">{dirty ? 'dirty' : 'clean'}</div>
}

const pastLesson: LessonDetail = {
  ...normalLesson,
  lesson_at: instant('2020-01-01T10:00:00Z'),
  payment_type: null,
  fee: 75,
}

describe('LessonForm (edit mode — navigation dirty state)', () => {
  let addEventSpy: ReturnType<typeof vi.spyOn>
  let removeEventSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addEventSpy = vi.spyOn(window, 'addEventListener')
    removeEventSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    addEventSpy.mockRestore()
    removeEventSpy.mockRestore()
  })

  it('should_not_set_dirty_when_lesson_is_future', async () => {
    const futureLesson: LessonDetail = { ...pastLesson, lesson_at: instant('2099-01-01T10:00:00Z') }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_not_set_dirty_when_fee_is_zero', async () => {
    const zeroFeeLesson: LessonDetail = { ...pastLesson, fee: 0 }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={zeroFeeLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_not_set_dirty_when_payment_type_is_already_set', async () => {
    const paidLesson: LessonDetail = { ...pastLesson, payment_type: 'venmo' }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={paidLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_when_past_due_unpaid_with_positive_fee', async () => {
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_false_when_payment_type_selected', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'venmo' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_true_when_payment_type_cleared_back_to_unpaid', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'venmo' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_register_beforeunload_when_dirty', async () => {
    render(
      <NavigationBlockerProvider>
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => {
      const calls = addEventSpy.mock.calls.filter(([event]: [string]) => event === 'beforeunload')
      expect(calls.length).toBeGreaterThan(0)
    })
  })

  it('should_remove_beforeunload_when_payment_type_selected', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => {
      const calls = addEventSpy.mock.calls.filter(([event]: [string]) => event === 'beforeunload')
      expect(calls.length).toBeGreaterThan(0)
    })
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    await act(async () => { fireEvent.change(select, { target: { value: 'venmo' } }) })
    const removeCalls = removeEventSpy.mock.calls.filter(([event]: [string]) => event === 'beforeunload')
    expect(removeCalls.length).toBeGreaterThan(0)
  })

  it('should_prevent_default_on_beforeunload_event_when_dirty', async () => {
    render(
      <NavigationBlockerProvider>
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    let handler: ((e: BeforeUnloadEvent) => void) | undefined
    await waitFor(() => {
      const call = addEventSpy.mock.calls.find(([event]: [string]) => event === 'beforeunload')
      expect(call).toBeDefined()
      handler = call![1] as (e: BeforeUnloadEvent) => void
    })
    const mockEvent = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent
    handler!(mockEvent)
    expect(mockEvent.preventDefault).toHaveBeenCalled()
  })

  const futureNormalLesson: LessonDetail = { ...normalLesson, lesson_at: instant('2099-01-01T10:00:00Z') }
  const futureGroupLesson: LessonDetail = { ...groupLesson, lesson_at: instant('2099-01-01T10:00:00Z') }

  it('should_set_dirty_when_fee_changed', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const feeInput = container.querySelector('input[name="fee"]') as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '99' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_false_when_fee_reverted_to_original', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const feeInput = container.querySelector('input[name="fee"]') as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '99' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    fireEvent.change(feeInput, { target: { value: String(futureNormalLesson.fee) } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_when_horse_checkbox_toggled', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const horseCheckbox = container.querySelector('input[name="horse_id"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_new_horse_name_entered', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const newHorseInput = container.querySelector('input[name="new_horse_name"]') as HTMLInputElement
    fireEvent.change(newHorseInput, { target: { value: 'Star' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_not_set_dirty_in_new_mode_when_horse_checked', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} mode="new" initialLesson={undefined} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const horseCheckbox = container.querySelector('input[name="horse_id"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_when_normal_rider_changed', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const select = container.querySelector('select[name="rider_id"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'rider-2' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_group_rider_checkbox_toggled', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureGroupLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const riderCheckboxes = container.querySelectorAll('input[name="rider_id"]')
    fireEvent.click(riderCheckboxes[0])
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_group_riders_swapped_keeping_same_count', async () => {
    const mockRider3 = { id: 'rider-3', name: 'Cara' }
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} riders={[mockRider, mockRider2, mockRider3]} initialLesson={futureGroupLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const [, rider2Checkbox, rider3Checkbox] = container.querySelectorAll('input[name="rider_id"]')
    fireEvent.click(rider2Checkbox)
    fireEvent.click(rider3Checkbox)
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_lesson_has_unresolved_horse_issue', async () => {
    const cleanFutureLesson: LessonDetail = { ...normalLesson, lesson_at: instant('2099-01-01T10:00:00Z') }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={cleanFutureLesson} hasHorseIssue />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_not_set_dirty_when_hasHorseIssue_is_false_and_nothing_else_dirty', async () => {
    const cleanFutureLesson: LessonDetail = { ...normalLesson, lesson_at: instant('2099-01-01T10:00:00Z') }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={cleanFutureLesson} hasHorseIssue={false} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_stay_dirty_when_hasHorseIssue_true_and_fee_also_changed', async () => {
    const futureLesson: LessonDetail = { ...normalLesson, lesson_at: instant('2099-01-01T10:00:00Z') }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} initialLesson={futureLesson} hasHorseIssue />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    fireEvent.change(screen.getByLabelText('Fee'), { target: { value: '999' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_not_set_dirty_in_new_mode_when_hasHorseIssue_is_true', async () => {
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...baseProps} mode="new" initialLesson={undefined} hasHorseIssue />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })
})

describe('LessonForm notes fields', () => {
  const notesProps = {
    ...baseProps,
    initialNotes: {
      horses: [{ id: 'horse-1', name: 'Thunderbolt', horse_notes: 'watch left lead' }],
      riders: [{ membershipId: 'rider-1', name: 'Alice', rider_notes: 'good position', private_notes: 'private info' }],
    },
  }

  it('should_render_horse_notes_textarea_when_initialNotes_provided', () => {
    render(<LessonForm timezone={'America/New_York'} {...notesProps} />)
    expect(screen.getByDisplayValue('watch left lead')).toBeDefined()
  })

  it('should_render_rider_notes_textarea_when_initialNotes_provided', () => {
    render(<LessonForm timezone={'America/New_York'} {...notesProps} />)
    expect(screen.getByDisplayValue('good position')).toBeDefined()
  })

  it('should_render_private_notes_textarea_when_initialNotes_provided', () => {
    render(<LessonForm timezone={'America/New_York'} {...notesProps} />)
    expect(screen.getByDisplayValue('private info')).toBeDefined()
  })

  it('should_render_empty_textarea_when_horse_notes_is_null', () => {
    const props = { ...notesProps, initialNotes: { ...notesProps.initialNotes, horses: [{ id: 'horse-1', name: 'Thunderbolt', horse_notes: null }] } }
    render(<LessonForm timezone={'America/New_York'} {...props} />)
    expect(screen.getByLabelText('Thunderbolt', { selector: 'textarea' })).toBeDefined()
  })

  it('should_render_empty_textarea_when_rider_notes_is_null', () => {
    const props = { ...notesProps, initialNotes: { ...notesProps.initialNotes, riders: [{ membershipId: 'rider-1', name: 'Alice', rider_notes: null, private_notes: 'private info' }] } }
    render(<LessonForm timezone={'America/New_York'} {...props} />)
    expect(screen.getByText('Rider Notes')).toBeDefined()
  })

  it('should_render_empty_textarea_when_private_notes_is_null', () => {
    const props = { ...notesProps, initialNotes: { ...notesProps.initialNotes, riders: [{ membershipId: 'rider-1', name: 'Alice', rider_notes: 'good position', private_notes: null }] } }
    render(<LessonForm timezone={'America/New_York'} {...props} />)
    expect(screen.getByText('Private')).toBeDefined()
  })

  it('should_render_cancellation_notes_textarea_when_lesson_is_cancelled', () => {
    const props = {
      ...notesProps,
      initialLesson: { ...normalLesson, cancelled_at: '2026-05-18T00:00:00Z', cancellation_notes: 'weather' },
    }
    render(<LessonForm timezone={'America/New_York'} {...props} />)
    expect(screen.getByDisplayValue('weather')).toBeDefined()
  })

  it('should_not_render_cancellation_notes_textarea_when_lesson_is_not_cancelled', () => {
    render(<LessonForm timezone={'America/New_York'} {...notesProps} />)
    expect(screen.queryByText('Cancellation Notes')).toBeNull()
  })

  it('should_render_empty_cancellation_notes_textarea_when_notes_is_null', () => {
    const props = {
      ...notesProps,
      initialLesson: { ...normalLesson, cancelled_at: '2026-05-18T00:00:00Z', cancellation_notes: null },
    }
    render(<LessonForm timezone={'America/New_York'} {...props} />)
    expect(screen.getByLabelText('Cancellation Notes')).toBeDefined()
  })

  it('should_not_render_notes_section_when_initialNotes_not_provided', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(screen.queryByText('Notes')).toBeNull()
  })

  it('should_set_dirty_when_notes_changed', async () => {
    const futureLesson: LessonDetail = { ...normalLesson, lesson_at: instant('2099-01-01T10:00:00Z') }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm timezone={'America/New_York'} {...notesProps} initialLesson={futureLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'changed' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })
})
