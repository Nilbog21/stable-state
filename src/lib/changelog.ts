/**
 * The newest shipped version named in CHANGELOG.md.
 *
 * Not simply the first `## v` heading: since #1589 that heading is the newest *major*, and its
 * patch releases live beneath it as `**vN.0.x — {Month YYYY}.**` lead-ins under `### Later
 * updates` — so the answer is that section's first lead-in whenever the major has shipped one, and
 * the heading itself only for a major with no patches yet. Scoped to the top major's own section
 * so an older major's patches can never win.
 *
 * Every marker below tolerates a whitespace run rather than one literal space, matching
 * `markdown-toc.ts`'s H1 scan for the reason #1556 widened that one: a stray extra space is a
 * plausible hand-edit, and the failure it caused was silent — the wrong version, or none.
 */
export function parseLatestVersion(markdown: string): string | null {
  const major = /^##\s+(v\d+\.\d+\.\d+)/m.exec(markdown)
  if (!major) return null

  const section = markdown.slice(major.index + major[0].length).split(/^##\s/m)[0]
  const patch = /^\*\*\s*(v\d+\.\d+\.\d+)/m.exec(section)
  return patch ? patch[1] : major[1]
}
