import type { Barn, BarnMembership, Horse, HorseExertionSummary, Lesson, LessonTier, Profile } from '@/lib/db/types'

export function createMockBarn(overrides: Partial<Barn> = {}): Barn {
  return { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '', ...overrides }
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
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}


export function createMockLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    barn_id: 'barn-1',
    instructor_id: 'user-1',
    fee: null,
    lesson_at: '2026-05-19T10:00:00Z',
    submitted_at: '2026-05-19T09:00:00Z',
    lesson_type: 'normal',
    jumping: false,
    payment_type: null,
    tier_name: 'Custom',
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
