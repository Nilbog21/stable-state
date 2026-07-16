import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

const mockReadFileSync = vi.hoisted(() => vi.fn().mockReturnValue('# Guide Content'))
vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import GuidePage from '../page'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

const mockBarn = createMockBarn({ id: 'barn-1', name: 'Green Acres', slug: 'green-acres', default_instructor_cut: 25, created_at: '' })
const mockUser = { id: 'user-1', email: 'user@example.com' }

const mockManagerMembership = createMockMembership({
  id: 'mem-mgr',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'manager' as const,
  status: 'active' as const,
  created_at: '',
})

const mockTrainerMembership = {
  ...mockManagerMembership,
  id: 'mem-trn',
  role: 'trainer' as const,
}

const mockRiderMembership = {
  ...mockManagerMembership,
  id: 'mem-rdr',
  role: 'rider' as const,
}

describe('GuidePage', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    mockReadFileSync.mockReset()
    mockNotFound.mockClear()

    vi.mocked(getAuthenticatedUser).mockResolvedValue(mockUser as any)
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    mockReadFileSync.mockReturnValue('# Guide Content')
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    try { await GuidePage({ params: Promise.resolve({ slug: 'unknown' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)

    try { await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_missing', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    try { await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_inactive', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'pending' as const,
    })

    try { await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_read_manager_guide_for_manager_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)

    await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('USER_GUIDE_MANAGER.md'),
      'utf-8'
    )
  })

  it('should_read_trainer_guide_for_trainer_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('USER_GUIDE_TRAINER.md'),
      'utf-8'
    )
  })

  it('should_read_rider_guide_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('USER_GUIDE_RIDER.md'),
      'utf-8'
    )
  })

  it('should_call_notFound_when_guide_file_cannot_be_read', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    try { await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_markdown_content', async () => {
    mockReadFileSync.mockReturnValue('# Hello Guide')

    const jsx = await GuidePage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('markdown').textContent).toBe('# Hello Guide')
  })
})
