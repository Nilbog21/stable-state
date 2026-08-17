import { describe, it, expect } from 'vitest'
import { parseHeadings } from '../markdown-toc'

describe('parseHeadings', () => {
  it('should_return_h2_headings_in_document_order', () => {
    const { headings } = parseHeadings('# Title\n\n## First\n\n## Second\n')

    expect(headings.map((h) => h.text)).toEqual(['First', 'Second'])
  })

  it('should_capture_h3_headings_at_level_3', () => {
    const { headings } = parseHeadings('## Section\n\n### Detail\n')

    expect(headings.map((h) => h.level)).toEqual([2, 3])
  })

  it('should_skip_h1_and_h4_headings', () => {
    const { headings } = parseHeadings('# Title\n\n#### Too deep\n\n## Kept\n')

    expect(headings.map((h) => h.text)).toEqual(['Kept'])
  })

  it('should_slug_heading_text_as_lowercase_hyphenated', () => {
    const { headings } = parseHeadings('## Outstanding Payments\n')

    expect(headings[0].slug).toBe('outstanding-payments')
  })

  it('should_strip_punctuation_from_slugs', () => {
    const { headings } = parseHeadings('## Profile & Guide: what now?\n')

    expect(headings[0].slug).toBe('profile-guide-what-now')
  })

  it('should_suffix_duplicate_slugs_to_keep_them_unique', () => {
    const { headings } = parseHeadings('## Notes\n\n## Notes\n\n## Notes\n')

    expect(headings.map((h) => h.slug)).toEqual(['notes', 'notes-2', 'notes-3'])
  })

  it('should_key_the_line_map_by_the_headings_source_line', () => {
    const { slugByLine } = parseHeadings('# Title\n\n## First\n\ntext\n\n## Second\n')

    expect(slugByLine.get(3)).toBe('first')
    expect(slugByLine.get(7)).toBe('second')
  })

  it('should_report_the_line_of_the_first_h1', () => {
    const { firstH1Line } = parseHeadings('\n# Title\n\n## Section\n')

    expect(firstH1Line).toBe(2)
  })

  it('should_report_the_first_h1_line_when_a_second_h1_follows', () => {
    const { firstH1Line } = parseHeadings('# One\n\n# Two\n')

    expect(firstH1Line).toBe(1)
  })

  it('should_report_null_when_the_document_has_no_h1', () => {
    const { firstH1Line } = parseHeadings('## Section\n')

    expect(firstH1Line).toBeNull()
  })

  it('should_return_no_headings_for_empty_content', () => {
    const { headings, firstH1Line } = parseHeadings('')

    expect(headings).toEqual([])
    expect(firstH1Line).toBeNull()
  })

  it('should_ignore_a_hash_that_is_not_at_the_start_of_a_line', () => {
    const { headings } = parseHeadings('Some prose ## not a heading\n')

    expect(headings).toEqual([])
  })

  it('should_trim_trailing_whitespace_from_heading_text', () => {
    const { headings } = parseHeadings('##   Spaced Out   \n')

    expect(headings[0].text).toBe('Spaced Out')
  })

  it('should_fall_back_to_a_positional_slug_when_the_heading_has_no_slug_characters', () => {
    const { headings } = parseHeadings('## ???\n')

    expect(headings[0].slug).toBe('section-1')
  })
})
