import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MarkdownDocument } from '../MarkdownDocument'

afterEach(cleanup)

// Renders through the real `react-markdown` — unlike the three page tests, which mock it away.
// The point of this component is what the markdown pipeline emits, so mocking it would assert
// nothing.

const toc = () => screen.getByRole('navigation', { name: /contents/i })

describe('MarkdownDocument', () => {
  it('should_list_every_h2_heading_in_the_table_of_contents', () => {
    render(<MarkdownDocument content={'# Title\n\n## First\n\n## Second\n'} />)

    expect(within(toc()).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'First',
      'Second',
    ])
  })

  it('should_point_each_table_of_contents_link_at_its_headings_id', () => {
    render(<MarkdownDocument content={'# Title\n\n## Outstanding Payments\n'} />)

    const link = within(toc()).getByRole('link')
    expect(link.getAttribute('href')).toBe('#outstanding-payments')
    expect(
      screen.getByRole('heading', { name: 'Outstanding Payments' }).id
    ).toBe('outstanding-payments')
  })

  it('should_give_repeated_headings_distinct_ids_matching_their_links', () => {
    render(<MarkdownDocument content={'# Title\n\n## Notes\n\n## Notes\n'} />)

    const hrefs = within(toc())
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    const ids = screen.getAllByRole('heading', { name: 'Notes' }).map((h) => h.id)

    expect(hrefs).toEqual(['#notes', '#notes-2'])
    expect(ids).toEqual(['notes', 'notes-2'])
  })

  it('should_give_h3_headings_a_linkable_id_too', () => {
    render(<MarkdownDocument content={'# Title\n\n## Section\n\n### Detail\n'} />)

    expect(screen.getByRole('heading', { name: 'Detail' }).id).toBe('detail')
  })

  it('should_place_the_table_of_contents_after_the_document_title', () => {
    render(<MarkdownDocument content={'# Title\n\n## Section\n'} />)

    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.compareDocumentPosition(toc()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('should_place_the_table_of_contents_first_when_the_document_has_no_title', () => {
    render(<MarkdownDocument content={'## Section\n\nbody\n'} />)

    const heading = screen.getByRole('heading', { name: 'Section' })
    expect(heading.compareDocumentPosition(toc()) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('should_render_no_table_of_contents_when_the_document_has_no_sections', () => {
    render(<MarkdownDocument content={'# Title\n\nJust prose.\n'} />)

    expect(screen.queryByRole('navigation', { name: /contents/i })).toBeNull()
  })

  it('should_render_the_documents_body_prose', () => {
    render(<MarkdownDocument content={'# Title\n\nWelcome to the guide.\n'} />)

    expect(screen.getByText('Welcome to the guide.')).toBeTruthy()
  })

  it('should_indent_h3_entries_beneath_their_section', () => {
    render(<MarkdownDocument content={'# Title\n\n## Section\n\n### Detail\n'} />)

    const items = within(toc()).getAllByRole('listitem')
    expect(items[0].className).not.toContain('ml-4')
    expect(items[1].className).toContain('ml-4')
  })

  // #1589. `/changelog` limits its list to `##`, since a document with a `###` per feature area
  // emits a list longer than the reader's screen with entries that repeat verbatim.
  describe('maxTocLevel', () => {
    it('should_omit_h3_entries_from_the_table_of_contents_when_limited_to_h2', () => {
      render(<MarkdownDocument content={'# Title\n\n## Section\n\n### Detail\n'} maxTocLevel={2} />)

      expect(within(toc()).getAllByRole('link').map((a) => a.textContent)).toEqual(['Section'])
    })

    it('should_still_give_an_excluded_h3_its_linkable_id', () => {
      render(<MarkdownDocument content={'# Title\n\n## Section\n\n### Detail\n'} maxTocLevel={2} />)

      expect(screen.getByRole('heading', { name: 'Detail' }).id).toBe('detail')
    })

    it('should_render_no_table_of_contents_when_every_heading_is_excluded', () => {
      render(<MarkdownDocument content={'# Title\n\n### Detail\n'} maxTocLevel={2} />)

      expect(screen.queryByRole('navigation', { name: /contents/i })).toBeNull()
    })
  })
})
