import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse, createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorseById: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getMembershipById: vi.fn() }))
vi.mock('@/lib/db/profiles', () => ({ getProfileById: vi.fn() }))
vi.mock('../actions', () => ({ uploadDocumentAction: vi.fn() }))
vi.mock('../DocumentUploadForm', () => ({
  DocumentUploadForm: ({ entity }: { entity: string }) => <div data-testid="document-upload-form">{entity}</div>,
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import { requireMembership } from '@/lib/auth/guard'
import { getHorseById } from '@/lib/db/horses'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { getProfileById } from '@/lib/db/profiles'
import NewDocumentPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', role: 'rider' })

const horse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetProfile = createMockProfile({ user_id: 'user-target-trn', first_name: 'Bob', last_name: 'Trainer' })

function makeParams(slug: string, entity?: string, id?: string) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({ entity, id }),
  }
}

describe('NewDocumentPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getHorseById).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(getProfileById).mockReset()
    mockNotFound.mockClear()

    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-mgr' } as any,
      barn: mockBarn,
      membership: managerMembership,
    })
    vi.mocked(getHorseById).mockResolvedValue(horse)
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(targetProfile)
  })

  it('should_call_notFound_when_entity_is_missing', async () => {
    await expect(NewDocumentPage(makeParams('green-acres', undefined, 'horse-1'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_entity_is_invalid', async () => {
    await expect(NewDocumentPage(makeParams('green-acres', 'bogus', 'horse-1'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_id_is_missing', async () => {
    await expect(NewDocumentPage(makeParams('green-acres', 'horse', undefined))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_horse_does_not_exist', async () => {
    vi.mocked(getHorseById).mockResolvedValue(null)
    await expect(NewDocumentPage(makeParams('green-acres', 'horse', 'horse-1'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_horse_name_in_heading', async () => {
    const jsx = await NewDocumentPage(makeParams('green-acres', 'horse', 'horse-1'))
    render(jsx)
    expect(screen.getByRole('heading', { name: /thunderbolt/i })).toBeDefined()
  })

  it('should_call_requireMembership_with_manager_and_trainer_for_horse_entity', async () => {
    await NewDocumentPage(makeParams('green-acres', 'horse', 'horse-1'))
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer'])
  })

  it('should_render_document_upload_form_with_horse_entity', async () => {
    const jsx = await NewDocumentPage(makeParams('green-acres', 'horse', 'horse-1'))
    render(jsx)
    expect(screen.getByTestId('document-upload-form').textContent).toBe('horse')
  })

  it('should_render_cancel_link_to_horse_detail_page', async () => {
    const jsx = await NewDocumentPage(makeParams('green-acres', 'horse', 'horse-1'))
    render(jsx)
    const link = screen.getByRole('link', { name: /cancel/i }) as HTMLAnchorElement
    expect(link.href).toMatch(/\/barn\/green-acres\/horses\/horse-1$/)
  })

  it('should_call_notFound_when_target_membership_does_not_exist', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)
    await expect(NewDocumentPage(makeParams('green-acres', 'trainer', 'mem-target-trn'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_target_membership_is_in_a_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue({ ...targetTrainerMembership, barn_id: 'barn-other' })
    await expect(NewDocumentPage(makeParams('green-acres', 'trainer', 'mem-target-trn'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_rider_targets_another_member', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-rdr' } as any,
      barn: mockBarn,
      membership: riderMembership,
    })
    await expect(NewDocumentPage(makeParams('green-acres', 'trainer', 'mem-target-trn'))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_member_name_in_heading', async () => {
    const jsx = await NewDocumentPage(makeParams('green-acres', 'trainer', 'mem-target-trn'))
    render(jsx)
    expect(screen.getByRole('heading', { name: /bob trainer/i })).toBeDefined()
  })

  it('should_render_document_upload_form_with_trainer_entity', async () => {
    const jsx = await NewDocumentPage(makeParams('green-acres', 'trainer', 'mem-target-trn'))
    render(jsx)
    expect(screen.getByTestId('document-upload-form').textContent).toBe('trainer')
  })

  it('should_render_cancel_link_to_member_detail_page', async () => {
    const jsx = await NewDocumentPage(makeParams('green-acres', 'trainer', 'mem-target-trn'))
    render(jsx)
    const link = screen.getByRole('link', { name: /cancel/i }) as HTMLAnchorElement
    expect(link.href).toMatch(/\/barn\/green-acres\/members\/mem-target-trn$/)
  })

  it('should_allow_trainer_to_upload_to_own_page', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-trn' } as any,
      barn: mockBarn,
      membership: trainerMembership,
    })
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ user_id: 'user-trn', first_name: 'Own', last_name: 'Trainer' }))
    const jsx = await NewDocumentPage(makeParams('green-acres', 'trainer', 'mem-trn'))
    render(jsx)
    expect(screen.getByTestId('document-upload-form')).toBeDefined()
  })
})
