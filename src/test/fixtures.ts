import type { Agreement, AgreementCharge, Barn, BarnMembership, ExpenseWithHorses, Horse, HorseExertionSummary, HorseExpense, Lesson, LessonSeries, LessonTier, Profile } from '@/lib/db/types'

export function createMockBarn(overrides: Partial<Barn> = {}): Barn {
  return { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '', default_board_fee: 1000, instructor_cut: 25, exhaustion_threshold_high: 11, exhaustion_threshold_moderate: 5, ...overrides }
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
    created_at: '',
    ...overrides,
  }
}

export function createMockHorse(overrides: Partial<Horse> = {}): Horse {
  return {
    id: 'horse-1',
    barn_id: 'barn-1',
    name: 'Thunderbolt',
    is_active: true,
    is_available: true,
    unavailability_reason: null,
    deactivated_at: null,
    exhaustion_threshold_high: null,
    exhaustion_threshold_moderate: null,
    created_at: '',
    updated_at: '',
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
    payment_type: null,
    tier_name: 'Custom',
    cancelled_at: null,
    cancellation_notes: null,
    series_id: null,
    ...overrides,
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
    ...overrides,
  }
}

export function createMockHorseExertionSummary(overrides: Partial<HorseExertionSummary> = {}): HorseExertionSummary {
  return {
    id: 'horse-1',
    name: 'Thunderbolt',
    is_active: true,
    is_available: true,
    unavailability_reason: null,
    lessonCount: 3,
    totalExertion: 12,
    jumpingCount: 0,
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
    ...overrides,
  }
}
