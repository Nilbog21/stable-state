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

const mockReadFileSync = vi.hoisted(() => vi.fn().mockReturnValue('# Changelog'))
vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

import ChangelogPage from '../page'

describe('ChangelogPage', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
    mockReadFileSync.mockReturnValue('# Changelog')
    mockNotFound.mockClear()
  })

  it('should_read_changelog_file', () => {
    ChangelogPage()

    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('CHANGELOG.md'),
      'utf-8'
    )
  })

  it('should_render_markdown_content', () => {
    mockReadFileSync.mockReturnValue('# Hello Changelog')

    const jsx = ChangelogPage()
    render(jsx)

    expect(screen.getByTestId('markdown').textContent).toBe('# Hello Changelog')
  })

  it('should_call_notFound_when_changelog_file_cannot_be_read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    try {
      ChangelogPage()
    } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })
})
