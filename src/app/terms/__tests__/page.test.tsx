import { describe, it, expect, afterEach, vi } from 'vitest'
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

const mockReadFileSync = vi.hoisted(() => vi.fn().mockReturnValue('# Terms of Service'))
vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

import TermsPage from '../page'

describe('TermsPage', () => {
  it('should_render_terms_of_service_markdown_content', async () => {
    mockReadFileSync.mockReturnValue('# Terms of Service\n\nBe nice.')

    const jsx = await TermsPage()
    render(jsx)

    expect(screen.getByTestId('markdown').textContent).toBe('# Terms of Service\n\nBe nice.')
  })

  it('should_read_terms_of_service_file_from_repo_root', async () => {
    await TermsPage()

    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('TERMS_OF_SERVICE.md'),
      'utf-8'
    )
  })

  it('should_call_notFound_when_terms_file_cannot_be_read', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    try { await TermsPage() } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })
})
