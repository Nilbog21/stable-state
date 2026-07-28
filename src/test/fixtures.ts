import type { Agreement, AgreementCharge, Barn, BarnEvent, BarnMembership, ExpenseWithHorses, Horse, HorseExertionSummary, HorseExpense, Lesson, LessonDetail, LessonSeries, LessonTier, LessonWithDetails, MemberHorsePrivilege, PaymentType, Profile, ScheduledExpense, ScheduleItem } from '@/lib/db/types'

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
    start_date: '2026-07-01',
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

export function createMockAgreementCharge(overrides: Partial<AgreementCharge> = {}): AgreementCharge {
  return {
    id: 'charge-1',
    barn_id: 'barn-1',
    agreement_id: 'agreement-1',
    period: '2026-07-01',
    fee: 200,
    payment_type: null,
    created_at: '',
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
  return {
    ...createMockLesson(lessonOverrides),
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
    event_at: '2026-07-01T10:00:00Z',
    notes: null,
    visible_to_roles: ['manager', 'trainer', 'rider'],
    created_at: '',
    ...overrides,
  }
}

export function createMockHorseExpense(overrides: Partial<HorseExpense> = {}): HorseExpense {
  return {
    id: 'expense-1',
    barn_id: 'barn-1',
    expense_date: '2026-07-01',
    expense_time: null,
    amount: 100,
    recipient: 'Dr. Smith',
    expense_type: 'Veterinary',
    notes: null,
    applies_to_all_horses: false,
    payment_type: null,
    created_at: '',
    updated_at: '',
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

// Builds a ScheduledExpense (expense_time preset to 10:00) for the dashboard card/sections tests.
export function makeExpense(overrides: Partial<ScheduledExpense> = {}): ScheduledExpense {
  return {
    ...createMockExpenseWithHorses({ expense_time: '10:00:00' }),
    ...overrides,
  } as ScheduledExpense
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
