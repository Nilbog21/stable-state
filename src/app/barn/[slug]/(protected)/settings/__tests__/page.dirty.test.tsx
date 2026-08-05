import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'
import { withBlocker } from '@/test/navigation-blocker-harness'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-tiers', () => ({ getAllTiersByBarn: vi.fn() }))
vi.mock('@/lib/db/barn-events', () => ({ getEventsByBarn: vi.fn() }))
vi.mock('@/lib/db/document-backup', () => ({ getAllBarnDocuments: vi.fn() }))
vi.mock('../actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../actions')>()
  return {
    ...actual,
    downloadAllDocumentsAction: vi.fn(),
    downloadBarnDataAction: vi.fn(),
  }
})

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { getEventsByBarn } from '@/lib/db/barn-events'
import { getAllBarnDocuments } from '@/lib/db/document-backup'
import SettingsPage from '../page'

async function renderPage() {
  const jsx = await SettingsPage({
    params: Promise.resolve({ slug: 'green-acres' }),
    searchParams: Promise.resolve({}),
  })
  render(withBlocker(jsx))
}

describe('SettingsPage — navigation dirty state', () => {
  beforeEach(() => {
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn())
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-mgr', role: 'manager' }))
    vi.mocked(getAllTiersByBarn).mockResolvedValue([])
    vi.mocked(getEventsByBarn).mockResolvedValue([])
    vi.mocked(getAllBarnDocuments).mockResolvedValue({ horse: [], trainer: [], rider: [] })
  })

  it('should_set_dirty_when_instructor_cut_changed', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText(/default per-lesson instructor cut/i), { target: { value: '30' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })

  it('should_set_dirty_when_timezone_selected', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText(/timezone/i), { target: { value: 'America/Chicago' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
