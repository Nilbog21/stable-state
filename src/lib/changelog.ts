/**
 * The newest shipped version named in CHANGELOG.md.
 *
 * Not simply the first `## v` heading: since #1589 that heading is the newest *major*, and its
 * patch releases live beneath it as `**vN.0.x — {Month YYYY}.**` lead-ins under `### Later
 * updates` — so the answer is that section's first lead-in whenever the major has shipped one, and
 * the heading itself only for a major with no patches yet. Scoped to the top major's own section
 * so an older major's patches can never win.
 */
export function parseLatestVersion(markdown: string): string | null {
  const major = /^## (v\d+\.\d+\.\d+)/m.exec(markdown)
  if (!major) return null

  const section = markdown.slice(major.index + major[0].length).split(/^## /m)[0]
  const patch = /^\*\*(v\d+\.\d+\.\d+)/m.exec(section)
  return patch ? patch[1] : major[1]
}
