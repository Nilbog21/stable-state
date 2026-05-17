import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  getHorsesByBarn: vi.fn(),
}))

vi.mock('@/lib/db/riders', () => ({
  getRidersByBarn: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getActiveTrainerMembershipsByBarn: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfilesByUserIds: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/app/actions/lessons', () => ({
  submitLesson: vi.fn(),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRidersByBarn } from '@/lib/db/riders'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import LessonNewPage from '../page'

const mockBarn = {
  id: 'barn-1',
  name: 'Green Acres',
  slug: 'green-acres',
  created_at: '2026-01-01T00:00:00Z',
}

const mockHorses = [
  { id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'horse-2', barn_id: 'barn-1', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' },
]

const mockRiders = [
  { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'rider-2', barn_id: 'barn-1', name: 'Bob', created_at: '2026-01-02', updated_at: '2026-01-02' },
]

const mockTrainerMembership = {
  id: 'mem-1',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
}

const mockManagerMembership = {
  ...mockTrainerMembership,
  user_id: 'manager-1',
  role: 'manager' as const,
}

const mockTrainerBarnMembership = {
  ...mockTrainerMembership,
  user_id: 'trainer-2',
  id: 'mem-2',
}

describe('LessonNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    vi.mocked(getRidersByBarn).mockResolvedValue(mockRiders)
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
  })

  it('should_render_form_when_barn_exists', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /submit/i })).toBeDefined()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any)
    vi.mocked(redirect).mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
    await expect(
      LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_call_notFound_when_barn_slug_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      LessonNewPage({ params: Promise.resolve({ slug: 'unknown-slug' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_render_horse_options_in_select', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('option', { name: 'Thunderbolt' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Shadow' })).toBeDefined()
  })

  it('should_render_rider_options_in_select', async () => {
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('option', { name: 'Alice' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Bob' })).toBeDefined()
  })

  it('should_not_render_instructor_select_when_user_is_a_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByLabelText(/instructor/i)).toBeNull()
  })

  it('should_render_instructor_select_when_user_is_a_manager', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'manager-1' } },
          error: null,
        }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([
      { user_id: 'manager-1', first_name: 'Jane', last_name: 'Doe', created_at: '2026-01-01' },
    ])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByLabelText(/instructor/i)).toBeDefined()
  })

  it('should_render_trainer_options_in_instructor_select_for_manager', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'manager-1' } },
          error: null,
        }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([mockTrainerBarnMembership])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([
      { user_id: 'manager-1', first_name: 'Jane', last_name: 'Doe', created_at: '2026-01-01' },
      { user_id: 'trainer-2', first_name: 'John', last_name: 'Smith', created_at: '2026-01-01' },
    ])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('option', { name: 'John Smith' })).toBeDefined()
  })

  it('should_pre_select_current_user_in_instructor_select', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'manager-1' } },
          error: null,
        }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([
      { user_id: 'manager-1', first_name: 'Jane', last_name: 'Doe', created_at: '2026-01-01' },
    ])
    const jsx = await LessonNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const select = screen.getByLabelText(/instructor/i) as HTMLSelectElement
    expect(select.value).toBe('manager-1')
  })
})
