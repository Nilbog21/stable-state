import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorseById: vi.fn() }))
vi.mock('../actions', () => ({
  updateHorseAvailabilityAction: vi.fn(),
  renameHorseAction: vi.fn(),
  setHorseActiveAction: vi.fn(),
}))
vi.mock('../HorseAvailabilityForm', () => ({
  HorseAvailabilityForm: ({ horse }: { horse: { name: string } }) => (
    <div data-testid="availability-form">{horse.name}</div>
  ),
}))
vi.mock('../HorseActivationSection', () => ({
  HorseActivationSection: ({ isActive }: { isActive: boolean }) => (
    <div data-testid="activation-section">{isActive ? 'active' : 'inactive'}</div>
  ),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseById } from '@/lib/db/horses'
import HorseDetailPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const trainerMembership = createMockMembership({ role: 'trainer', status: 'active' })
const riderMembership = createMockMembership({ role: 'rider', status: 'active' })

const availableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true, unavailability_reason: null })
const unavailableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: false, unavailability_reason: 'on stall rest' })
const inactiveHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_active: false })

const pageParams = Promise.resolve({ slug: 'green-acres', id: 'horse-1' })

describe('HorseDetailPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getHorseById).mockResolvedValue(availableHorse)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(HorseDetailPage({ params: pageParams })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(HorseDetailPage({ params: pageParams })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_null', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(HorseDetailPage({ params: pageParams })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...managerMembership, status: 'pending' })
    await expect(HorseDetailPage({ params: pageParams })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_horse_does_not_exist', async () => {
    vi.mocked(getHorseById).mockResolvedValue(null)
    await expect(HorseDetailPage({ params: pageParams })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_horse_name', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Thunderbolt' })).toBeDefined()
  })

  it('should_render_available_status_when_horse_is_available', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/available/i)).toBeDefined()
  })

  it('should_render_unavailable_status_when_horse_is_unavailable', async () => {
    vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/unavailable/i)).toBeDefined()
  })

  it('should_render_availability_form_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('availability-form')).toBeDefined()
  })

  it('should_not_render_availability_form_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('availability-form')).toBeNull()
  })

  it('should_not_render_availability_form_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('availability-form')).toBeNull()
  })

  it('should_render_unavailability_reason_for_trainer_when_unavailable', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('on stall rest')).toBeDefined()
  })

  it('should_render_unavailability_reason_for_rider_when_unavailable', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('on stall rest')).toBeDefined()
  })

  it('should_not_render_unavailability_reason_for_trainer_when_available', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('on stall rest')).toBeNull()
  })

  it('should_render_name_input_prefilled_with_horse_name_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const input = screen.getByRole('textbox', { name: /name/i }) as HTMLInputElement
    expect(input.value).toBe('Thunderbolt')
  })

  it('should_not_render_name_input_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull()
  })

  it('should_not_render_name_input_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull()
  })

  it('should_render_activation_section_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('activation-section')).toBeDefined()
  })

  it('should_not_render_activation_section_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('activation-section')).toBeNull()
  })

  it('should_not_render_activation_section_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('activation-section')).toBeNull()
  })

  it('should_pass_is_active_true_to_activation_section_when_horse_is_active', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('activation-section').textContent).toBe('active')
  })

  it('should_pass_is_active_false_to_activation_section_when_horse_is_inactive', async () => {
    vi.mocked(getHorseById).mockResolvedValue(inactiveHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('activation-section').textContent).toBe('inactive')
  })
})
