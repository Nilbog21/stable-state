import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  getLessonById: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import LessonDetailPage from '../page'

const mockBarn = {
  id: 'barn-1',
  name: 'Green Acres',
  slug: 'green-acres',
  created_at: '2026-01-01T00:00:00Z',
}

const mockLessonDetail = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: '2026-05-17T10:00:00Z',
  submitted_at: '2026-05-17T10:05:00Z',
  lesson_type: 'normal' as const,
  jumping: false,
  payment_type: null,
  tier_name: 'Custom',
  instructor_name: 'Jane Smith',
  lesson_horses: [{ exertion_level: 3, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }],
  lesson_riders: [{ rider_notes: 'good position', private_notes: 'struggling with confidence', riders: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
}

const mockMembership = {
  id: 'mem-1',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
}

function mockSupabaseUser(userId = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  } as any)
}

describe('LessonDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getLessonById).mockResolvedValue(mockLessonDetail)
    vi.mocked(getUserMembership).mockResolvedValue(mockMembership)
    mockSupabaseUser()
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'unknown', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as any)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'nonexistent' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_render_date_instructor_horse_exertion_rider_and_fee', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText(/may 17, 2026/i)).toBeDefined()
    expect(screen.getByText(/jane smith/i)).toBeDefined()
    expect(screen.getByText(/thunderbolt/i)).toBeDefined()
    expect(screen.getByText(/exertion 3/i)).toBeDefined()
    expect(screen.getByText(/alice/i)).toBeDefined()
    expect(screen.getByText(/\$75/)).toBeDefined()
  })

  it('should_render_dash_when_instructor_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, instructor_name: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_when_fee_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, fee: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_in_horses_section_when_lesson_has_no_horses', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_horses: [] })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_for_horse_name_when_horses_relation_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horses: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_in_riders_section_when_lesson_has_no_riders', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_riders: [] })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_for_rider_name_when_riders_relation_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ riders: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_show_group_badge_for_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_type: 'group' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Group')).toBeDefined()
  })

  it('should_show_normal_badge_for_normal_lesson', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Normal')).toBeDefined()
  })

  it('should_show_rider_names_for_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { riders: { id: 'rider-1', name: 'Alice' } },
        { riders: { id: 'rider-2', name: 'Bob' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('should_render_riders_as_list_items_for_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { riders: { id: 'rider-1', name: 'Alice' } },
        { riders: { id: 'rider-2', name: 'Bob' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const listItems = screen.getAllByRole('listitem')
    const riderItems = listItems.filter((li) => li.textContent === 'Alice' || li.textContent === 'Bob')
    expect(riderItems.length).toBe(2)
  })

  it('should_render_dash_for_null_rider_in_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [{ riders: null }, { riders: { id: 'rider-2', name: 'Bob' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_show_name_for_non_null_rider_when_other_rider_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [{ riders: null }, { riders: { id: 'rider-2', name: 'Bob' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('should_render_dash_in_riders_section_when_group_lesson_has_no_riders', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_show_rider_name_inline_for_normal_lesson', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_not_render_rider_names_as_list_items_for_normal_lesson', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const listItems = screen.queryAllByRole('listitem')
    const riderItems = listItems.filter((li) => li.textContent === 'Alice')
    expect(riderItems.length).toBe(0)
  })

  it('should_show_edit_link_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /edit/i })).toBeDefined()
  })

  it('should_edit_link_point_to_edit_page_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /edit/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-1/edit')
  })

  it('should_not_show_edit_link_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
  })

  it('should_not_show_edit_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
  })

  it('should_show_jumping_badge_when_lesson_is_jumping', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, jumping: true })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Jumping')).toBeDefined()
  })

  it('should_not_show_jumping_badge_when_lesson_is_not_jumping', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Jumping')).toBeNull()
  })

  it('should_show_horse_notes_form_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const textarea = screen.getByDisplayValue('watch left lead')
    expect(textarea).toBeDefined()
  })

  it('should_show_horse_notes_form_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const textarea = screen.getByDisplayValue('watch left lead')
    expect(textarea).toBeDefined()
  })

  it('should_not_show_horse_notes_form_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByDisplayValue('watch left lead')).toBeNull()
  })

  it('should_show_rider_notes_form_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const textarea = screen.getByDisplayValue('good position')
    expect(textarea).toBeDefined()
  })

  it('should_show_rider_notes_form_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const textarea = screen.getByDisplayValue('good position')
    expect(textarea).toBeDefined()
  })

  it('should_show_private_notes_form_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const textarea = screen.getByDisplayValue('struggling with confidence')
    expect(textarea).toBeDefined()
  })

  it('should_show_private_notes_form_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const textarea = screen.getByDisplayValue('struggling with confidence')
    expect(textarea).toBeDefined()
  })

  it('should_show_private_label_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Private')).toBeDefined()
  })

  it('should_show_rider_own_notes_readonly_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('good position')).toBeDefined()
  })

  it('should_not_show_private_notes_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('struggling with confidence')).toBeNull()
  })

  it('should_not_show_other_riders_notes_for_rider_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: 'good position', private_notes: null, riders: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: 'needs work', private_notes: null, riders: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('needs work')).toBeNull()
  })
})
