import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/horses', () => ({ getHorsesByBarn: vi.fn() }))
vi.mock('../actions', () => ({
  addHorseAction: vi.fn(),
  updateHorseAction: vi.fn(),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import HorsesPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

const mockHorses = [
  createMockHorse({ id: 'horse-1', name: 'Thunderbolt' }),
  createMockHorse({ id: 'horse-2', name: 'Shadow' }),
]

describe('HorsesPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getHorsesByBarn).mockResolvedValue([])
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_horse_list_when_barn_exists', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/green acres/i)).toBeDefined()
  })

  it('should_render_each_horse_name_in_the_list', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByDisplayValue('Thunderbolt')).toBeDefined()
    expect(screen.getByDisplayValue('Shadow')).toBeDefined()
  })

  it('should_render_an_add_horse_form', async () => {
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /add/i })).toBeDefined()
  })

  it('should_render_edit_form_per_horse_with_current_name_prefilled', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('button', { name: /save/i })).toHaveLength(2)
  })

  it('should_render_update_form_outside_table_per_horse', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(document.getElementById('update-horse-horse-1')).not.toBeNull()
  })

  it('should_associate_horse_name_input_with_its_form', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByDisplayValue('Thunderbolt').getAttribute('form')).toBe('update-horse-horse-1')
  })

  it('should_associate_save_button_with_its_form', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue(mockHorses)
    const jsx = await HorsesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('button', { name: /save/i })[0].getAttribute('form')).toBe('update-horse-horse-1')
  })

})
