export type TocHeading = {
  level: 2 | 3
  text: string
  slug: string
}

export type ParsedHeadings = {
  headings: TocHeading[]
  /** 1-indexed source line → slug, so a rendered heading can find its own id from `node.position`. */
  slugByLine: Map<number, string>
  firstH1Line: number | null
}

function slugify(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
  return slug || `section-${index + 1}`
}

/**
 * Scans markdown source for its `##`/`###` headings in one pass, returning both halves of the
 * anchor contract at once: the list a table of contents renders from, and the line→slug map a
 * heading renderer looks itself up in. Built together so an `href` and its `id` cannot disagree.
 *
 * Keyed by source line rather than by render order, so the renderer needs no counter state.
 *
 * ponytail: a line scan, not a remark AST walk. Its ceiling is three shapes of CommonMark that
 * remark renders as headings and this does not see — a `#` line inside a fenced code block (a
 * false positive), a setext heading (`Text` over `---`, missed entirely, so it renders with no
 * `id`), and a closing sequence (`## Heading ##`, whose trailing hashes land in the text and the
 * slug). None of the six documents this serves uses any of them. Parse properly if one does.
 *
 * #1589 added the sixth, `CHANGELOG.md`, and it is the one to watch: the other five are hand-
 * curated and rarely touched, while `/finishIssue` Step 3 writes to this one on every patch merge.
 * Its `---` thematic breaks each keep a blank line above them, which is the only thing separating
 * them from setext underlines — close that gap and the heading above renders with no `id`.
 */
export function parseHeadings(content: string): ParsedHeadings {
  const headings: TocHeading[] = []
  const slugByLine = new Map<number, string>()
  const taken = new Map<string, number>()
  let firstH1Line: number | null = null

  content.split('\n').forEach((line, i) => {
    if (firstH1Line === null && /^#\s+\S/.test(line)) {
      firstH1Line = i + 1
      return
    }

    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (!match) return

    const text = match[2]
    const base = slugify(text, headings.length)
    const seen = taken.get(base) ?? 0
    const slug = seen === 0 ? base : `${base}-${seen + 1}`
    taken.set(base, seen + 1)

    headings.push({ level: match[1].length as 2 | 3, text, slug })
    slugByLine.set(i + 1, slug)
  })

  return { headings, slugByLine, firstH1Line }
}
