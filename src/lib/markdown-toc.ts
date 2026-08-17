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
 * ponytail: a line scan, not a remark AST walk — none of the five documents this serves contains
 * a fenced code block, so there is nothing for `^##` to false-positive on. Parse properly if one
 * ever gains a fenced block containing a `#` line.
 */
export function parseHeadings(content: string): ParsedHeadings {
  const headings: TocHeading[] = []
  const slugByLine = new Map<number, string>()
  const taken = new Map<string, number>()
  let firstH1Line: number | null = null

  content.split('\n').forEach((line, i) => {
    if (firstH1Line === null && /^# \S/.test(line)) {
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
