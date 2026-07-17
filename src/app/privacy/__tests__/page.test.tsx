import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { vi } from 'vitest'

afterEach(cleanup)

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
})
