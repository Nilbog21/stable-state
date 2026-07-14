import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-finances', () => ({ getTrainerIncomeDetail: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getTrainerIncomeDetail } from '@/lib/db/lesson-finances'
import TrainerIncomePage from '../page'

const mockBarn = createMockBarn({ created_at: '2026-01-01T00:00:00Z' })
const mockUser = createMockUser()
const managerMembership = createMockMembership({ role: 'manager' })

const defaultParams = Promise.resolve({ slug: 'green-acres', id: 'trainer-1' })
const maySearchParams = Promise.resolve({ month: '2026-05' })

describe('TrainerIncomePage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getTrainerIncomeDetail).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({ trainerName: 'Jane Smith', rows: [], total: 0 })
  })

  it('should_call_requireMembership_with_manager_only', async () => {
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_redirect_when_requireMembership_throws', async () => {
    vi.mocked(requireMembership).mockRejectedValue(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/barn/green-acres/login' })
    )
    await expect(TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_call_getTrainerIncomeDetail_with_trainer_id', async () => {
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(getTrainerIncomeDetail).toHaveBeenCalledWith(mockBarn.id, 'trainer-1', expect.any(Date), expect.any(Date))
  })

  it('should_render_trainer_name_as_heading', async () => {
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Jane Smith' })).toBeDefined()
  })

  it('should_render_empty_state_when_no_rows', async () => {
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/no activity/i)).toBeDefined()
  })

  it('should_render_lesson_date_in_table', async () => {
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({
      trainerName: 'Jane Smith',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100 }],
      total: 100,
    })
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/May 10, 2026/i)).toBeDefined()
  })

  it('should_render_lesson_type_label', async () => {
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({
      trainerName: 'Jane Smith',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100 }],
      total: 100,
    })
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('Lesson')).toBeDefined()
  })

  it('should_render_fee_in_table', async () => {
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({
      trainerName: 'Jane Smith',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100 }],
      total: 100,
    })
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)
  })

  it('should_link_date_to_lesson_detail', async () => {
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({
      trainerName: 'Jane Smith',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100 }],
      total: 100,
    })
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 10, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1')
  })

  it('should_render_total_row', async () => {
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({
      trainerName: 'Jane Smith',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100 }],
      total: 100,
    })
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/total/i)).toBeDefined()
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({
      trainerName: 'Jane Smith',
      rows: [
        { lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100 },
        { lessonId: 'lesson-2', lessonAt: '2026-05-15T10:00:00Z', fee: 60 },
      ],
      total: 160,
    })
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$160.00').length).toBeGreaterThan(0)
  })

  it('should_render_back_link_pointing_to_finances', async () => {
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('/barn/green-acres/finances')
  })

  it('should_render_back_link_with_trainer_tab_param', async () => {
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('tab=trainer')
  })

  it('should_render_rows_in_date_ascending_order', async () => {
    vi.mocked(getTrainerIncomeDetail).mockResolvedValue({
      trainerName: 'Jane Smith',
      rows: [
        { lessonId: 'lesson-1', lessonAt: '2026-05-20T10:00:00Z', fee: 100 },
        { lessonId: 'lesson-2', lessonAt: '2026-05-05T10:00:00Z', fee: 40 },
      ],
      total: 140,
    })
    const jsx = await TrainerIncomePage({ params: defaultParams, searchParams: maySearchParams })
    const { container } = render(jsx)
    const text = container.textContent ?? ''
    expect(text.indexOf('May 5, 2026')).toBeLessThan(text.indexOf('May 20, 2026'))
  })
})
