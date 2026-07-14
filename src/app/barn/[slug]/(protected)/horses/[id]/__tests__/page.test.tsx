import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorseById: vi.fn() }))
vi.mock('@/lib/db/documents', () => ({
  getDocuments: vi.fn(),
}))
vi.mock('@/lib/db/document-storage', () => ({
  getSignedUrl: vi.fn(),
}))
vi.mock('../actions', () => ({
  updateHorseAction: vi.fn(),
  deleteHorseDocumentAction: vi.fn(),
  updateHorseDocumentReminderDateAction: vi.fn(),
}))
vi.mock('../HorseManagerForm', () => ({
  HorseManagerForm: () => <div data-testid="horse-manager-form" />,
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, useRouter: () => ({ refresh: vi.fn() }) }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseById } from '@/lib/db/horses'
import { getDocuments } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import HorseDetailPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const trainerMembership = createMockMembership({ role: 'trainer', status: 'active' })
const riderMembership = createMockMembership({ role: 'rider', status: 'active' })

const availableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true, unavailability_reason: null })
const unavailableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: false, unavailability_reason: 'on stall rest' })

const pageParams = Promise.resolve({ slug: 'green-acres', id: 'horse-1' })

const mockDoc = {
  id: 'doc-1',
  barn_id: 'barn-1',
  horse_id: 'horse-1',
  record_type: 'coggins',
  storage_path: 'barn-1/horses/horse-1/coggins.pdf',
  file_name: 'coggins.pdf',
  file_size: 1024,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('HorseDetailPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getHorseById).mockResolvedValue(availableHorse)
    vi.mocked(getDocuments).mockResolvedValue([])
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/signed')
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

  it('should_render_available_status_for_trainer_when_horse_is_available', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/available/i)).toBeDefined()
  })

  it('should_render_unavailable_status_for_trainer_when_horse_is_unavailable', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getHorseById).mockResolvedValue(unavailableHorse)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/unavailable/i)).toBeDefined()
  })

  it('should_not_render_status_section_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Status')).toBeNull()
  })

  it('should_render_horse_manager_form_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByTestId('horse-manager-form')).toBeDefined()
  })

  it('should_not_render_horse_manager_form_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-manager-form')).toBeNull()
  })

  it('should_not_render_horse_manager_form_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByTestId('horse-manager-form')).toBeNull()
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

  it('should_render_documents_heading_in_text_sm', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: /^documents$/i }).className).toContain('text-sm')
  })

  it('should_render_add_document_link_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    const links = screen.getAllByRole('link', { name: /add document/i }) as HTMLAnchorElement[]
    expect(links[0].href).toMatch(/\/barn\/green-acres\/documents\/new\?entity=horse&id=horse-1$/)
  })

  it('should_render_add_document_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /add document/i }).length).toBeGreaterThan(0)
  })

  it('should_not_render_add_document_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('link', { name: /add document/i })).toBeNull()
  })

  it('should_render_documents_list_for_manager_when_documents_exist', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockDoc] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('coggins.pdf')).toBeDefined()
  })

  it('should_render_no_documents_message_when_list_is_empty_for_manager', async () => {
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('No documents yet')).toBeDefined()
  })

  it('should_render_delete_button_for_manager_when_document_exists', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockDoc] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_not_render_delete_button_for_trainer_when_document_exists', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getDocuments).mockResolvedValue([mockDoc] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('should_not_render_actions_column_header_for_trainer_when_document_exists', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getDocuments).mockResolvedValue([mockDoc] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('Actions')).toBeNull()
  })

  it('should_not_render_documents_section_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText('No documents yet')).toBeNull()
  })

  it('should_render_documents_table_for_manager_when_documents_exist', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockDoc] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByRole('table')).toBeDefined()
  })

  it('should_render_type_column_header_when_documents_exist', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockDoc] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('Type')).toBeDefined()
  })

  it('should_render_notes_em_dash_when_notes_is_null', async () => {
    vi.mocked(getDocuments).mockResolvedValue([mockDoc] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_notes_text_when_present', async () => {
    vi.mocked(getDocuments).mockResolvedValue([{ ...mockDoc, notes: 'check annually' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText('check annually')).toBeDefined()
  })

  it('should_render_reminder_due_badge_when_document_reminder_date_is_past', async () => {
    vi.mocked(getDocuments).mockResolvedValue([{ ...mockDoc, reminder_date: '2020-01-01' }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.getByText(/reminder due/i)).toBeDefined()
  })

  it('should_not_render_reminder_due_badge_when_document_has_no_reminder_date', async () => {
    vi.mocked(getDocuments).mockResolvedValue([{ ...mockDoc, reminder_date: null }] as any)
    const jsx = await HorseDetailPage({ params: pageParams })
    render(jsx)
    expect(screen.queryByText(/reminder due/i)).toBeNull()
  })
})
