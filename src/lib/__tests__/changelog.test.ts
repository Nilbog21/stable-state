import { describe, it, expect } from 'vitest'
import { parseLatestVersion } from '../changelog'

// Since #1589 the top `## v` heading is the newest *major*, not the newest release — its patches
// sit beneath it as `**vN.0.x — …**` lead-ins under `### Later updates`. Both shapes are here so
// the "no patches yet" case (a freshly cut major) can't regress into the patch branch.
const WITH_PATCHES = `# Changelog

## v3.0.0 — July 2026

### Later updates

**v3.0.4 — July 2026.** **Fixed a thing.** Details.

**v3.0.3 — July 2026.** **Fixed another thing.** Details.

### Lessons

- Something shipped.

## v2.0.0 — June 2026

### Later updates

**v2.0.1 — June 2026.** An older patch.
`

describe('parseLatestVersion', () => {
  it('should_return_the_newest_patch_under_the_top_major', () => {
    expect(parseLatestVersion(WITH_PATCHES)).toBe('v3.0.4')
  })

  it('should_return_the_major_itself_when_it_has_no_patches_yet', () => {
    const markdown = '# Changelog\n\n## v4.0.0 — August 2026\n\n### Lessons\n\n- Something shipped.\n'

    expect(parseLatestVersion(markdown)).toBe('v4.0.0')
  })

  it('should_ignore_patches_belonging_to_an_older_major', () => {
    const markdown =
      '# Changelog\n\n## v4.0.0 — August 2026\n\n### Lessons\n\n- New.\n\n' +
      '## v3.0.0 — July 2026\n\n### Later updates\n\n**v3.0.4 — July 2026.** Old patch.\n'

    expect(parseLatestVersion(markdown)).toBe('v4.0.0')
  })

  // #1556's `markdown-toc.ts` fix (a37407d7 — `#  Title` was silently dropped) was the same defect
  // shape: a marker regex hard-coding one space. Here the cost of a stray one is a `null` or a
  // stale major, which reaches the user as a Changelog link with no version on it.
  it('should_tolerate_extra_whitespace_after_the_heading_and_lead_in_markers', () => {
    const markdown =
      '# Changelog\n\n##  v3.0.0 — July 2026\n\n### Later updates\n\n**  v3.0.4 — July 2026.** Details.\n'

    expect(parseLatestVersion(markdown)).toBe('v3.0.4')
  })

  it('should_return_null_when_no_version_heading_present', () => {
    const markdown = '# Changelog\n\nNo version headings here.'

    expect(parseLatestVersion(markdown)).toBeNull()
  })
})
