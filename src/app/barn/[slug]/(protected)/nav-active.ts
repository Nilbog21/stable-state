export function isNavLinkActive(currentPath: string, href: string): boolean {
  const [currentPathname, currentQuery = ''] = currentPath.split('?')
  const [hrefPathname, hrefQuery] = href.split('?')

  const pathMatches = currentPathname === hrefPathname || currentPathname.startsWith(`${hrefPathname}/`)
  if (!pathMatches) return false

  if (hrefQuery === undefined) return true
  return currentPathname === hrefPathname && currentQuery === hrefQuery
}
