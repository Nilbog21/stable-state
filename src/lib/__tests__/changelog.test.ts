import { describe, it, expect } from 'vitest'
import { parseLatestVersion } from '../changelog'

describe('parseLatestVersion', () => {
  it('should_extract_version_from_top_heading', () => {
    const markdown = '# Changelog\n\n## v3.0.3 — July 2026\n\nSome notes.'

    expect(parseLatestVersion(markdown)).toBe('v3.0.3')
  })

  it('should_return_null_when_no_version_heading_present', () => {
    const markdown = '# Changelog\n\nNo version headings here.'

    expect(parseLatestVersion(markdown)).toBeNull()
  })
})
