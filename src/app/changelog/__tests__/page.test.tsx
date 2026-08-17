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

  it('should_render_back_link_to_barns', () => {
    const jsx = ChangelogPage()
    render(jsx)

    expect(
      (screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement).href
    ).toContain('/barns')
  })

  // #1589. `react-markdown` is mocked away above, so this asserts only what `<MarkdownDocument>`
  // adds on top of it: a contents list limited to `##`, which is what routes this page through the
  // component rather than the bare renderer. The `###` half of that contract — an excluded heading
  // keeping its `id` — is asserted against the real pipeline in `MarkdownDocument.test.tsx`.
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
