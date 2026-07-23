export function parseLatestVersion(markdown: string): string | null {
  const match = markdown.match(/^## (v\d+\.\d+\.\d+)/m)
  return match ? match[1] : null
}
