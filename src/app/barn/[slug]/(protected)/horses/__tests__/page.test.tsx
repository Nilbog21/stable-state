import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorseExertionSummary } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/horses', () => ({ getHorseExertionSummary: vi.fn() }))
vi.mock('../actions', () => ({
  addHorseAction: vi.fn(),
  updateHorseAction: vi.fn(),
}))
vi.mock('../HorseOverviewTable', () => ({
  HorseOverviewTable: ({ horses, isManager }: { horses: unknown[]; isManager?: boolean }) => (
    <div data-testid="horse-overview-table" data-is-manager={String(isManager ?? false)}>
      {(horses as { name: string; id: string }[]).map((h) => (
        <span key={h.id}>{h.name}</span>
      ))}
      {isManager && horses.map((h) => (
        <input key={(h as { id: string }).id} name="name" form={`update-horse-${(h as { id: string }).id}`} />
      ))}
      {isManager && horses.map((h) => (
        <button key={(h as { id: string }).id} form={`update-horse-${(h as { id: string }).id}`}>Save</button>
      ))}
    </div>
  ),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary } from '@/lib/db/horses'
import HorsesPage from '../page'

const mockBarn = createMockBarn()

const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const trainerMembership = createMockMembership({ role: 'trainer', status: 'active' })
const riderMembership = createMockMembership({ role: 'rider', status: 'active' })

const mockHorses = [
  createMockHorseExertionSummary({ id: 'horse-1', name: 'Thunderbolt' }),
  createMockHorseExertionSummary({ id: 'horse-2', name: 'Shadow' }),
]

describe('HorsesPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue([])
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_null', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...managerMembership, status: 'pending' })
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_exertion_table_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByTestId('horse-overview-table')).toBeDefined()
  })

  it('should_not_render_add_horse_form_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
  })

  it('should_not_render_save_buttons_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryAllByRole('button', { name: /save/i })).toHaveLength(0)
  })

  it('should_render_exertion_table_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByTestId('horse-overview-table')).toBeDefined()
  })

  it('should_not_render_add_horse_form_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull()
  })

  it('should_not_render_save_buttons_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryAllByRole('button', { name: /save/i })).toHaveLength(0)
  })

  it('should_render_exertion_table_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByTestId('horse-overview-table')).toBeDefined()
  })

  it('should_render_add_horse_form_for_manager', async () => {
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /add/i })).toBeDefined()
  })

  it('should_render_save_buttons_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('button', { name: /save/i })).toHaveLength(2)
  })

  it('should_render_name_inputs_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    // 2 rename inputs (from mocked HorseOverviewTable) + 1 add-horse input = 3
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
  })

  it('should_render_update_form_for_first_horse_outside_table_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(document.getElementById('update-horse-horse-1')).not.toBeNull()
  })

  it('should_render_update_form_for_second_horse_outside_table_for_manager', async () => {
    vi.mocked(getHorseExertionSummary).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(document.getElementById('update-horse-horse-2')).not.toBeNull()
  })

  it('should_pass_isManager_true_to_table_for_manager', async () => {
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByTestId('horse-overview-table').getAttribute('data-is-manager')).toBe('true')
  })

  it('should_pass_isManager_false_to_table_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByTestId('horse-overview-table').getAttribute('data-is-manager')).toBe('false')
  })
})
