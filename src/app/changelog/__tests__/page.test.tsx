import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'

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

// `react-markdown` is deliberately *not* mocked here, unlike the sibling `/terms` and `/privacy`
// page tests. Since #1589 this page's contents list is emitted by `<MarkdownDocument>`'s `h1`
// override, which only fires when the real pipeline walks the document — a stub renderer that
// ignores `components` shows an empty page and asserts nothing.

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

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hello Changelog')
  })

  it('should_render_back_link_to_barns', () => {
    const jsx = ChangelogPage()
    render(jsx)

    expect(
      (screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement).href
    ).toContain('/barns')
  })

  // #1589. The depth limit is this page's own choice, so it is asserted here rather than left to
  // `MarkdownDocument.test.tsx` — a page that dropped `maxTocLevel` would still pass every test
  // that component owns.
  it('should_list_only_the_major_version_headings_in_a_contents_list', () => {
    mockReadFileSync.mockReturnValue('# Changelog\n\n## v3.0.0 — July 2026\n\n### Lessons\n')

    render(ChangelogPage())

    const toc = screen.getByRole('navigation', { name: /contents/i })
    expect(within(toc).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'v3.0.0 — July 2026',
    ])
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
