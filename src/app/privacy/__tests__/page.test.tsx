import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
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

const mockReadFileSync = vi.hoisted(() => vi.fn().mockReturnValue('# Privacy Policy'))
vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

import PrivacyPage from '../page'

describe('PrivacyPage', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
    mockReadFileSync.mockReturnValue('# Privacy Policy')
    mockNotFound.mockClear()
  })

  it('should_read_privacy_policy_file', () => {
    PrivacyPage()

    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('PRIVACY_POLICY.md'),
      'utf-8'
    )
  })

  it('should_render_markdown_content', () => {
    mockReadFileSync.mockReturnValue('# Hello Privacy')

    const jsx = PrivacyPage()
    render(jsx)

    expect(screen.getByTestId('markdown').textContent).toBe('# Hello Privacy')
  })

  it('should_call_notFound_when_privacy_file_cannot_be_read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    try {
      PrivacyPage()
    } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })
})
