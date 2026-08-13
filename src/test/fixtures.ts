import type { Agreement, Appointment, AgreementCharge, AgreementChargeRow, Barn, BarnEvent, BarnMembership, ExpenseWithHorses, Horse, HorseExertionSummary, HorseExpense, Instant, Lesson, LessonDetail, LessonSeries, LessonTier, LessonWithDetails, MemberHorsePrivilege, PaymentType, Profile, ScheduledAppointment, ScheduleItem } from '@/lib/db/types'
import { calendarDate } from '@/lib/local-day'

export function createMockScheduleItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'item-1',
    itemType: 'lesson',
    start: '2026-07-23T09:00:00',
    durationMinutes: 60,
    instructorId: null,
    horseIds: [],
    riderIds: [],
    exertionByHorseId: {},
    appliesToAllHorses: false,
    label: null,
    ...overrides,
  }
}

export function createMockBarn(overrides: Partial<Barn> = {}): Barn {
  return { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '', default_board_fee: 1000, default_instructor_cut: 25, exhaustion_threshold_high: 11, exhaustion_threshold_moderate: 5, timezone: 'America/New_York', is_demo: false, schedule_buffer_minutes: 30, is_test_barn: false, ...overrides }
}

export function createMockAgreement(overrides: Partial<Agreement> = {}): Agreement {
  return {
    id: 'agreement-1',
    barn_id: 'barn-1',
    rider_id: 'rider-1',
    horse_id: 'horse-1',
    fee: 200,
    kind: 'lease',
    cadence: 'monthly',
    start_date: calendarDate('2026-07-01'),
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// A bare `agreement_charges` row as the DB returns it (#1441) — no payment_type, that lives
// on the paired transactions row and is overlaid back on by getChargesForAgreement. This is
// what the three charge-writing RPCs hand back.
export function createMockAgreementChargeRow(overrides: Partial<AgreementChargeRow> = {}): AgreementChargeRow {
  return {
    id: 'charge-1',
    barn_id: 'barn-1',
    agreement_id: 'agreement-1',
    period: calendarDate('2026-07-01'),
    fee: 200,
    created_at: '',
    ...overrides,
  }
}

export function createMockAgreementCharge(overrides: Partial<AgreementCharge> = {}): AgreementCharge {
  return {
    ...createMockAgreementChargeRow(),
    payment_type: null,
    ...overrides,
  }
}

export function createMockUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-1', email: 'user@example.com', ...overrides }
}

export function createMockMembership(overrides: Partial<BarnMembership> = {}): BarnMembership {
  return {
    id: 'mem-1',
    user_id: 'user-1',
    profile_id: 'profile-1',
    barn_id: 'barn-1',
    role: 'trainer',
    status: 'active',
    can_instruct: true,
    invite_token: null,
    calendar_feed_token: null,
    created_at: '',
    ...overrides,
  }
}

export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    email: 'user@example.com',
    is_managed: false,
    first_name: 'Jane',
    last_name: 'Doe',
    phone: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    photo_path: null,
    created_at: '',
    ...overrides,
  }
}

export function createMockHorse(overrides: Partial<Horse> = {}): Horse {
  return {
    id: 'horse-1',
    barn_id: 'barn-1',
    name: 'Thunderbolt',
    registered_name: null,
    is_active: true,
    is_available: true,
    unavailability_reason: null,
    deactivated_at: null,
    exhaustion_threshold_high: null,
    exhaustion_threshold_moderate: null,
    feed_notes: null,
    medication_notes: null,
    owning_member_id: null,
    photo_path: null,
    photo_uploaded_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

export function createMockMemberHorsePrivilege(overrides: Partial<MemberHorsePrivilege> = {}): MemberHorsePrivilege {
  return {
    id: 'privilege-1',
    barn_id: 'barn-1',
    member_id: 'mem-1',
    horse_id: 'horse-1',
    document_privileges: 'none',
    lesson_read_privileges: false,
    created_at: '',
    ...overrides,
  }
}


// Every branded fixture below carries the same zone `createMockBarn` uses, so a test that
// pairs the two sees a consistent barn. `instant()` is the shorthand for overriding one.
export const MOCK_BARN_TZ = 'America/New_York'

export function instant(at: string, tz: string = MOCK_BARN_TZ): Instant {
  return { at, tz }
}

export function createMockLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    barn_id: 'barn-1',
    instructor_id: 'mem-1',
    fee: 50,
    lesson_at: '2026-05-19T10:00:00Z',
    submitted_at: '2026-05-19T09:00:00Z',
    lesson_type: 'normal',
    jumping: false,
    tier_name: 'Custom',
    cancelled_at: null,
    cancellation_notes: null,
    series_id: null,
    instructor_cut: 0,
    ...overrides,
  }
}

export function createMockLessonWithDetails(overrides: Partial<LessonWithDetails> = {}): LessonWithDetails {
  return {
    ...createMockLesson(),
    lesson_at: instant('2026-05-19T10:00:00Z'),
    payment_type: null,
    instructor_name: 'Jane Smith',
    horse_names: ['Thunderbolt'],
    horse_ids: ['horse-1'],
    horse_count: 1,
    rider_names: ['Alice'],
    rider_ids: ['rider-1'],
    rider_count: 1,
    rider_cancelled_ats: [null],
    needs_attention: false,
    ...overrides,
  }
}

export function createMockLessonDetail(overrides: Partial<LessonDetail> = {}): LessonDetail {
  return {
    ...createMockLesson(),
    lesson_at: instant('2026-05-19T10:00:00Z'),
    payment_type: null,
    instructor_name: 'Jane Smith',
    instructor_user_id: 'user-1',
    lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, unavailability_reason: null } }],
    lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
    ...overrides,
  }
}

// Unlike createMockLessonDetail (fully-populated), this defaults to no horses/no riders and builds
// lesson_riders from raw user ids — the shape the lesson action tests need.
export function makeLessonDetail(
  overrides: Partial<ReturnType<typeof createMockLesson>> & { payment_type?: PaymentType | null } = {},
  riderUserIds: (string | null)[] = [],
  instructorUserId: string | null = null
) {
  const { payment_type = null, ...lessonOverrides } = overrides
  const lesson = createMockLesson(lessonOverrides)
  return {
    ...lesson,
    // Callers override `lesson_at` with the plain string the raw row carries; branding it
    // here keeps every one of them from restating the barn zone (#1222).
    lesson_at: instant(lesson.lesson_at),
    payment_type,
    instructor_name: null,
    instructor_user_id: instructorUserId,
    lesson_horses: [],
    lesson_riders: riderUserIds.map((userId) => ({
      rider_notes: null,
      private_notes: null,
      cancellation_notes: null,
      cancelled_at: null,
      barn_membership: { id: 'mem', user_id: userId, name: 'Rider' },
    })),
  }
}

export function createMockLessonSeries(overrides: Partial<LessonSeries> = {}): LessonSeries {
  return {
    id: 'series-1',
    barn_id: 'barn-1',
    instructor_id: 'mem-1',
    fee: 50,
    lesson_type: 'normal',
    jumping: false,
    tier_name: 'Custom',
    horse_ids: ['horse-1'],
    exertion_levels: [3],
    rider_ids: ['rider-1'],
    is_active: true,
    created_at: '2026-05-19T09:00:00Z',
    instructor_cut: 0,
    ...overrides,
  }
}

export function createMockHorseExertionSummary(overrides: Partial<HorseExertionSummary> = {}): HorseExertionSummary {
  return {
    id: 'horse-1',
    name: 'Thunderbolt',
    registered_name: null,
    is_active: true,
    is_available: true,
    unavailability_reason: null,
    exhaustion_threshold_high: null,
    exhaustion_threshold_moderate: null,
    lessonCount: 3,
    totalExertion: 12,
    jumpingCount: 0,
    ...overrides,
  }
}

export function createMockBarnEvent(overrides: Partial<BarnEvent> = {}): BarnEvent {
  return {
    id: 'event-1',
    barn_id: 'barn-1',
    title: 'Costume Party',
    event_at: instant('2026-07-01T10:00:00Z'),
    notes: null,
    visible_to_roles: ['manager', 'trainer', 'rider'],
    created_at: '',
    ...overrides,
  }
}

// A bare `appointments` row as the DB returns it (#1148) — no amount/payment_type, those
// live on appointment_costs and are flattened back on by the DAL.
export function createMockAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'expense-1',
    barn_id: 'barn-1',
    expense_date: calendarDate('2026-07-01'),
    expense_time: null,
    recipient: 'Dr. Smith',
    expense_type: 'Veterinary',
    notes: null,
    applies_to_all_horses: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

export function createMockHorseExpense(overrides: Partial<HorseExpense> = {}): HorseExpense {
  return {
    ...createMockAppointment(),
    amount: 100,
    payment_type: null,
    ...overrides,
  }
}

export function createMockExpenseWithHorses(overrides: Partial<ExpenseWithHorses> = {}): ExpenseWithHorses {
  return {
    ...createMockHorseExpense(),
    horse_ids: ['horse-1'],
    horse_names: ['Thunderbolt'],
    ...overrides,
  }
}

// Builds a ScheduledAppointment (expense_time preset to 10:00) for the dashboard card/sections tests.
export function makeExpense(overrides: Partial<ScheduledAppointment> = {}): ScheduledAppointment {
  return {
    ...createMockExpenseWithHorses({ expense_time: '10:00:00' }),
    ...overrides,
  } as ScheduledAppointment
}

export function createMockLessonTier(overrides: Partial<LessonTier> = {}): LessonTier {
  return {
    id: 'tier-1',
    barn_id: 'barn-1',
    name: 'Standard',
    price: 50,
    is_default: false,
    is_active: true,
    created_at: '',
    default_exertion_level: null,
    default_jumping: null,
    instructor_cut: 0,
    ...overrides,
  }
}
